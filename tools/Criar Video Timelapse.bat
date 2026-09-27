@echo off
rem Monta o MP4 da sessao de timelapse mais recente (duplo clique).
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0make-timelapse-video.ps1"
pause
