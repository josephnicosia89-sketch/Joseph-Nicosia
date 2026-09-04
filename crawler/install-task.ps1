<#
.SYNOPSIS
  Registers the Windows scheduled task that runs the QuickBooks export (if on)
  and the morning-brief crawler every day, waking the PC from sleep if needed.
.EXAMPLE
  powershell -ExecutionPolicy Bypass -File crawler\install-task.ps1 -Time 04:08
.NOTES
  The task runs under your own Windows login in an interactive session, so it
  works while the PC is asleep or locked as long as you stay signed in. That is
  also what OneDrive needs: the sync client only runs while you are signed in,
  and it is what carries brief.md up to OneDrive for the Claude brief to read.
  If the PC is fully shut down, the task runs as soon as it is next started
  (StartWhenAvailable) and the brief for that morning uses the previous file.
#>
param(
  [string]$Time = '04:08',
  [string]$TaskName = 'SafeTech Morning Brief',
  [switch]$Uninstall
)
$ErrorActionPreference = 'Stop'
if ($Uninstall) {
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
  Write-Host "Removed task '$TaskName'"
  exit 0
}
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$cmd = Join-Path $PSScriptRoot 'run-morning.cmd'
if (-not (Test-Path (Join-Path $repo 'data\brief'))) { New-Item -ItemType Directory -Path (Join-Path $repo 'data\brief') -Force | Out-Null }

$action = New-ScheduledTaskAction -Execute 'cmd.exe' -Argument "/c `"`"$cmd`" >> `"$repo\data\brief\crawler.log`" 2>&1`"" -WorkingDirectory $repo
$trigger = New-ScheduledTaskTrigger -Daily -At $Time
$settings = New-ScheduledTaskSettingsSet `
  -WakeToRun `
  -StartWhenAvailable `
  -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
  -RunOnlyIfNetworkAvailable `
  -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 5) `
  -ExecutionTimeLimit (New-TimeSpan -Minutes 45) `
  -MultipleInstances IgnoreNew
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Description 'Reads the Empire Safe Inwork report from the Q: drive and refreshes OneDrive\MorningBrief for the Claude morning brief. Wakes the PC if asleep.' -Force | Out-Null
$info = Get-ScheduledTaskInfo -TaskName $TaskName
Write-Host "Task '$TaskName' will run daily at $Time (next run: $($info.NextRunTime)). It wakes the PC from sleep and retries 3 times if the network is slow to come back."

# ── Wake-from-sleep prerequisites ──
# 1. Wake timers must be allowed in the active power plan (per-plan setting).
$wake = powercfg /Q SCHEME_CURRENT SUB_SLEEP RTCWAKE 2>$null | Out-String
$ac = ($wake | Select-String 'Current AC Power Setting Index:\s*0x(\d+)').Matches
$acVal = if ($ac.Count) { [int]$ac[0].Groups[1].Value } else { -1 }
if ($acVal -eq 1) { Write-Host 'Wake timers: enabled (AC).' }
elseif ($acVal -eq 0) {
  Write-Warning 'Wake timers are DISABLED in the active power plan, so the task cannot wake the PC. Trying to enable them...'
  try {
    powercfg /SETACVALUEINDEX SCHEME_CURRENT SUB_SLEEP RTCWAKE 1 | Out-Null
    powercfg /SETDCVALUEINDEX SCHEME_CURRENT SUB_SLEEP RTCWAKE 1 | Out-Null
    powercfg /SETACTIVE SCHEME_CURRENT | Out-Null
    Write-Host 'Wake timers enabled.'
  } catch {
    Write-Warning 'Could not change the power plan (needs an administrator). Ask IT to enable: Power Options > Change plan settings > Advanced > Sleep > Allow wake timers > Enable.'
  }
} elseif ($acVal -eq 2) { Write-Host 'Wake timers: "Important wake timers only" - scheduled tasks with Wake to run are treated as important on Windows 10/11, so this should work.' }
else { Write-Host 'Wake timers: could not read the power plan setting; check Power Options > Advanced > Sleep > Allow wake timers.' }

# 2. Hibernate cannot be woken by a timer on most PCs; sleep can.
$hib = powercfg /A 2>$null | Out-String
if ($hib -match 'Hibernate' -and $hib -notmatch 'Hibernate\s+\S*\s*(?:is not available|has not been enabled)') {
  Write-Host 'Note: leave the PC in Sleep, not Hibernate, overnight. Windows > Settings > System > Power > Screen and sleep: set "sleep after" as you like, and avoid "hibernate after".'
}
Write-Host "Test it now with:  Start-ScheduledTask -TaskName '$TaskName'   then check data\brief\crawler.log"
