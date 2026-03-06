# Pixel Agents — Launch Viewer (Windows)
# Detects the current Copilot CLI session and opens the Electron viewer.

param(
    [string]$Cwd = (Get-Location).Path,
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"
$SessionStateDir = Join-Path $env:USERPROFILE ".copilot\session-state"
$PidFile = Join-Path $env:TEMP "pixel-agents-viewer.pid"

function Normalize-Path([string]$p) {
    $p -replace '\\','/' -replace '/+$','' | ForEach-Object { $_.ToLower() }
}

function Find-Session {
    $targetCwd = Normalize-Path $Cwd
    $bestSession = ""
    $bestMtime = [datetime]::MinValue

    if (-not (Test-Path $SessionStateDir)) {
        Write-Error "No Copilot sessions found at $SessionStateDir"
        exit 1
    }

    foreach ($dir in Get-ChildItem -Path $SessionStateDir -Directory) {
        $workspaceYaml = Join-Path $dir.FullName "workspace.yaml"
        $eventsJsonl = Join-Path $dir.FullName "events.jsonl"
        if (-not (Test-Path $workspaceYaml) -or -not (Test-Path $eventsJsonl)) { continue }

        $content = Get-Content $workspaceYaml -Raw
        if ($content -match "(?m)^cwd:\s*(.+)$") {
            $sessionCwd = Normalize-Path ($Matches[1].Trim())
            if ($sessionCwd -eq $targetCwd) {
                $mtime = (Get-Item $eventsJsonl).LastWriteTime
                if ($mtime -gt $bestMtime) {
                    $bestMtime = $mtime
                    $bestSession = $dir.Name
                }
            }
        }
    }

    # Fallback: most recently modified session
    if ([string]::IsNullOrEmpty($bestSession)) {
        foreach ($dir in Get-ChildItem -Path $SessionStateDir -Directory) {
            $eventsJsonl = Join-Path $dir.FullName "events.jsonl"
            if (-not (Test-Path $eventsJsonl)) { continue }
            $mtime = (Get-Item $eventsJsonl).LastWriteTime
            if ($mtime -gt $bestMtime) {
                $bestMtime = $mtime
                $bestSession = $dir.Name
            }
        }
    }

    return $bestSession
}

$SessionId = Find-Session

if ([string]::IsNullOrEmpty($SessionId)) {
    Write-Error "No active Copilot CLI session found"
    exit 1
}

Write-Host "Found session: $SessionId"

if ($DryRun) {
    Write-Host "DRY_RUN: would launch viewer for session $SessionId"
    exit 0
}

# Kill existing viewer
if (Test-Path $PidFile) {
    $oldPid = Get-Content $PidFile
    try { Stop-Process -Id $oldPid -Force -ErrorAction SilentlyContinue } catch {}
    Remove-Item $PidFile -Force -ErrorAction SilentlyContinue
}

# Launch Electron viewer
$process = Start-Process -FilePath "npx" -ArgumentList "pixel-agents","--session",$SessionId -PassThru -WindowStyle Normal
$process.Id | Out-File $PidFile -Force
Write-Host "Pixel Agents viewer launched — monitoring session $SessionId (PID: $($process.Id))"
