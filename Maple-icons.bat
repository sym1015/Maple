@echo off
chcp 65001 >nul
title Maple 아이콘 받기
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 goto no_node
if not exist "node_modules\" goto no_install
if not exist ".env" copy ".env.example" ".env" >nul

echo 남은 아이콘을 받습니다. 이미 받은 아이콘은 건너뜁니다.
echo 창을 닫으면 멈추고, 다시 실행하면 이어서 받습니다.
echo 받는 중에도 Maple.bat 화면을 새로고침하면 새 아이콘이 보입니다.
echo.
call npm run assets:collect
echo.
echo 끝났습니다. 위의 Failed 숫자가 0이 아니면 이 파일을 한 번 더 실행하세요.
pause
exit /b 0

:no_node
echo [오류] Node.js 가 설치되어 있지 않습니다.
echo https://nodejs.org 에서 LTS 버전을 설치한 뒤 다시 실행하세요.
pause
exit /b 1

:no_install
echo [안내] 먼저 Maple-update.bat 을 실행해 필요한 파일을 설치하세요.
pause
exit /b 1
