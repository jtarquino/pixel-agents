# Pixel Agents — Close Viewer (Windows)
$PidFile = Join-Path $env:TEMP "pixel-agents-viewer.pid"
if (Test-Path $PidFile) {
    $pid = Get-Content $PidFile
    try {
        Stop-Process -Id $pid -Force -ErrorAction Stop
        Write-Host "Pixel Agents viewer closed (PID: $pid)"
    } catch {
        Write-Host "Viewer process not running"
    }
    Remove-Item $PidFile -Force
} else {
    Write-Host "No viewer PID file found"
}
