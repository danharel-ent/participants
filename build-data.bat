@echo off
setlocal
cd /d "%~dp0"

title Build data from CSV

echo.
echo Running: npm run build:data
echo.

where npm >nul 2>&1
if errorlevel 1 (
  echo ERROR: npm not found. Install Node.js from https://nodejs.org
  pause
  exit /b 1
)

call npm run build:data
if errorlevel 1 (
  echo ERROR: build failed
  pause
  exit /b 1
)

echo.
echo Done. Updated folder: data\
pause
endlocal
