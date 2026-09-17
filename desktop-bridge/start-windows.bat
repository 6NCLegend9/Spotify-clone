@echo off
setlocal
title HeyKasa Discord Bridge
cd /d "%~dp0"
where node >nul 2>&1
if errorlevel 1 (
  echo HeyKasa Discord Bridge requires Node.js 20 or newer.
  echo Install Node.js, then run this file again.
  pause
  exit /b 1
)
echo Starting HeyKasa Discord Bridge...
node discord-bridge.mjs
if errorlevel 1 (
  echo.
  echo The bridge stopped with an error.
  pause
)
endlocal
