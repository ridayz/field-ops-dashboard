@echo off
cd /d "%~dp0"
node src\launcher.mjs
if errorlevel 1 pause
