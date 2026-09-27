# Instala o vigia do timelapse como tarefa agendada do Windows (logon do usuario)
# e inicia agora. Rode 1x por PC. Requer os arquivos desta pasta tools\.
$ErrorActionPreference = 'Stop'
$watcher = Join-Path $PSScriptRoot 'timelapse-watcher.ps1'
if (-not (Test-Path $watcher)) { Write-Host "timelapse-watcher.ps1 nao encontrado."; exit 1 }

$taskName = 'AffinityTimelapseWatcher'
$action = New-ScheduledTaskAction -Execute 'powershell.exe' `
    -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$watcher`""
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -ExecutionTimeLimit ([TimeSpan]::Zero) -StartWhenAvailable

# remove instancia anterior, registra e inicia
try { Stop-ScheduledTask -TaskName $taskName -ErrorAction Stop } catch {}
try { Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction Stop } catch {}
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings | Out-Null
Start-ScheduledTask -TaskName $taskName

Write-Host "Vigia instalado e rodando. Os MP4s serao gerados automaticamente ao finalizar cada gravacao." -ForegroundColor Green
