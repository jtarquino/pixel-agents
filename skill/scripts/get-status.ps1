# Pixel Agents — Get Status (wrapper for cross-platform Node.js script)
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
node "$ScriptDir\get-status.js" @args
