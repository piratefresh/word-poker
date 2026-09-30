# Shared by the Windows smoke runners (smoke-online.ps1, smoke-online-four.ps1): hidden child
# processes with their own logs, readiness waits, the fixed smoke ports, and a tree-kill cleanup.

$script:children = [System.Collections.Generic.List[System.Diagnostics.Process]]::new()
$script:repoRoot = $null
$script:logDirectory = $null

# A fresh log directory for one run; every child's output lands in it. Returns its path.
function Initialize-SmokeRun([string]$RepoRoot) {
  $script:repoRoot = $RepoRoot
  $script:children.Clear()
  $script:logDirectory = Join-Path ([System.IO.Path]::GetTempPath()) ('wordpoker-smoke-' + [guid]::NewGuid().ToString('N'))
  $null = New-Item -ItemType Directory -Path $script:logDirectory
  [IO.File]::WriteAllText((Join-Path $script:logDirectory 'stdin.txt'), '')
  return $script:logDirectory
}

# Starts a hidden child with its own logs. A -Task is expected to exit (a Maestro run); anything
# else is a service, and Assert-SmokeProcesses fails the run if it does.
function Start-SmokeProcess([string]$Name, [string]$Command, [switch]$Task) {
  Write-Host "Starting $Name..."
  # Encoding keeps paths and quotes intact through Windows' command-line parser.
  $encoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes("& { $Command }; exit " + '$LASTEXITCODE'))
  # A hidden Windows process can inherit invalid stdin; give Node a real file handle.
  $child = Start-Process powershell.exe -ArgumentList @('-NoProfile', '-EncodedCommand', $encoded) -WorkingDirectory $script:repoRoot -WindowStyle Hidden -PassThru -RedirectStandardInput (Join-Path $script:logDirectory 'stdin.txt') -RedirectStandardOutput (Join-Path $script:logDirectory "$Name.out.log") -RedirectStandardError (Join-Path $script:logDirectory "$Name.err.log")
  # Touching the handle now keeps ExitCode readable after the process exits.
  $null = $child.Handle
  $child | Add-Member -NotePropertyName SmokeName -NotePropertyValue $Name
  $child | Add-Member -NotePropertyName SmokeTask -NotePropertyValue ([bool]$Task)
  $script:children.Add($child)
  return $child
}

function Assert-SmokeProcesses {
  foreach ($child in $script:children) {
    if (-not $child.SmokeTask -and $child.HasExited) {
      throw "$($child.SmokeName) exited early (PID $($child.Id)). Read $($script:logDirectory)\$($child.SmokeName).err.log and $($child.SmokeName).out.log."
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
  throw "Timed out waiting for $Description. See logs: $($script:logDirectory)"
}

function Get-SmokeMaestro {
  $null = Get-Command pnpm -ErrorAction Stop
  $maestroCommand = Get-Command maestro -ErrorAction SilentlyContinue
  $maestro = if ($maestroCommand) { $maestroCommand.Source } else { Join-Path $env:USERPROFILE '.maestro\bin\maestro.bat' }
  if (-not (Test-Path -LiteralPath $maestro)) {
    throw 'Maestro was not found on PATH or in ~/.maestro/bin.'
  }
  return $maestro
}

# These two fixed ports belong to the local smoke setup: whatever holds them is stopped.
function Clear-SmokePorts {
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
}

# Colyseus with the deterministic seed gate on, and Expo web on 8081, both waited for. The caller
# sets any extra server environment (WORDPOKER_SMOKE_ROOM) before calling.
function Start-SmokeServers {
  # These environment variables only live in this runner and its children.
  $env:WORDPOKER_DETERMINISTIC_SEED = '1'
  $env:EXPO_PUBLIC_GAME_URL = 'ws://localhost:2567'
  $env:GAME_URL = 'ws://localhost:2567'
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
}

# Kill only the trees this run started, including pnpm wrappers, tsx/Expo children and Chromes.
function Stop-SmokeProcesses {
  foreach ($child in $script:children) {
    if (-not $child.HasExited) {
      try {
        $null = Start-Process taskkill.exe -ArgumentList @('/PID', $child.Id, '/T', '/F') -WindowStyle Hidden -Wait -PassThru
      } catch { Write-Warning "Could not clean up $($child.SmokeName) (PID $($child.Id)): $_" }
    }
  }
}

Export-ModuleMember -Function Initialize-SmokeRun, Start-SmokeProcess, Assert-SmokeProcesses, Wait-SmokeReady, Get-SmokeMaestro, Clear-SmokePorts, Start-SmokeServers, Stop-SmokeProcesses
