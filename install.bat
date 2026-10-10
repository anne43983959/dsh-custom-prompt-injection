@echo off
chcp 65001 >nul
title dsh-custom-prompt-injection 安装
echo.
echo ============================================
echo    dsh-custom-prompt-injection 安装
echo ============================================
echo.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1" %*
echo.
pause >nul
