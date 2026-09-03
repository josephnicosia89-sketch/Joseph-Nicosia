<#
.SYNOPSIS
  One-shot installer for the SafeTech morning-brief crawler on the QuickBooks PC.

.DESCRIPTION
  Run this once, in PowerShell, from the folder you unzipped/cloned the repo into:

      powershell -ExecutionPolicy Bypass -File crawler\setup.ps1

  It will:
    1. Check Node.js (installs the LTS build with winget if missing).
    2. npm install.
    3. Write crawler\config.json pointing at Q:\Sales Order Inwork Report.xlsm,
       and record the network path behind Q: so the scheduled task can reach it.
    4. Run the QuickBooks export once (QuickBooks must be open as Admin the first
       time so you can click "Yes, always" in its authorisation dialog).
    5. Run the crawler once and show the headlines.
    6. Register the daily 05:05 scheduled task.
#>
param(
  [string]$InworkPath = 'Q:\Sales Order Inwork Report.xlsm',
  [string]$Time = '05:05',
  [switch]$SkipQuickBooks,
  [switch]$SkipTask
)
$ErrorActionPreference = 'Stop'
# crawler\quickbooks.off switches the QuickBooks half off for setup, the daily task and the crawler.
if (Test-Path (Join-Path $PSScriptRoot 'quickbooks.off')) { $SkipQuickBooks = $true }
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $repo
function Step($n, $msg) { Write-Host ""; Write-Host "[$n] $msg" -ForegroundColor Cyan }

# ── 1. Node.js ──
Step 1 'Checking Node.js'
$portableNode = Join-Path $repo 'node'
if (Test-Path (Join-Path $portableNode 'node.exe')) { $env:Path = "$portableNode;$env:Path" }
$node = Get-Command node -ErrorAction SilentlyContinue
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $node -and -not $isAdmin) {
  Write-Host 'Node.js not found and this window is not running as administrator, so skipping the system installer.'
}
if (-not $node -and $isAdmin) {
  Write-Host 'Node.js not found. Trying winget...'
  try { winget install --id OpenJS.NodeJS.LTS -e --accept-source-agreements --accept-package-agreements } catch { Write-Warning "winget failed: $_" }
  $env:Path = [System.Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [System.Environment]::GetEnvironmentVariable('Path', 'User')
  $node = Get-Command node -ErrorAction SilentlyContinue
}
if (-not $node) {
  # No admin rights (or the prompt was cancelled): use a portable copy inside the repo instead.
  Write-Host 'Installing a portable copy of Node.js into the SafeTech folder (no admin needed)...'
  $index = Invoke-RestMethod -Uri 'https://nodejs.org/dist/index.json'
  $lts = $index | Where-Object { $_.lts } | Select-Object -First 1
  $ver = $lts.version
  $zipName = "node-$ver-win-x64.zip"
  $zipPath = Join-Path $env:TEMP $zipName
  Invoke-WebRequest -Uri "https://nodejs.org/dist/$ver/$zipName" -OutFile $zipPath
  $tmp = Join-Path $env:TEMP 'node-portable'
  if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force }
  Expand-Archive -Path $zipPath -DestinationPath $tmp -Force
  if (Test-Path $portableNode) { Remove-Item $portableNode -Recurse -Force }
  Move-Item (Join-Path $tmp "node-$ver-win-x64") $portableNode
  $env:Path = "$portableNode;$env:Path"
  $userPath = [System.Environment]::GetEnvironmentVariable('Path', 'User')
  if ($userPath -notlike "*$portableNode*") { [System.Environment]::SetEnvironmentVariable('Path', "$portableNode;$userPath", 'User') }
  $node = Get-Command node -ErrorAction SilentlyContinue
  if (-not $node) { throw "Portable Node.js install failed. Expected $portableNode\node.exe" }
}
Write-Host "Node $(node --version) at $($node.Source)"

# ── 2. Dependencies ──
Step 2 'Installing dependencies (npm install)'
npm install --no-audit --no-fund
if ($LASTEXITCODE -ne 0) { throw 'npm install failed' }

