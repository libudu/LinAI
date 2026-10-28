param(
  [Parameter(Mandatory = $true)][int]$ParentId,
  [Parameter(Mandatory = $true)][int]$CoreId
)
$ErrorActionPreference = 'Stop'
$coreProcess = $null
$parentProcess = $null
try {
  $coreProcess = [System.Diagnostics.Process]::GetProcessById($CoreId)
  $null = $coreProcess.Handle
  $parentProcess = [System.Diagnostics.Process]::GetProcessById($ParentId)
  $null = $parentProcess.Handle
  while (-not $coreProcess.HasExited) {
    if ($parentProcess.WaitForExit(1000)) {
      if (-not $coreProcess.HasExited) { $coreProcess.Kill() }
      break
    }
  }
} catch {
  if ($null -ne $coreProcess -and -not $coreProcess.HasExited) {
    $coreProcess.Kill()
  }
  exit 1
} finally {
  if ($null -ne $coreProcess) { $coreProcess.Dispose() }
  if ($null -ne $parentProcess) { $parentProcess.Dispose() }
}
