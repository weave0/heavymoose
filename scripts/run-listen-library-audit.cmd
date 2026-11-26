@echo off
setlocal EnableExtensions
title Heavy Moose - Read Only Music Library Audit

set "MUSIC_ROOT=E:\art\MUSIC\Heavy Moose"
set "AUDIT_FOLDER=E:\art\MUSIC\Heavy Moose Listening Audit"

echo.
echo HEAVY MOOSE - LISTENING ROOM MUSIC AUDIT
echo -----------------------------------------
echo Source: "%MUSIC_ROOT%"
echo Reports: "%AUDIT_FOLDER%"
echo.
echo This only reads audio and writes separate inventory reports.
echo No music will be moved, converted, deleted, uploaded or published.
echo.

if not exist "%MUSIC_ROOT%\" (
  echo ERROR: The E: music folder is unavailable.
  echo Connect the drive or verify its path, then retry.
  pause
  exit /b 1
)
where node >nul 2>nul
if errorlevel 1 (
  echo ERROR: Node.js is unavailable in this Windows session.
  echo This script requires the existing Node.js runtime used by Heavy Moose.
  pause
  exit /b 1
)
node "%~dp0audit-listen-library.cjs" "%MUSIC_ROOT%" --out "%AUDIT_FOLDER%"
if errorlevel 1 (
  echo.
  echo The inventory did not finish. No source recordings were changed.
  pause
  exit /b 1
)
echo.
echo Inventory complete. Share summary.md, inventory.csv and
echo album-suggestions.json to reconcile the full catalog.
echo.
if exist "%AUDIT_FOLDER%\summary.md" start "" "%AUDIT_FOLDER%"
pause
