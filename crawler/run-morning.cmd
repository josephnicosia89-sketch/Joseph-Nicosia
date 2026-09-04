@echo off
rem Runs the QuickBooks Desktop export (unless switched off), then the Inwork crawler.
rem Invoked by the scheduled task (see install-task.ps1); safe to run by hand.
setlocal
cd /d "%~dp0.."
if exist "%~dp0..\node\node.exe" set "PATH=%~dp0..\node;%PATH%"
if not exist data\brief mkdir data\brief
echo [%date% %time%] Morning run starting

rem After waking from sleep the network share can take a minute to come back.
rem Wait up to ~4 minutes for the Inwork report to become reachable.
set "REPORT=Q:\Sales Order Inwork Report.xlsm"
set /a TRIES=0
:waitshare
if exist "%REPORT%" goto shareok
if exist "\\esvfs01\quickbooks\Sales Order Inwork Report.xlsm" goto shareok
set /a TRIES+=1
if %TRIES% GEQ 16 (
  echo [%date% %time%] Q: drive still not reachable after %TRIES% tries - running anyway so the crawler can report it
  goto shareok
)
echo [%date% %time%] Waiting for Q: drive ^(try %TRIES%^)
timeout /t 15 /nobreak >nul
goto waitshare
:shareok

if exist "%~dp0quickbooks.off" (
  echo [%date% %time%] QuickBooks export is switched off ^(crawler\quickbooks.off exists^)
) else (
  echo [%date% %time%] QuickBooks export starting
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0quickbooks-export.ps1"
  if errorlevel 1 echo [%date% %time%] QuickBooks export failed - continuing with Inwork report only
)
echo [%date% %time%] Crawler starting
node "%~dp0index.js"
echo [%date% %time%] Done
endlocal
