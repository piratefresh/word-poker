# Windows local runner: pnpm smoke:online:four [-Headless]
# Four browsers, four Maestro processes, one seeded session (STO-483). The script lives in
# apps/server/scripts/four-seat-scenario.ts; each seat's taps in .maestro/four-seat/seat-N.yaml.
[CmdletBinding()]
param([switch]$Headless)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
Import-Module (Join-Path $PSScriptRoot 'smoke-common.psm1') -Force
$result = 1

# The latest client count the lobby watcher printed for Four Table, and its room id.
function Read-FourTable([string]$WatchLog) {
  $output = Get-Content -LiteralPath $WatchLog -ErrorAction SilentlyContinue
  $latest = $null
  foreach ($line in $output) {
    if ($line -match '^table (\S+) "Four Table" clients=(\d+)') {
      $latest = @{ RoomId = $Matches[1]; Clients = [int]$Matches[2] }
    }
  }
  return $latest
}

Push-Location $repoRoot
try {
  $maestro = Get-SmokeMaestro
  $logDirectory = Initialize-SmokeRun $repoRoot
  Clear-SmokePorts
  Write-Host "Logs: $logDirectory"
  # The lobby form cannot send a seed; the server takes the smoke's knobs from here instead.
  # Keep in step with FOUR_SEAT_ROOM in apps/server/scripts/four-seat-scenario.ts.
  $env:WORDPOKER_SMOKE_ROOM = '{"seed":4111,"payoutDelay":20000,"turnDuration":120000}'
  Start-SmokeServers

  $null = Start-SmokeProcess 'lobby-watch' 'pnpm --filter @wordpoker/server exec tsx scripts/smoke-lobby-watch.ts'
  $watchLog = Join-Path $logDirectory 'lobby-watch.out.log'
  Wait-SmokeReady 'the lobby watcher' {
    return (Get-Content -LiteralPath $watchLog -Raw -ErrorAction SilentlyContinue) -match 'watching the lobby'
  } 60

  # 1000 points tall, not the 800 a bare headless run gets: the home screen keeps its identity
  # row at the very bottom, and a shorter viewport hides it under the fold, where the sign-in
  # subflow asserts on it (`../sign-in.yaml`) and Maestro's web driver cannot scroll it back.
  $display = if ($Headless) { "--headless --screen-size 1280x1000" } else { "" }
  $seats = @()
  $roomId = $null
  foreach ($seat in 1..4) {
    $flow = ".maestro/four-seat/seat-$seat.yaml"
    $output = Join-Path $logDirectory "seat-$seat-output"
    $roomArg = if ($roomId) { "-e 'ROOM_ID=$roomId'" } else { "" }
    $seats += Start-SmokeProcess "seat-$seat" "& '$maestro' test --platform web $display '$flow' --test-output-dir '$output' $roomArg" -Task
    # Staggered: the next browser joins only once this one holds its seat, so join order is
    # seat order and every browser is dealt the rack its flow spells.
    Wait-SmokeReady "P$seat to take its seat" {
      $gone = @($seats | Where-Object { $_.HasExited })
      if ($gone.Count -gt 0) {
        $name = $gone[0].SmokeName
        throw "$name exited while P$seat was sitting down. Read $logDirectory\$name.out.log."
      }
      $table = Read-FourTable $watchLog
      return $null -ne $table -and $table.Clients -ge $seat
    } 240
    $roomId = (Read-FourTable $watchLog).RoomId
    Write-Host "P$seat is seated at Four Table ($roomId)."
  }

  Write-Host 'All four seats are playing...'
  $deadline = (Get-Date).AddMinutes(30)
  while (@($seats | Where-Object { -not $_.HasExited }).Count -gt 0) {
    Assert-SmokeProcesses
    $failed = @($seats | Where-Object { $_.HasExited -and $_.ExitCode -ne 0 })
    if ($failed.Count -gt 0) { break }
    if ((Get-Date) -gt $deadline) { throw 'Timed out waiting for the four seats.' }
    Start-Sleep -Seconds 1
  }

  $failed = @($seats | Where-Object { $_.HasExited -and $_.ExitCode -ne 0 })
  if ($failed.Count -eq 0 -and @($seats | Where-Object { -not $_.HasExited }).Count -eq 0) {
    $result = 0
    Write-Host 'Four-seat online smoke passed.'
  } else {
    foreach ($seat in $failed) {
      Write-Host "$($seat.SmokeName) failed (exit $($seat.ExitCode)): $logDirectory\$($seat.SmokeName).out.log" -ForegroundColor Red
    }
    Write-Host "Four-seat online smoke failed. Logs: $logDirectory"
  }
} catch {
  Write-Host "Four-seat online smoke failed: $($_.Exception.Message)" -ForegroundColor Red
} finally {
  Write-Host 'Stopping seats, smoke servers and the lobby watcher...'
  Stop-SmokeProcesses
  Pop-Location
}
exit $result
