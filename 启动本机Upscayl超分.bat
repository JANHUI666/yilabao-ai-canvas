@echo off
title Yilabao AI Canvas - Upscayl x2
set "NODE_EXE="
where node >nul 2>&1
if not errorlevel 1 set "NODE_EXE=node"
if not defined NODE_EXE if exist "%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" set "NODE_EXE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
if not defined NODE_EXE (
    echo Node.js was not found.
    echo Install Node.js 20 or newer, then open this file again.
    pause
    exit /b 1
)
echo Starting local Upscayl x2 service...
echo KEEP THIS WINDOW OPEN while using the Yilabao AI Canvas.
echo.
"%NODE_EXE%" "%~dp0upscayl-bridge\server.mjs"
echo.
echo The Upscayl x2 service has stopped.
pause
