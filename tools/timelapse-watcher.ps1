# Vigia do Timelapse: roda em segundo plano (tarefa agendada no logon).
# Quando o Timelapse Recorder finaliza uma gravacao, ele cria a pasta _render
# dentro da sessao; este vigia detecta, monta o MP4 e abre o Explorer no video.
$ErrorActionPreference = 'Continue'

# instancia unica: se ja houver um vigia rodando, este sai em silencio
$script:mutex = New-Object System.Threading.Mutex($false, 'AffinityTimelapseWatcher')
if (-not $script:mutex.WaitOne(0)) { exit }

$log = Join-Path $PSScriptRoot 'watcher.log'
$maker = Join-Path $PSScriptRoot 'make-timelapse-video.ps1'

function Log($msg) {
    "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $msg" | Add-Content -Path $log -Encoding utf8
    # mantem o log pequeno
    try {
        if ((Get-Item $log -ErrorAction Stop).Length -gt 1MB) {
            Get-Content $log -Tail 200 | Set-Content $log -Encoding utf8
        }
    } catch {}
}

Log "Vigia iniciado (PID $PID)."
$desktop = [Environment]::GetFolderPath('Desktop')
$base = Join-Path $desktop 'AffinityTimelapse'

while ($true) {
    try {
        if (Test-Path $base) {
            $sessions = Get-ChildItem $base -Directory -ErrorAction SilentlyContinue | Where-Object { $_.Name -notmatch '^_' }
            foreach ($s in $sessions) {
                $marker = Join-Path $s.FullName '_render'
                if (Test-Path $marker) {
                    Log "Montando video: $($s.Name)"
                    & powershell -NoProfile -ExecutionPolicy Bypass -File $maker -SessionDir $s.FullName -AutoDownload *> $null
                    $mp4 = Get-ChildItem $s.FullName -Filter 'timelapse_*.mp4' -ErrorAction SilentlyContinue | Select-Object -First 1
                    if ($mp4) {
                        Remove-Item $marker -Recurse -Force
                        Log "OK: $($mp4.Name)"
                    } else {
                        # nao tenta para sempre: marca como falho para inspecao manual
                        Rename-Item $marker '_render_failed' -ErrorAction SilentlyContinue
                        Log "FALHOU: $($s.Name) (marcado _render_failed)"
                    }
                }
            }
        }
    } catch { Log "Erro no loop: $_" }
    Start-Sleep -Seconds 5
}
