@echo off
title HoloStudy LMS
cd /d "%~dp0"
echo.
echo   Starting HoloStudy LMS ...
echo.
where node >nul 2>nul
if errorlevel 1 (
  echo   Node.js was not found. Opening the app directly in your browser instead.
  echo   ^(For phone access + install, please install Node.js from https://nodejs.org^)
  start "" "index.html"
  pause
  exit /b
)
start "HoloStudy LMS server" /min cmd /c "node serve.js 8899"
timeout /t 2 /nobreak >nul
start "" "http://localhost:8899/"
echo   HoloStudy LMS is open in your browser.
echo   On your phone (same Wi-Fi), open the http://192.168... address shown
echo   in the small server window, then use "Add to Home screen".
echo.
echo   Close this window to keep it running, or press any key to STOP the server.
pause >nul
taskkill /fi "WINDOWTITLE eq HoloStudy LMS server*" /f >nul 2>nul
echo   Server stopped.
timeout /t 1 >nul
