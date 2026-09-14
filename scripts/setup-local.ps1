[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$OAuthEnvPath,

  [Parameter(Mandatory = $true)]
  [string]$DatabaseEnvPath,

  [Parameter(Mandatory = $true)]
  [string]$PostgresDataPath,

  [string]$AssetDataPath
)

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

function Get-EnvValue {
  param(
    [Parameter(Mandatory = $true)]
    [string[]]$Lines,

    [Parameter(Mandatory = $true)]
    [string]$Name
  )

  $prefix = "$Name="
  $line = $Lines | Where-Object { $_.StartsWith($prefix, [System.StringComparison]::Ordinal) } | Select-Object -Last 1
  if (-not $line) {
    throw "$Name is missing from the supplied environment file."
  }

  return $line.Substring($prefix.Length)
}

$oauthEnv = (Resolve-Path -LiteralPath $OAuthEnvPath).Path
$databaseEnv = (Resolve-Path -LiteralPath $DatabaseEnvPath).Path
$sourceData = (Resolve-Path -LiteralPath $PostgresDataPath).Path
$stateRoot = Get-LocalStateRoot
$targetEnv = Join-Path $stateRoot '.env.local'
$targetData = Join-Path $stateRoot 'postgres'
$targetAssets = Join-Path $stateRoot 'assets'

if (Test-Path -LiteralPath $targetEnv) {
  throw "Local state is already initialized at $stateRoot. Refusing to overwrite its credentials."
}

if (Test-Path -LiteralPath $targetData) {
  throw "Local PostgreSQL state is already initialized at $targetData. Refusing to overwrite it."
}

if (Test-Path -LiteralPath (Join-Path $sourceData 'postmaster.pid')) {
  throw 'The source PostgreSQL cluster is running. Stop it cleanly before copying local state.'
}

$oauthLines = [System.IO.File]::ReadAllLines($oauthEnv)
$databaseLines = [System.IO.File]::ReadAllLines($databaseEnv)
$databaseUrl = Get-EnvValue -Lines $databaseLines -Name 'DATABASE_URL'
$postgresUrl = Get-EnvValue -Lines $databaseLines -Name 'POSTGRES_URL'

$mergedLines = [System.Collections.Generic.List[string]]::new()
foreach ($line in $oauthLines) {
  if ($line.StartsWith('DATABASE_URL=', [System.StringComparison]::Ordinal) -or
      $line.StartsWith('POSTGRES_URL=', [System.StringComparison]::Ordinal) -or
      $line.StartsWith('ROGEROS_ASSET_LOCAL_ROOT=', [System.StringComparison]::Ordinal)) {
    continue
  }
  $mergedLines.Add($line)
}
$mergedLines.Add("DATABASE_URL=$databaseUrl")
$mergedLines.Add("POSTGRES_URL=$postgresUrl")
$mergedLines.Add("ROGEROS_ASSET_LOCAL_ROOT=$targetAssets")

[System.IO.Directory]::CreateDirectory($stateRoot) | Out-Null
[System.IO.File]::WriteAllLines($targetEnv, $mergedLines)
Copy-Item -LiteralPath $sourceData -Destination $targetData -Recurse
if ($AssetDataPath) {
  $sourceAssets = (Resolve-Path -LiteralPath $AssetDataPath).Path
  Copy-Item -LiteralPath $sourceAssets -Destination $targetAssets -Recurse
} else {
  [System.IO.Directory]::CreateDirectory($targetAssets) | Out-Null
}

Write-Host "RogerOS local state initialized at $stateRoot."
Write-Host 'Credentials were copied without being printed. Run npm run dev:local from any checkout.'
