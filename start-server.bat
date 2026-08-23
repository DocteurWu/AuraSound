@echo off
title AuraSound Server Pro
echo ========================================================
echo       AuraSound Music Player - Backend Server HD
echo ========================================================
echo.
echo Activation du bridge USB ADB...
adb reverse tcp:5000 tcp:5000 >nul 2>&1
echo.
echo Demarrage du serveur sur http://0.0.0.0:5000...
node backend\server.js
pause
