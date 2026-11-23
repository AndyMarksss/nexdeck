@echo off
setlocal
pushd "%~dp0" || exit /b 1
where.exe node.exe >nul 2>&1
if errorlevel 1 (
  echo Instale o Node.js LTS ^(22 ou mais recente^) em https://nodejs.org/.
  echo Depois feche esta janela e abra NexDeck.cmd novamente.
  popd
  pause
  exit /b 1
)
node.exe start-local.js %*
set "nexdeck_result=%errorlevel%"
popd
if not "%nexdeck_result%"=="0" pause
exit /b %nexdeck_result%
