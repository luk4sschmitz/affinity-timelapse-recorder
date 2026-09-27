@echo off
rem De DOIS CLIQUES neste arquivo (1x por PC): instala o vigia que gera o MP4
rem automaticamente sempre que voce finalizar uma gravacao de timelapse.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-auto-video.ps1"
pause
