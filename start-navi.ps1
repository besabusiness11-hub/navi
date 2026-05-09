#!/usr/bin/env pwsh
# Start Navi backend + LiveKit agent worker

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$serverDir = Join-Path $root "server"

Write-Host "[Navi] Starting server..."
$server = Start-Process -FilePath "node" -ArgumentList "index.js" `
  -WorkingDirectory $serverDir `
  -RedirectStandardOutput (Join-Path $root "server-out.log") `
  -RedirectStandardError  (Join-Path $root "server-err.log") `
  -PassThru -WindowStyle Hidden

Write-Host "[Navi] Starting agent worker..."
$agent = Start-Process -FilePath "node" -ArgumentList "agent.js", "start" `
  -WorkingDirectory $serverDir `
  -RedirectStandardOutput (Join-Path $root "agent-out.log") `
  -RedirectStandardError  (Join-Path $root "agent-err.log") `
  -PassThru -WindowStyle Hidden

Write-Host "[Navi] Waiting for server..."
Start-Sleep -Seconds 3

try {
  $r = Invoke-WebRequest -Uri "http://localhost:4000/api/voice-token/demo?lang=it" -UseBasicParsing -TimeoutSec 5
  Write-Host "[Navi] Server OK (status $($r.StatusCode))"
} catch {
  Write-Host "[Navi] Server NOT responding: $($_.Exception.Message)"
  Write-Host "Check server-err.log for details"
}

Write-Host ""
Write-Host "Server PID : $($server.Id)"
Write-Host "Agent PID  : $($agent.Id)"
Write-Host ""
Write-Host "Logs:"
Write-Host "  server  -> server-out.log / server-err.log"
Write-Host "  agent   -> agent-out.log  / agent-err.log"
Write-Host ""
Write-Host "To stop: Stop-Process -Id $($server.Id), $($agent.Id)"
