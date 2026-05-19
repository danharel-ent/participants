@echo off
setlocal
cd /d "%~dp0"

title Ticket Manager

echo.
echo Starting: npm run dev
echo Open in browser: http://localhost:3000
echo Press Ctrl+C to stop
echo.

where npm >nul 2>&1
if errorlevel 1 (
  echo ERROR: npm not found. Install Node.js from https://nodejs.org
  echo Then run once in this folder: npm install
  pause
  exit /b 1
)

if not exist "node_modules\" (
  echo Installing dependencies...
  call npm install
  if errorlevel 1 (
    echo ERROR: npm install failed
    pause
    exit /b 1
  )
)

call npm run dev
if errorlevel 1 (
  echo.
  echo ERROR: npm run dev failed
  pause
  exit /b 1
)

pause
endlocal
