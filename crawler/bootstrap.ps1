<#
.SYNOPSIS
  One-line bootstrap for the SafeTech morning-brief crawler. Paste into PowerShell:

    irm https://raw.githubusercontent.com/josephnicosia89-sketch/Joseph-Nicosia/claude/quickbooks-inwork-crawler-t5f46e/crawler/bootstrap.ps1 | iex

  Downloads the code into %USERPROFILE%\SafeTech, runs crawler\setup.ps1, then
  prints a status summary and waits for Enter so the window never closes on you.
#>
$ErrorActionPreference = 'Stop'
$branch = 'claude/quickbooks-inwork-crawler-t5f46e'
$zipUrl = "https://codeload.github.com/josephnicosia89-sketch/Joseph-Nicosia/zip/refs/heads/$branch"
$dest = Join-Path $env:USERPROFILE 'SafeTech'
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'

function Say($m, $c = 'Cyan') { Write-Host $m -ForegroundColor $c }

try {
  Say "== SafeTech crawler bootstrap =="
  Say "PC: $env:COMPUTERNAME   User: $env:USERNAME   Install folder: $dest"

  $zip = Join-Path $env:TEMP "safetech-$stamp.zip"
  $unzip = Join-Path $env:TEMP "safetech-unzip-$stamp"
  Say "Downloading code..."
  Invoke-WebRequest -Uri $zipUrl -OutFile $zip -UseBasicParsing
  Say "  $([math]::Round((Get-Item $zip).Length / 1KB)) KB downloaded"
  Say "Unpacking..."
  Expand-Archive -Path $zip -DestinationPath $unzip
  $src = Get-ChildItem $unzip -Directory | Select-Object -First 1
  if (-not $src -or -not (Test-Path (Join-Path $src.FullName 'crawler\setup.ps1'))) { throw "Unpacked folder does not contain crawler\setup.ps1 (looked in $unzip)" }

  # Never sit inside the install folder while touching it (a previous run may have left us there).
  Set-Location $env:USERPROFILE
  if (Test-Path $dest) {
    Say "Existing $dest found; updating it in place (config, portable Node and dependencies are kept)"
    Get-ChildItem $src.FullName -Force | ForEach-Object {
      $target = Join-Path $dest $_.Name
      if ($_.PSIsContainer) {
        # Copy folder contents over the existing folder, but never overwrite crawler\config.json.
        Get-ChildItem $_.FullName -Recurse -Force -File | ForEach-Object {
          $rel = $_.FullName.Substring($src.FullName.Length + 1)
          if ($rel -ieq 'crawler\config.json') { return }
          $dst = Join-Path $dest $rel
          New-Item -ItemType Directory -Path (Split-Path $dst -Parent) -Force | Out-Null
          Copy-Item $_.FullName $dst -Force
        }
      } else {
        Copy-Item $_.FullName $target -Force
      }
    }
  } else {
    Move-Item $src.FullName $dest
  }
  Say "Code is in place: $(Test-Path (Join-Path $dest 'crawler\setup.ps1'))" 'Green'

  Say ""
  Say "Running the installer (this takes a few minutes; watch for a QuickBooks permission box)..."
  Set-Location $dest
  & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $dest 'crawler\setup.ps1')
  $setupExit = $LASTEXITCODE
}
catch {
  Say "" 'Red'
  Say "BOOTSTRAP STOPPED: $($_.Exception.Message)" 'Red'
  Say "At: $($_.InvocationInfo.PositionMessage)" 'Red'
}

Say ""
Say "== Status =="
$od = $env:OneDriveCommercial; if (-not $od) { $od = $env:OneDrive }
$briefLocal = Join-Path $dest 'data\brief\brief.md'
$briefOd = if ($od) { Join-Path $od 'MorningBrief\brief.md' } else { '' }
"Code folder:        " + $(if (Test-Path (Join-Path $dest 'crawler\index.js')) { $dest } else { 'MISSING' })
"Node:               " + $(if (Test-Path (Join-Path $dest 'node\node.exe')) { 'portable ' + (& (Join-Path $dest 'node\node.exe') --version) } elseif (Get-Command node -ErrorAction SilentlyContinue) { node --version } else { 'MISSING' })
"Dependencies:       " + $(if (Test-Path (Join-Path $dest 'node_modules\xlsx')) { 'installed' } else { 'MISSING' })
"Config:             " + $(if (Test-Path (Join-Path $dest 'crawler\config.json')) { 'written' } else { 'MISSING' })
"Q: drive report:    " + $(if (Test-Path 'Q:\Sales Order Inwork Report.xlsm') { 'visible' } else { 'NOT visible' })
"Brief (local):      " + $(if (Test-Path $briefLocal) { (Get-Item $briefLocal).LastWriteTime } else { 'NOT produced' })
"Brief (OneDrive):   " + $(if ($briefOd -and (Test-Path $briefOd)) { (Get-Item $briefOd).LastWriteTime } else { 'NOT published' })
"QuickBooks export:  " + $(if ($od -and (Test-Path (Join-Path $od 'MorningBrief\quickbooks-export.json'))) { (Get-Item (Join-Path $od 'MorningBrief\quickbooks-export.json')).LastWriteTime } else { 'NOT produced' })
"Scheduled task:     " + $(if (Get-ScheduledTask -TaskName 'SafeTech Morning Brief' -ErrorAction SilentlyContinue) { 'registered' } else { 'NOT registered' })
if (Test-Path $briefLocal) { Say ""; Say "== Brief headlines =="; Get-Content $briefLocal -TotalCount 14 }
Say ""
Say "Copy everything above and paste it back to Claude." 'Yellow'
Read-Host 'Press Enter to close'
