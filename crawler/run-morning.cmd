@echo off
rem Runs the QuickBooks Desktop export, then the Inwork/QuickBooks crawler.
rem Invoked by the scheduled task (see install-task.ps1); safe to run by hand.
setlocal
cd /d "%~dp0.."
if exist "%~dp0..\node\node.exe" set "PATH=%~dp0..\node;%PATH%"
if not exist data\brief mkdir data\brief
echo [%date% %time%] QuickBooks export starting
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0quickbooks-export.ps1"
if errorlevel 1 (
  echo [%date% %time%] QuickBooks export failed - continuing with Inwork report only
)
echo [%date% %time%] Crawler starting
node "%~dp0index.js"
echo [%date% %time%] Done
endlocal
