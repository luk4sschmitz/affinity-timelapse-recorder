# Monta o video MP4 a partir dos frames gravados pelo Timelapse Recorder (Affinity).
# Uso:
#   .\make-timelapse-video.ps1                 -> usa a sessao mais recente, 30 fps
#   .\make-timelapse-video.ps1 -Fps 60         -> 60 fps
#   .\make-timelapse-video.ps1 -SessionDir "C:\...\AffinityTimelapse\meudoc_20260908_193000"
param(
    [string]$SessionDir = "",
    [int]$Fps = 30,
    [switch]$AutoDownload    # baixa o ffmpeg sem perguntar (usado pelo vigia)
)

$ErrorActionPreference = 'Stop'

function Find-FFmpeg {
    $cmd = Get-Command ffmpeg -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    $local = Join-Path $PSScriptRoot "ffmpeg\bin\ffmpeg.exe"
    if (Test-Path $local) { return $local }
    $local2 = Join-Path $PSScriptRoot "ffmpeg\ffmpeg.exe"
    if (Test-Path $local2) { return $local2 }

    Write-Host "ffmpeg nao encontrado." -ForegroundColor Yellow
    if (-not $AutoDownload) {
        $resp = Read-Host "Baixar ffmpeg automaticamente (~180 MB) para a pasta tools\ffmpeg? [S/N]"
        if ($resp -notmatch '^[SsYy]') {
            Write-Host "Instale o ffmpeg (ex.: winget install Gyan.FFmpeg) e rode de novo."
            exit 1
        }
    }
    $zipUrl = "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip"
    $zipPath = Join-Path $env:TEMP "ffmpeg-download.zip"
    Write-Host "Baixando ffmpeg..."
    Invoke-WebRequest -Uri $zipUrl -OutFile $zipPath -UseBasicParsing
    $extractDir = Join-Path $env:TEMP "ffmpeg-extract"
    if (Test-Path $extractDir) { Remove-Item $extractDir -Recurse -Force }
    Expand-Archive -Path $zipPath -DestinationPath $extractDir
    $exe = Get-ChildItem $extractDir -Recurse -Filter ffmpeg.exe | Select-Object -First 1
    if (-not $exe) { Write-Host "Falha ao extrair o ffmpeg."; exit 1 }
    $destDir = Join-Path $PSScriptRoot "ffmpeg\bin"
    New-Item -ItemType Directory -Force $destDir | Out-Null
    Copy-Item (Join-Path $exe.DirectoryName "*.exe") $destDir -Force
    Remove-Item $zipPath -Force
    Remove-Item $extractDir -Recurse -Force
    return (Join-Path $destDir "ffmpeg.exe")
}

# 1) Localiza a sessao
$desktop = [Environment]::GetFolderPath('Desktop')
$base = Join-Path $desktop "AffinityTimelapse"
if (-not $SessionDir) {
    if (-not (Test-Path $base)) { Write-Host "Pasta $base nao existe. Grave um timelapse primeiro."; exit 1 }
    $latest = Get-ChildItem $base -Directory |
        Where-Object { $_.Name -notmatch '^_' } |
        Sort-Object LastWriteTime -Descending |
        Select-Object -First 1
    if (-not $latest) { Write-Host "Nenhuma sessao encontrada em $base."; exit 1 }
    $SessionDir = $latest.FullName
}
if (-not (Test-Path $SessionDir)) { Write-Host "Pasta nao encontrada: $SessionDir"; exit 1 }

# 2) Detecta os frames (jpg ou png)
$ext = $null
foreach ($e in @('jpg', 'png')) {
    if (Test-Path (Join-Path $SessionDir "frame_00000.$e")) { $ext = $e; break }
}
if (-not $ext) { Write-Host "Nenhum frame_00000.jpg/png em $SessionDir."; exit 1 }
$count = (Get-ChildItem $SessionDir -Filter "frame_*.$ext").Count
Write-Host "Sessao: $SessionDir"
Write-Host "$count frames ($ext) -> video a $Fps fps (~$([math]::Round($count / $Fps, 1))s)"

# 3) Monta o video
$ffmpeg = Find-FFmpeg
$outFile = Join-Path $SessionDir ("timelapse_{0}fps.mp4" -f $Fps)
& $ffmpeg -y -framerate $Fps -i (Join-Path $SessionDir "frame_%05d.$ext") `
    -c:v libx264 -pix_fmt yuv420p -crf 18 `
    -vf "scale=trunc(iw/2)*2:trunc(ih/2)*2" `
    $outFile
if ($LASTEXITCODE -ne 0) { Write-Host "ffmpeg falhou (codigo $LASTEXITCODE)."; exit 1 }

Write-Host ""
Write-Host "Video criado: $outFile" -ForegroundColor Green
Start-Process explorer.exe "/select,`"$outFile`""
