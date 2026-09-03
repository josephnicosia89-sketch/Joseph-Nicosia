<#
.SYNOPSIS
  Pulls open Sales Orders, Invoices, recent Payments and Customer balances out of
  QuickBooks Desktop and writes them to a JSON file the morning-brief crawler reads.

.DESCRIPTION
  Runs on the Windows PC that has QuickBooks Desktop installed. Uses the qbXML
  request processor (QBXMLRP2.RequestProcessor) that ships with QuickBooks
  Desktop, so no extra SDK install is needed. The first run must happen while
  QuickBooks is open with the company file loaded as Admin: QuickBooks will ask
  you to authorise "SafeTech Morning Brief Crawler". Choose "Yes, always; allow
  access even if QuickBooks is not running" so the scheduled task can run
  unattended.

.PARAMETER OutPath
  Where to write quickbooks-export.json. Defaults to the MorningBrief folder in
  your synced OneDrive so Claude can read it through Microsoft 365.

.PARAMETER CompanyFile
  Full path to the .QBW company file. Leave empty to use whatever file is
  currently open in QuickBooks.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File crawler\quickbooks-export.ps1
  powershell -ExecutionPolicy Bypass -File crawler\quickbooks-export.ps1 -CompanyFile "C:\Users\Public\Documents\Intuit\QuickBooks\Company Files\Empire Safe.QBW"
#>
param(
  [string]$OutPath = "",
  [string]$CompanyFile = "",
  [int]$SalesOrderLookbackDays = 730,
  [int]$InvoiceLookbackDays = 365,
  [int]$PaymentLookbackDays = 30,
  [string]$AppName = "SafeTech Morning Brief Crawler"
)

$ErrorActionPreference = 'Stop'

