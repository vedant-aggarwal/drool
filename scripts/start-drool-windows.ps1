param([string]$AppPath = '', [switch]$Check)
$ErrorActionPreference = 'Stop'

# An optional, user-invoked desktop launcher. No login/startup hooks or services.
# Starting the installed audio runtime is lazy: it does not load a voice model.
$voiceRoot = Join-Path $env:LOCALAPPDATA 'Drool\audio-runtime'
$voiceLauncher = Join-Path $voiceRoot 'Start-Audio.ps1'
if (-not $AppPath) {
    $candidates = @(
        (Join-Path $env:ProgramFiles 'Drool\locally-uncensored.exe'),
        (Join-Path $env:LOCALAPPDATA 'Drool\locally-uncensored.exe'),
        (Join-Path $env:ProgramFiles 'Locally Uncensored\locally-uncensored.exe'),
        (Join-Path $env:LOCALAPPDATA 'Locally Uncensored\locally-uncensored.exe')
    )
    $AppPath = $candidates | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } | Select-Object -First 1
}
if (-not $AppPath -or -not (Test-Path -LiteralPath $AppPath -PathType Leaf)) {
    throw 'Install Drool first, or pass -AppPath with the installed executable.'
}
if ($Check) {
    [pscustomobject]@{ app = $AppPath; voiceLauncherAvailable = (Test-Path -LiteralPath $voiceLauncher); version = (Get-Item -LiteralPath $AppPath).VersionInfo.ProductVersion }
    return
}
if (Test-Path -LiteralPath $voiceLauncher) {
    try { & $voiceLauncher | Out-Null }
    catch {
        # Optional speech setup must not prevent the main studio from opening.
        $_.Exception.Message | Set-Content -LiteralPath (Join-Path $voiceRoot 'launcher-error.log')
    }
}
Start-Process -FilePath $AppPath -WorkingDirectory (Split-Path -Parent $AppPath)
