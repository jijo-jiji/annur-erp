@echo off
title Pusat Tuisyen An Nur ERP - Live Client Demo Launcher
echo ========================================================
echo   Pusat Tuisyen An Nur ERP - System Launcher
echo ========================================================
echo.
echo [1/3] Starting Django REST Backend on http://127.0.0.1:8080 ...
start "An Nur Django (Port 8080)" cmd /k "cd /d "%~dp0backend" && python manage.py runserver 127.0.0.1:8080"
timeout /t 3 /nobreak >nul
echo [2/3] Starting React Vite Frontend on http://127.0.0.1:5173 ...
start "An Nur Vite Frontend" cmd /k "cd /d "%~dp0frontend" && npm run dev"
timeout /t 3 /nobreak >nul
echo [3/3] Starting Cloudflare HTTPS Live Tunnel ...
echo ========================================================
echo Copy the public URL ending with .trycloudflare.com below:
echo ========================================================
"%~dp0cloudflared.exe" tunnel --url http://127.0.0.1:5173
pause
