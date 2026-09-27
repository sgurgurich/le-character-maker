@echo off
rem With arguments: run a le-char command. Without: open a le-char console.
if not "%~1"=="" (
  node "%~dp0src\cli.js" %*
  exit /b %errorlevel%
)

title le-char - Last Epoch character tool
cd /d "%~dp0"
set "PATH=%~dp0;%PATH%"
echo Last Epoch offline character tool. Close the game before editing.
echo Type "le-char --help" for commands.
echo.
call le-char list
echo.
cmd /k
