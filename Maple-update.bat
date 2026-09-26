@echo off
chcp 65001 >nul
title Maple 업데이트
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 goto no_node

echo [1/3] 최신 코드를 받습니다...
git pull origin claude/brave-gates-spmwsv
if errorlevel 1 goto failed

echo.
echo [2/3] 필요한 파일을 설치합니다...
call npm install --no-audit --no-fund
if errorlevel 1 goto failed

if not exist ".env" copy ".env.example" ".env" >nul

echo.
echo [3/3] 아이템 목록을 새로 만듭니다. 아이콘은 받지 않습니다...
call npm run assets:collect -- --limit=0
if errorlevel 1 goto failed

echo.
echo 업데이트 완료. 이제 Maple.bat 으로 실행하세요.
pause
exit /b 0

:no_node
echo [오류] Node.js 가 설치되어 있지 않습니다.
echo https://nodejs.org 에서 LTS 버전을 설치한 뒤 다시 실행하세요.
pause
exit /b 1

:failed
echo.
echo [오류] 업데이트에 실패했습니다. 인터넷 연결을 확인하고, 위에 나온 메시지를 알려 주세요.
pause
exit /b 1
