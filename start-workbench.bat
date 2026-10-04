@echo off
rem Daily AI News Workbench - one click start (Windows)
rem Double click this file to run. Close the window to stop the server.
chcp 65001 >nul
cd /d "%~dp0"
title Daily AI News Workbench

echo ================================
echo  Daily AI News Workbench
echo ================================
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Node.js not found.
  echo.
  echo Please install Node.js 20 or newer from:
  echo   https://nodejs.org/
  echo.
  echo Then double click this file again.
  pause
  exit /b 1
)

for /f "tokens=1 delims=." %%v in ('node -p "process.versions.node"') do set NODE_MAJOR=%%v
if %NODE_MAJOR% LSS 20 (
  echo [ERROR] Node.js version is too old. Need 20 or newer.
  echo Please update from https://nodejs.org/
  pause
  exit /b 1
)
echo [1/3] Node.js version check passed

if exist node_modules (
  echo [2/3] Dependencies already installed, skipping
) else (
  echo [2/3] First run, installing dependencies ^(may take 1-2 minutes^)...
  call npm install
  if errorlevel 1 (
    echo.
    echo [ERROR] npm install failed. Check your network and retry.
    pause
    exit /b 1
  )
)

echo [3/3] Building frontend...
call npm run build
if errorlevel 1 (
  echo.
  echo [ERROR] Build failed.
  pause
  exit /b 1
)

if "%PORT%"=="" set PORT=8787

echo.
echo ================================
echo  Starting... browser will open at http://localhost:%PORT%
echo  Close this window to stop the server.
echo ================================
echo.

start "" http://localhost:%PORT%
call npm start

pause
