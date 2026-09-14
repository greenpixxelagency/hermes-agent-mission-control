[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Get-LocalStateRoot {
  if ($env:ROGEROS_LOCAL_STATE_DIR) {
    return [System.IO.Path]::GetFullPath($env:ROGEROS_LOCAL_STATE_DIR)
  }

  if (-not $env:LOCALAPPDATA) {
    throw 'LOCALAPPDATA is unavailable. Set ROGEROS_LOCAL_STATE_DIR to a persistent local directory.'
  }

  return Join-Path $env:LOCALAPPDATA 'RogerOS\hermes-agent-mission-control'
}

function Import-EnvFile {
  param([Parameter(Mandatory = $true)][string]$Path)

  foreach ($line in [System.IO.File]::ReadAllLines($Path)) {
    if ($line -notmatch '^[A-Za-z_][A-Za-z0-9_]*=') {
      continue
    }

    $separator = $line.IndexOf('=')
    $name = $line.Substring(0, $separator)
    $value = $line.Substring($separator + 1)
    if ($value.Length -ge 2 -and
        (($value.StartsWith('"') -and $value.EndsWith('"')) -or
         ($value.StartsWith("'") -and $value.EndsWith("'")))) {
      $value = $value.Substring(1, $value.Length - 2)
    }
    [Environment]::SetEnvironmentVariable($name, $value, 'Process')
  }
}

function Find-PgCtl {
  $command = Get-Command pg_ctl.exe -ErrorAction SilentlyContinue
  if ($command) {
    return $command.Source
  }

  $postgresRoot = Join-Path $env:ProgramFiles 'PostgreSQL'
  if (Test-Path -LiteralPath $postgresRoot) {
    $candidate = Get-ChildItem -LiteralPath $postgresRoot -Directory |
      Sort-Object { [int]($_.Name -replace '[^0-9].*$', '') } -Descending |
      ForEach-Object { Join-Path $_.FullName 'bin\pg_ctl.exe' } |
      Where-Object { Test-Path -LiteralPath $_ } |
      Select-Object -First 1
    if ($candidate) {
      return $candidate
    }
  }

  throw 'PostgreSQL pg_ctl.exe was not found. Install PostgreSQL or add its bin directory to PATH.'
}

function Invoke-Checked {
  param(
    [Parameter(Mandatory = $true)][string]$FilePath,
    [Parameter(ValueFromRemainingArguments = $true)][string[]]$Arguments
  )

  & $FilePath @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "$FilePath failed with exit code $LASTEXITCODE."
  }
}

$repositoryRoot = Split-Path -Parent $PSScriptRoot
$stateRoot = Get-LocalStateRoot
$envPath = Join-Path $stateRoot '.env.local'
$postgresData = Join-Path $stateRoot 'postgres'
$postgresLog = Join-Path $stateRoot 'postgres.log'
$assetRoot = Join-Path $stateRoot 'assets'

if (-not (Test-Path -LiteralPath $envPath)) {
  throw "RogerOS local credentials are not initialized at $envPath. Run scripts/setup-local.ps1 once."
}
if (-not (Test-Path -LiteralPath (Join-Path $postgresData 'PG_VERSION'))) {
  throw "RogerOS local PostgreSQL data is not initialized at $postgresData. Run scripts/setup-local.ps1 once."
}

Import-EnvFile -Path $envPath
[System.IO.Directory]::CreateDirectory($assetRoot) | Out-Null

$requiredVariables = @(
  'DATABASE_URL',
  'POSTGRES_URL',
  'NEXTAUTH_URL',
  'NEXTAUTH_SECRET',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'LOCAL_OWNER_EMAIL',
  'ROGEROS_ASSET_LOCAL_ROOT'
)
$missingVariables = @($requiredVariables | Where-Object { -not [Environment]::GetEnvironmentVariable($_, 'Process') })
if ($missingVariables.Count -gt 0) {
  throw ('Local configuration is missing required variables: ' + ($missingVariables -join ', '))
}

$nextAuthUri = [uri]$env:NEXTAUTH_URL
if ($nextAuthUri.Scheme -ne 'http' -or $nextAuthUri.Host -ne 'localhost' -or $nextAuthUri.Port -ne 3001) {
  throw 'NEXTAUTH_URL must be exactly a localhost HTTP URL on port 3001 for this local profile.'
}

$databaseUri = [uri]$env:DATABASE_URL
if ($databaseUri.Host -notin @('127.0.0.1', 'localhost') -or $databaseUri.Port -ne 55432) {
  throw 'DATABASE_URL must target the isolated local PostgreSQL service on 127.0.0.1:55432.'
}

if ([System.IO.Path]::GetFullPath($env:ROGEROS_ASSET_LOCAL_ROOT) -ne [System.IO.Path]::GetFullPath($assetRoot)) {
  throw 'ROGEROS_ASSET_LOCAL_ROOT must use the persistent RogerOS local state directory.'
}

$pgCtl = Find-PgCtl
& $pgCtl status -D $postgresData *> $null
if ($LASTEXITCODE -ne 0) {
  Write-Host 'Starting isolated RogerOS PostgreSQL...'
  Invoke-Checked -FilePath $pgCtl -Arguments @('start', '-w', '-D', $postgresData, '-l', $postgresLog, '-o', '-p 55432 -h 127.0.0.1')
} else {
  Write-Host 'Isolated RogerOS PostgreSQL is already running.'
}

Push-Location $repositoryRoot
try {
  Write-Host 'Synchronizing the local schema...'
  Invoke-Checked -FilePath 'node' -Arguments @('node_modules/prisma/build/index.js', 'db', 'push', '--schema', 'prisma/schema.prisma', '--skip-generate', '--accept-data-loss')

  Write-Host 'Synchronizing local catalog and owner membership...'
  Invoke-Checked -FilePath 'node' -Arguments @('--import', 'tsx', 'prisma/seed-local.ts')

  Write-Host 'Starting RogerOS at http://localhost:3001'
  Invoke-Checked -FilePath 'node' -Arguments @('node_modules/next/dist/bin/next', 'dev', '--webpack', '-H', 'localhost', '-p', '3001')
} finally {
  Pop-Location
}
