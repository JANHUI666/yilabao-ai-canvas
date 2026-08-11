@echo off
chcp 65001 >nul
title 易拉宝 AI 画布 - Upscayl x2 服务
set "NODE_EXE="
where node >nul 2>&1
if not errorlevel 1 set "NODE_EXE=node"
if not defined NODE_EXE if exist "%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" set "NODE_EXE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
if not defined NODE_EXE (
    echo 电脑里没有找到 Node.js，暂时无法启动本机超分服务。
    echo 请先安装 Node.js 20 或更高版本，再双击本文件。
    pause
    exit /b 1
)
echo 正在启动本机 Upscayl x2 服务...
echo 启动成功后请保持这个窗口打开。
echo.
"%NODE_EXE%" "%~dp0upscayl-bridge\server.mjs"
echo.
echo 服务已停止。
pause
