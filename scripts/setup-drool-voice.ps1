param([switch]$SkipModels)
$ErrorActionPreference = 'Stop'

# Explicit, optional setup. Never modifies the ComfyUI Python environment.
if (-not $env:LOCALAPPDATA -or -not $env:APPDATA) { throw 'This setup script requires Windows.' }
$voiceRuntime = Join-Path $env:LOCALAPPDATA 'Drool\voice-runtime'
$voicePython = Join-Path $voiceRuntime 'Scripts\python.exe'
if (-not (Test-Path -LiteralPath $voicePython)) {
    & py -3.12 -m venv $voiceRuntime
    if ($LASTEXITCODE -ne 0) { throw 'Python 3.12 is required to create the isolated voice runtime.' }
}
& $voicePython -m pip install --no-input --timeout 180 'faster-whisper==1.2.1' 'piper-tts==1.8.0'
if ($LASTEXITCODE -ne 0) { throw 'Speech dependency installation failed. Re-run to retry.' }

if (-not $SkipModels) {
    $configPath = Join-Path $PSScriptRoot '..\src-tauri\tauri.conf.json'
    $identifier = (Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json).identifier
    $voiceModels = Join-Path (Join-Path $env:APPDATA $identifier) 'piper_voices'
    New-Item -ItemType Directory -Path $voiceModels -Force | Out-Null
    & $voicePython -m piper.download_voices en_US-lessac-medium --download-dir $voiceModels
    if ($LASTEXITCODE -ne 0) { throw 'Piper voice download failed. Re-run to retry.' }
    & $voicePython -c "from faster_whisper import WhisperModel; WhisperModel('base', device='cpu', compute_type='int8'); print('Whisper base ready')"
    if ($LASTEXITCODE -ne 0) { throw 'Whisper base model setup failed. Re-run to retry.' }
}
& $voicePython -c "import faster_whisper, piper; print('Isolated speech runtime verified')"
if ($LASTEXITCODE -ne 0) { throw 'Speech imports failed.' }
Write-Output 'Start Drool and check engines in Voice Studio. Models were downloaded only when SkipModels was not selected.'
