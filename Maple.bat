@echo off
chcp 65001 >nul
title Maple Character Designer
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 goto no_node

if not exist "node_modules\" (
  echo 처음 실행이라 필요한 파일을 설치합니다. 1~2분 걸립니다...
  call npm install --no-audit --no-fund
  if errorlevel 1 goto install_failed
)

if not exist ".env" copy ".env.example" ".env" >nul

if not exist "data\manifest.json" goto no_data

echo.
echo ==================================================
echo   Maple Character Designer 를 시작합니다.
echo   잠시 후 브라우저가 자동으로 열립니다.
echo.
echo   끝낼 때는 이 창을 닫거나 Ctrl + C 를 누르세요.
echo   인터넷이 없어도 목록, 착용, 랜덤 조합, 저장은 됩니다.
echo   캐릭터 그림은 한 번 본 조합만 인터넷 없이 보입니다.
echo ==================================================
echo.
call npm run dev -- --open
goto end

:no_node
echo [오류] Node.js 가 설치되어 있지 않습니다.
echo https://nodejs.org 에서 LTS 버전을 설치한 뒤 다시 실행하세요.
pause
exit /b 1

:install_failed
echo [오류] 설치에 실패했습니다. 인터넷 연결을 확인한 뒤 다시 실행하세요.
pause
exit /b 1

:no_data
echo [안내] 아이템 데이터가 아직 없습니다.
echo 인터넷이 연결된 상태에서 Maple-update.bat 을 먼저 실행하세요.
pause
exit /b 1

:end
pause
