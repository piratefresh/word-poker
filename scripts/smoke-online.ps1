# Windows local runner: pnpm smoke:online [-Wild] [-Headless]
#   -Wild      the power-ups variant (STO-500): a Wild room at seed 518 and .maestro/online-wild-hand.yaml,
#              and the run fails if the opponent heard the swapped tile or never heard the use.
#   -Headless  --headless --screen-size 1280x1000, as the four-seat runner takes it.
[CmdletBinding()]
param([switch]$Wild, [switch]$Headless)

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
  $env:BEAT_MS = '700'
  if ($Wild) {
    # The opponent's create names no power-up setting, so the server's smoke knob makes it Wild.
    $env:SEED = '518'
    $env:WORDPOKER_SMOKE_ROOM = '{"powerUps":{"deal":"choose3"}}'
    $flow = '.maestro/online-wild-hand.yaml'
  } else {
    $env:SEED = '409'
    Remove-Item Env:WORDPOKER_SMOKE_ROOM -ErrorAction SilentlyContinue
    $flow = '.maestro/online-hand.yaml'
  }
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
  $display = if ($Headless) { @('--headless', '--screen-size', '1280x1000') } else { @() }
  Write-Host "Running $(if ($Headless) { 'headless' } else { 'headed' }) smoke test ($flow) in room $roomId..."
  & $maestro test --platform web @display $flow -e "ROOM_ID=$roomId"
  $result = $LASTEXITCODE

  if ($Wild -and $result -eq 0) {
    # The other half of §44's visibility: the table hears that the browser used Random Wild, and
    # nothing of what it gave. The opponent logs both (smoke-opponent.ts).
    $heard = Get-Content -LiteralPath $opponentLog -Raw
    if ($heard -match 'LEAK:') {
      Write-Host 'The opponent received the swapped tile before the reveal:' -ForegroundColor Red
      Select-String -LiteralPath $opponentLog -Pattern 'LEAK:' | ForEach-Object { Write-Host $_.Line }
      $result = 1
    } elseif ($heard -notmatch 'power used: seat 1 random_wild on the preflop') {
      Write-Host "The opponent never heard the browser's Random Wild." -ForegroundColor Red
      $result = 1
    }
  }

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
