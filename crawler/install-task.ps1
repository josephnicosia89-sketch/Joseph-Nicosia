<#
.SYNOPSIS
  Registers a Windows scheduled task that runs the QuickBooks export and the
  morning-brief crawler every day before your brief.
.EXAMPLE
  powershell -ExecutionPolicy Bypass -File crawler\install-task.ps1 -Time 05:05
#>
param(
  [string]$Time = '05:05',
  [string]$TaskName = 'SafeTech Morning Brief',
  [switch]$Uninstall
)
# The task runs as the current user in an interactive logon so that mapped
# network drives such as Q: are visible to it. If the PC will be locked or
# logged off at run time, put the UNC path of the share under "driveMap" in
# crawler\config.json instead of relying on the drive letter.
$ErrorActionPreference = 'Stop'
if ($Uninstall) {
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
  Write-Host "Removed task '$TaskName'"
  exit 0
}
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$cmd = Join-Path $PSScriptRoot 'run-morning.cmd'
$action = New-ScheduledTaskAction -Execute 'cmd.exe' -Argument "/c `"`"$cmd`" >> `"$repo\data\brief\crawler.log`" 2>&1`"" -WorkingDirectory $repo
$trigger = New-ScheduledTaskTrigger -Daily -At $Time
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -WakeToRun -ExecutionTimeLimit (New-TimeSpan -Minutes 30) -MultipleInstances IgnoreNew
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Description 'Exports QuickBooks Desktop data and refreshes the Empire Safe Inwork brief in OneDrive\MorningBrief.' -Force | Out-Null
Write-Host "Task '$TaskName' will run daily at $Time. Test it now with: Start-ScheduledTask -TaskName '$TaskName'"