# ── 3. Config ──
Step 3 'Writing crawler\config.json'
$driveLetter = ''
$unc = ''
if ($InworkPath -match '^([A-Za-z]:)') {
  $driveLetter = $Matches[1].ToUpper()
  $psd = Get-PSDrive -Name $driveLetter.TrimEnd(':') -ErrorAction SilentlyContinue
  if ($psd -and $psd.DisplayRoot) { $unc = $psd.DisplayRoot }
  if (-not $unc) {
    $line = (net use 2>$null) | Where-Object { $_ -match "\s$driveLetter\s+(\\\\\S+)" }
    if ($line -and $line -match "\s$driveLetter\s+(\\\\\S+)") { $unc = $Matches[1] }
  }
  if ($unc) { Write-Host "Mapped drive $driveLetter -> $unc" } else { Write-Warning "Could not discover the network path behind $driveLetter. The scheduled task may not see the drive letter; add it under driveMap in crawler\config.json later (net use shows it)." }
}
if (-not (Test-Path $InworkPath)) {
  Write-Warning "Cannot see $InworkPath right now. Setup will continue, but the crawler needs this file. Check the drive is connected and the file name is exact."
} else {
  Write-Host "Found $InworkPath (modified $((Get-Item $InworkPath).LastWriteTime))"
}
$oneDrive = $env:OneDriveCommercial; if (-not $oneDrive) { $oneDrive = $env:OneDrive }
if ($oneDrive) { Write-Host "OneDrive sync folder: $oneDrive" } else { Write-Warning 'No OneDrive sync folder detected. The brief files will stay in data\brief and will NOT reach OneDrive\MorningBrief until OneDrive is signed in on this PC.' }

$configPath = Join-Path $PSScriptRoot 'config.json'
$cfg = [ordered]@{
  inworkSource         = $InworkPath
  inworkFallbackSource = ''
  driveMap             = [ordered]@{}
  quickbooksSource     = $(if ($SkipQuickBooks) { '' } else { 'MorningBrief\quickbooks-export.json' })
  outputDir            = 'data/brief'
  publishFolder        = 'MorningBrief'
  publish              = $true
  lookbackDays         = 1
  dueSoonDays          = 7
}
if ($driveLetter -and $unc) { $cfg.driveMap[$driveLetter] = $unc }
if (Test-Path $configPath) {
  Copy-Item $configPath "$configPath.bak" -Force
  Write-Host "Existing config backed up to config.json.bak"
}
[System.IO.File]::WriteAllText($configPath, ($cfg | ConvertTo-Json -Depth 4), (New-Object System.Text.UTF8Encoding($false)))
Write-Host "Wrote $configPath"

# ── 4. QuickBooks export ──
if (-not $SkipQuickBooks) {
  Step 4 'Exporting from QuickBooks Desktop (first run: click "Yes, always" in QuickBooks)'
  try {
    & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'quickbooks-export.ps1')
    if ($LASTEXITCODE -ne 0) { throw "exit code $LASTEXITCODE" }
  } catch {
    Write-Warning "QuickBooks export did not complete: $_"
    Write-Warning 'For the first connection QuickBooks Desktop must be OPEN on this PC, with the company file loaded, signed in as the QuickBooks "Admin" user, in single-user mode. Then re-run: powershell -ExecutionPolicy Bypass -File crawler\quickbooks-export.ps1'
    Write-Warning 'The crawler still works from the Inwork report alone until then.'
  }
} else { Step 4 'QuickBooks export is switched off (crawler\quickbooks.off or -SkipQuickBooks)' }

# ── 5. First crawl ──
Step 5 'Running the crawler'
node (Join-Path $PSScriptRoot 'index.js')
if ($LASTEXITCODE -ne 0) { throw 'Crawler failed. Read the message above; the most common cause is the Inwork path.' }

# ── 6. Schedule ──
if (-not $SkipTask) {
  Step 6 "Registering the daily task at $Time"
  & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'install-task.ps1') -Time $Time
} else { Step 6 'Skipping scheduled task (-SkipTask)' }

Write-Host ""
Write-Host 'Setup complete.' -ForegroundColor Green
Write-Host "Brief files: $repo\data\brief  and  $oneDrive\MorningBrief"
Write-Host 'Tomorrow''s Claude Morning brief will pick up OneDrive\MorningBrief\brief.md automatically.'
