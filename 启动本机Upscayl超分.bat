@echo off
chcp 65001 >nul
title 易拉宝 AI 画布 - Upscayl x2 服务
where node >nul 2>&1
if errorlevel 1 (
    echo 电脑里没有找到 Node.js，暂时无法启动本机超分服务。
    echo 请先安装 Node.js 20 或更高版本，再双击本文件。
    pause
    exit /b 1
)
node "%~dp0upscayl-bridge\server.mjs"
echo.
echo 服务已停止。
pause
