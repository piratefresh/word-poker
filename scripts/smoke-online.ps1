# Windows local runner: pnpm smoke:online
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
Import-Module (Join-Path $PSScriptRoot 'smoke-common.psm1') -Force
$result = 1

Push-Location $repoRoot
try {
  $maestro = Get-SmokeMaestro
  $logDirectory = Initialize-SmokeRun $repoRoot
  Clear-SmokePorts
  Write-Host "Logs: $logDirectory"
  $env:TABLE_NAME = 'Smoke Table'
  $env:SEED = '409'
  $env:BEAT_MS = '700'
  Start-SmokeServers

  $null = Start-SmokeProcess 'opponent' 'pnpm --filter @wordpoker/server exec tsx scripts/smoke-opponent.ts'
  $opponentLog = Join-Path $logDirectory 'opponent.out.log'
  Wait-SmokeReady 'the fresh opponent room' {
    $output = Get-Content -LiteralPath $opponentLog -Raw -ErrorAction SilentlyContinue
    return $output -match 'seated at .*table ([A-Za-z0-9_-]+) as '
  } 30
  $output = Get-Content -LiteralPath $opponentLog -Raw
  if ($output -notmatch 'seated at .*table ([A-Za-z0-9_-]+) as ') { throw 'Could not read the opponent room ID.' }
  $roomId = $Matches[1]
  Write-Host "Running headed smoke test in room $roomId..."
  & $maestro test --platform web .maestro/online-hand.yaml -e "ROOM_ID=$roomId"
  $result = $LASTEXITCODE
  if ($result -eq 0) { Write-Host 'Online smoke passed.' }
  else { Write-Host "Online smoke failed (exit $result). Logs: $logDirectory" }
} catch {
  Write-Host "Online smoke failed: $($_.Exception.Message)" -ForegroundColor Red
} finally {
  Write-Host 'Stopping smoke servers and opponent...'
  Stop-SmokeProcesses
  Pop-Location
}
exit $result