if (-not $OutPath) {
  $root = $env:OneDriveCommercial
  if (-not $root) { $root = $env:OneDrive }
  if (-not $root) { $root = Join-Path $PSScriptRoot '..\data\brief' }
  $OutPath = Join-Path $root 'MorningBrief\quickbooks-export.json'
}
$outDir = Split-Path -Parent $OutPath
if (-not (Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir -Force | Out-Null }

$errors = New-Object System.Collections.ArrayList

function Get-Text($node, $path) {
  if ($null -eq $node) { return '' }
  $n = $node.SelectSingleNode($path)
  if ($null -eq $n) { return '' }
  return [string]$n.InnerText
}
function Get-Bool($node, $path) { return ((Get-Text $node $path) -eq 'true') }
function Get-Num($node, $path) {
  $t = Get-Text $node $path
  if ($t -eq '') { return $null }
  $d = 0.0
  if ([double]::TryParse($t, [System.Globalization.NumberStyles]::Any, [System.Globalization.CultureInfo]::InvariantCulture, [ref]$d)) { return $d }
  return $null
}
function Get-Address($node, $path) {
  $a = $node.SelectSingleNode($path)
  if ($null -eq $a) { return '' }
  $parts = @()
  foreach ($k in 'Addr1','Addr2','Addr3','Addr4','Addr5','City','State','PostalCode','Country') {
    $v = Get-Text $a $k
    if ($v) { $parts += $v }
  }
  return ($parts -join "`n")
}

function Invoke-Qb([string]$innerXml) {
  $xml = @"
<?xml version="1.0" encoding="utf-8"?>
<?qbxml version="13.0"?>
<QBXML>
  <QBXMLMsgsRq onError="continueOnError">
    $innerXml
  </QBXMLMsgsRq>
</QBXML>
"@
  $resp = $script:rp.ProcessRequest($script:ticket, $xml)
  $doc = New-Object System.Xml.XmlDocument
  $doc.LoadXml($resp)
  return $doc
}

# Runs a query that supports iterators and returns every *Ret node.
function Invoke-QbIterated([string]$rqName, [string]$rsName, [string]$retName, [string]$body, [int]$pageSize = 250) {
  $all = New-Object System.Collections.ArrayList
  $iteratorId = ''
  $remaining = 1
  while ($remaining -gt 0) {
    $iterAttr = if ($iteratorId) { "iterator=`"Continue`" iteratorID=`"$iteratorId`"" } else { 'iterator="Start"' }
    $doc = Invoke-Qb "<$rqName requestID=`"1`" $iterAttr><MaxReturned>$pageSize</MaxReturned>$body</$rqName>"
    $rs = $doc.SelectSingleNode("//$rsName")
    if ($null -eq $rs) { [void]$errors.Add("$rqName returned no response"); break }
    $code = [string]$rs.GetAttribute('statusCode')
    if ($code -ne '0' -and $code -ne '1') {
      [void]$errors.Add("$rqName status $code : $($rs.GetAttribute('statusMessage'))")
      break
    }
    foreach ($n in $rs.SelectNodes($retName)) { [void]$all.Add($n) }
    $iteratorId = [string]$rs.GetAttribute('iteratorID')
    $remStr = [string]$rs.GetAttribute('iteratorRemainingCount')
    $remaining = 0
    if ($remStr) { [int]::TryParse($remStr, [ref]$remaining) | Out-Null }
    if (-not $iteratorId) { $remaining = 0 }
  }
  return $all
}

function Read-Lines($ret, $lineName) {
  $lines = @()
  foreach ($l in $ret.SelectNodes($lineName)) {
    $lines += [ordered]@{
      txnLineId   = Get-Text $l 'TxnLineID'
      item        = Get-Text $l 'ItemRef/FullName'
      description = Get-Text $l 'Desc'
      qty         = Get-Num $l 'Quantity'
      rate        = Get-Num $l 'Rate'
      amount      = Get-Num $l 'Amount'
      invoiced    = Get-Num $l 'Invoiced'
      isManuallyClosed = Get-Bool $l 'IsManuallyClosed'
    }
  }
  # Group lines (bundles) carry their own child lines
  foreach ($g in $ret.SelectNodes(($lineName -replace 'LineRet$','LineGroupRet'))) {
    foreach ($l in $g.SelectNodes($lineName)) {
      $lines += [ordered]@{
        txnLineId = Get-Text $l 'TxnLineID'; item = Get-Text $l 'ItemRef/FullName'; description = Get-Text $l 'Desc'
        qty = Get-Num $l 'Quantity'; rate = Get-Num $l 'Rate'; amount = Get-Num $l 'Amount'; invoiced = Get-Num $l 'Invoiced'
        isManuallyClosed = Get-Bool $l 'IsManuallyClosed'; group = Get-Text $g 'ItemGroupRef/FullName'
      }
    }
  }
  return $lines
}

function Read-Linked($ret) {
  $out = @()
  foreach ($l in $ret.SelectNodes('LinkedTxn')) {
    $out += [ordered]@{ txnId = Get-Text $l 'TxnID'; type = Get-Text $l 'TxnType'; date = Get-Text $l 'TxnDate'; refNumber = Get-Text $l 'RefNumber'; amount = Get-Num $l 'Amount' }
  }
  return $out
}

$fmt = 'yyyy-MM-dd'
$soFrom = (Get-Date).AddDays(-$SalesOrderLookbackDays).ToString($fmt)
$invFrom = (Get-Date).AddDays(-$InvoiceLookbackDays).ToString($fmt)
$payFrom = (Get-Date).AddDays(-$PaymentLookbackDays).ToString($fmt)

$rp = $null; $ticket = $null; $company = ''
try {
  try {
    $rp = New-Object -ComObject QBXMLRP2.RequestProcessor
  } catch {
    $msg = "Could not create QBXMLRP2.RequestProcessor. QuickBooks Desktop must be installed on this PC. " +
           "If QuickBooks is 32-bit, run this script with the 32-bit PowerShell: " +
           "C:\Windows\SysWOW64\WindowsPowerShell\v1.0\powershell.exe -File `"$PSCommandPath`""
    throw $msg
  }
  # The first-time permission dialog can only appear inside a QuickBooks window
  # that is already open on this desktop, so check for one before connecting.
  $qbProcs = @(Get-Process | Where-Object { $_.ProcessName -match '^QBW' })
  if ($qbProcs.Count -eq 0) {
    Write-Warning 'QuickBooks Desktop is not running on this PC. If you use QuickBooks through a Remote Desktop window, it runs on another machine and this export must run there instead.'
  } else {
    Write-Host ("QuickBooks window: " + (($qbProcs | ForEach-Object { $_.MainWindowTitle } | Where-Object { $_ }) -join ' | '))
  }

  # 1 = localQBD
  $rp.OpenConnection2('', $AppName, 1)
  # 2 = qbFileOpenDoNotCare
  try {
    $ticket = $rp.BeginSession($CompanyFile, 2)
  } catch {
    $m = $_.Exception.Message
    if ($m -match 'has not accessed this QuickBooks company data file before') {
      Write-Host ''
      Write-Host 'QuickBooks refused the first connection because it could not show its permission dialog. Check, in order:' -ForegroundColor Yellow
      Write-Host '  1. QuickBooks Desktop is open ON THIS PC with the company file loaded (not through a Remote Desktop window).' -ForegroundColor Yellow
      Write-Host '  2. You are signed in to QuickBooks as the user named "Admin", in single-user mode (File menu offers "Switch to Multi-user Mode").' -ForegroundColor Yellow
      Write-Host '  3. QuickBooks is NOT started with "Run as administrator" while this window is a normal user (or vice versa). Right-click the QuickBooks shortcut > Properties > Advanced and match them.' -ForegroundColor Yellow
      Write-Host '  4. No other dialog is open inside QuickBooks.' -ForegroundColor Yellow
      Write-Host 'Then run this script again; QuickBooks will ask once whether to allow "SafeTech Morning Brief Crawler". Choose "Yes, always".' -ForegroundColor Yellow
    }
    throw
  }
  try { $company = $rp.GetCurrentCompanyFileName($ticket) } catch { $company = $CompanyFile }

  Write-Host "Connected to QuickBooks: $company"

  # ── Sales Orders ──
  $soBody = "<TxnDateRangeFilter><FromTxnDate>$soFrom</FromTxnDate></TxnDateRangeFilter><IncludeLineItems>true</IncludeLineItems><IncludeLinkedTxns>true</IncludeLinkedTxns>"
  $soNodes = Invoke-QbIterated 'SalesOrderQueryRq' 'SalesOrderQueryRs' 'SalesOrderRet' $soBody
  $salesOrders = @()
  foreach ($r in $soNodes) {
    $salesOrders += [ordered]@{
      txnId            = Get-Text $r 'TxnID'
      timeModified     = Get-Text $r 'TimeModified'
      txnDate          = Get-Text $r 'TxnDate'
      refNumber        = Get-Text $r 'RefNumber'
      customer         = Get-Text $r 'CustomerRef/FullName'
      shipAddress      = Get-Address $r 'ShipAddress'
      po               = Get-Text $r 'PONumber'
      dueDate          = Get-Text $r 'DueDate'
      shipDate         = Get-Text $r 'ShipDate'
      shipMethod       = Get-Text $r 'ShipMethodRef/FullName'
      salesRep         = Get-Text $r 'SalesRepRef/FullName'
      subtotal         = Get-Num $r 'Subtotal'
      salesTaxTotal    = Get-Num $r 'SalesTaxTotal'
      totalAmount      = Get-Num $r 'TotalAmount'
      isManuallyClosed = Get-Bool $r 'IsManuallyClosed'
      isFullyInvoiced  = Get-Bool $r 'IsFullyInvoiced'
      memo             = Get-Text $r 'Memo'
      customerMsg      = Get-Text $r 'CustomerMsgRef/FullName'
      linkedTxns       = Read-Linked $r
      lines            = Read-Lines $r 'SalesOrderLineRet'
    }
  }
  Write-Host "  Sales orders: $($salesOrders.Count)"

  # ── Invoices (all in window, so paid-to-date on SOs can be computed) ──
  $invBody = "<TxnDateRangeFilter><FromTxnDate>$invFrom</FromTxnDate></TxnDateRangeFilter><IncludeLinkedTxns>true</IncludeLinkedTxns>"
  $invNodes = Invoke-QbIterated 'InvoiceQueryRq' 'InvoiceQueryRs' 'InvoiceRet' $invBody
  $invoices = @()
  foreach ($r in $invNodes) {
    $invoices += [ordered]@{
      txnId            = Get-Text $r 'TxnID'
      txnDate          = Get-Text $r 'TxnDate'
      refNumber        = Get-Text $r 'RefNumber'
      customer         = Get-Text $r 'CustomerRef/FullName'
      dueDate          = Get-Text $r 'DueDate'
      totalAmount      = Get-Num $r 'Subtotal'
      salesTaxTotal    = Get-Num $r 'SalesTaxTotal'
      appliedAmount    = Get-Num $r 'AppliedAmount'
      balanceRemaining = Get-Num $r 'BalanceRemaining'
      isPaid           = Get-Bool $r 'IsPaid'
      memo             = Get-Text $r 'Memo'
      linkedTxns       = Read-Linked $r
    }
  }
  # Subtotal excludes tax; use Subtotal + tax as the invoice total.
  foreach ($i in $invoices) {
    $sub = if ($null -ne $i.totalAmount) { $i.totalAmount } else { 0 }
    $tax = if ($null -ne $i.salesTaxTotal) { $i.salesTaxTotal } else { 0 }
    $i.totalAmount = $sub + $tax
  }
  # Unpaid invoices older than the window still matter for collections.
  $oldUnpaid = Invoke-QbIterated 'InvoiceQueryRq' 'InvoiceQueryRs' 'InvoiceRet' "<TxnDateRangeFilter><ToTxnDate>$invFrom</ToTxnDate></TxnDateRangeFilter><PaidStatus>NotPaidOnly</PaidStatus>"
  foreach ($r in $oldUnpaid) {
    $sub = Get-Num $r 'Subtotal'; $tax = Get-Num $r 'SalesTaxTotal'
    if ($null -eq $sub) { $sub = 0 }
    if ($null -eq $tax) { $tax = 0 }
    $invoices += [ordered]@{
      txnId = Get-Text $r 'TxnID'; txnDate = Get-Text $r 'TxnDate'; refNumber = Get-Text $r 'RefNumber'; customer = Get-Text $r 'CustomerRef/FullName'
      dueDate = Get-Text $r 'DueDate'; totalAmount = ($sub + $tax); salesTaxTotal = $tax
      appliedAmount = Get-Num $r 'AppliedAmount'; balanceRemaining = Get-Num $r 'BalanceRemaining'; isPaid = Get-Bool $r 'IsPaid'; memo = Get-Text $r 'Memo'; linkedTxns = @()
    }
  }
  Write-Host "  Invoices: $($invoices.Count)"

  # ── Payments received ──
  $payBody = "<TxnDateRangeFilter><FromTxnDate>$payFrom</FromTxnDate></TxnDateRangeFilter><IncludeLineItems>true</IncludeLineItems>"
  $payNodes = Invoke-QbIterated 'ReceivePaymentQueryRq' 'ReceivePaymentQueryRs' 'ReceivePaymentRet' $payBody
  $payments = @()
  foreach ($r in $payNodes) {
    $applied = @()
    foreach ($a in $r.SelectNodes('AppliedToTxnRet')) {
      $applied += [ordered]@{ txnId = Get-Text $a 'TxnID'; type = Get-Text $a 'TxnType'; refNumber = Get-Text $a 'RefNumber'; amount = Get-Num $a 'Amount'; balanceRemaining = Get-Num $a 'BalanceRemaining' }
    }
    $payments += [ordered]@{
      txnId         = Get-Text $r 'TxnID'
      txnDate       = Get-Text $r 'TxnDate'
      refNumber     = Get-Text $r 'RefNumber'
      customer      = Get-Text $r 'CustomerRef/FullName'
      totalAmount   = Get-Num $r 'TotalAmount'
      paymentMethod = Get-Text $r 'PaymentMethodRef/FullName'
      memo          = Get-Text $r 'Memo'
      unusedPayment = Get-Num $r 'UnusedPayment'
      appliedTo     = $applied
    }
  }
  Write-Host "  Payments: $($payments.Count)"

  # ── Customer balances ──
  $custNodes = Invoke-QbIterated 'CustomerQueryRq' 'CustomerQueryRs' 'CustomerRet' '<ActiveStatus>ActiveOnly</ActiveStatus>' 500
  $customers = @()
  foreach ($r in $custNodes) {
    $bal = Get-Num $r 'Balance'; $tot = Get-Num $r 'TotalBalance'
    if (($bal -eq $null -or $bal -eq 0) -and ($tot -eq $null -or $tot -eq 0)) { continue }
    $customers += [ordered]@{
      name = Get-Text $r 'FullName'; balance = $bal; totalBalance = $tot
      phone = Get-Text $r 'Phone'; email = Get-Text $r 'Email'; salesRep = Get-Text $r 'SalesRepRef/FullName'
    }
  }
  Write-Host "  Customers with balances: $($customers.Count)"

  $export = [ordered]@{
    exportedAt   = (Get-Date).ToString('o')
    company      = $company
    machine      = $env:COMPUTERNAME
    lookback     = [ordered]@{ salesOrdersFrom = $soFrom; invoicesFrom = $invFrom; paymentsFrom = $payFrom }
    salesOrders  = $salesOrders
    invoices     = $invoices
    payments     = $payments
    customers    = $customers
    errors       = @($errors)
  }
  $json = $export | ConvertTo-Json -Depth 8
  [System.IO.File]::WriteAllText($OutPath, $json, (New-Object System.Text.UTF8Encoding($false)))
  Write-Host "Wrote $OutPath"
}
finally {
  if ($rp -and $ticket) { try { $rp.EndSession($ticket) } catch {} }
  if ($rp) { try { $rp.CloseConnection() } catch {} }
}
