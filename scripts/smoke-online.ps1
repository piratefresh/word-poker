# Windows local runner: pnpm smoke:online
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$children = [System.Collections.Generic.List[System.Diagnostics.Process]]::new()
$logDirectory = Join-Path ([System.IO.Path]::GetTempPath()) ('wordpoker-smoke-' + [guid]::NewGuid().ToString('N'))
$result = 1

function Start-SmokeProcess([string]$Name, [string]$Command) {
  Write-Host "Starting $Name..."
  # Encoding keeps paths and quotes intact through Windows' command-line parser.
  $encoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes("& { $Command }; exit " + '$LASTEXITCODE'))
  # A hidden Windows process can inherit invalid stdin; give Node a real file handle.
  $child = Start-Process powershell.exe -ArgumentList @('-NoProfile', '-EncodedCommand', $encoded) -WorkingDirectory $repoRoot -WindowStyle Hidden -PassThru -RedirectStandardInput (Join-Path $logDirectory 'stdin.txt') -RedirectStandardOutput (Join-Path $logDirectory "$Name.out.log") -RedirectStandardError (Join-Path $logDirectory "$Name.err.log")
  $child | Add-Member -NotePropertyName SmokeName -NotePropertyValue $Name
  $children.Add($child)
  return $child
}

function Assert-SmokeProcesses {
  foreach ($child in $children) {
    if ($child.HasExited) {
      throw "$($child.SmokeName) exited early (PID $($child.Id)). Read $logDirectory\$($child.SmokeName).err.log and $($child.SmokeName).out.log."
    }
  }
}

function Wait-SmokeReady([string]$Description, [scriptblock]$Ready, [int]$TimeoutSeconds = 120) {
  Write-Host "Waiting for $Description..."
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    Assert-SmokeProcesses
    if (& $Ready) { return }
    Start-Sleep -Milliseconds 500
  }
  throw "Timed out waiting for $Description. See logs: $logDirectory"
}

Push-Location $repoRoot
try {
  $null = Get-Command pnpm -ErrorAction Stop
  $maestroCommand = Get-Command maestro -ErrorAction SilentlyContinue
  $maestro = if ($maestroCommand) { $maestroCommand.Source } else { Join-Path $env:USERPROFILE '.maestro\bin\maestro.bat' }
  if (-not (Test-Path -LiteralPath $maestro)) {
    throw 'Maestro was not found on PATH or in ~/.maestro/bin.'
  }
  # These two fixed ports belong to the local smoke setup.
  $occupied = @(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object { $_.LocalPort -in @(2567, 8081) })
  foreach ($ownerId in ($occupied.OwningProcess | Sort-Object -Unique)) {
    $ports = ($occupied | Where-Object { $_.OwningProcess -eq $ownerId }).LocalPort -join ', '
    Write-Host "Stopping existing process $ownerId on port(s) $ports..."
    $stopper = Start-Process taskkill.exe -ArgumentList @('/PID', $ownerId, '/T', '/F') -WindowStyle Hidden -Wait -PassThru
    if ($stopper.ExitCode -ne 0 -and (Get-Process -Id $ownerId -ErrorAction SilentlyContinue)) {
      throw "Could not stop process $ownerId. Stop it manually or run this terminal as administrator."
    }
  }
  Wait-SmokeReady 'ports 2567 and 8081 to be free' {
    $remaining = @(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object { $_.LocalPort -in @(2567, 8081) })
    return $remaining.Count -eq 0
  } 15

  $null = New-Item -ItemType Directory -Path $logDirectory
  [IO.File]::WriteAllText((Join-Path $logDirectory 'stdin.txt'), '')
  Write-Host "Logs: $logDirectory"
  # These environment variables only live in this runner and its children.
  $env:WORDPOKER_DETERMINISTIC_SEED = '1'
  $env:EXPO_PUBLIC_GAME_URL = 'ws://localhost:2567'
  $env:GAME_URL = 'ws://localhost:2567'
  $env:TABLE_NAME = 'Smoke Table'
  $env:SEED = '409'
  $env:BEAT_MS = '700'
  $env:BROWSER = 'none'

  $null = Start-SmokeProcess 'server' 'pnpm --filter @wordpoker/server exec tsx src/index.ts'
  $null = Start-SmokeProcess 'web' 'pnpm --filter @wordpoker/mobile web --port 8081'
  Wait-SmokeReady 'Colyseus on port 2567' {
    return [bool](Get-NetTCPConnection -State Listen -LocalPort 2567 -ErrorAction SilentlyContinue)
  }
  Wait-SmokeReady 'Expo web at http://localhost:8081' {
    try {
      $response = Invoke-WebRequest 'http://localhost:8081' -UseBasicParsing -TimeoutSec 5
      return $response.StatusCode -eq 200
    } catch { return $false }
  }

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
  # Kill only the trees we started, including pnpm wrappers and tsx/Expo children.
  foreach ($child in $children) {
    if (-not $child.HasExited) {
      try {
        $null = Start-Process taskkill.exe -ArgumentList @('/PID', $child.Id, '/T', '/F') -WindowStyle Hidden -Wait -PassThru
      } catch { Write-Warning "Could not clean up $($child.SmokeName) (PID $($child.Id)): $_" }
    }
  }
  Pop-Location
}
exit $result
