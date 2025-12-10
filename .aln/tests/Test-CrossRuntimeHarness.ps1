param(
  [string]$ProjectRoot = (Get-Location).Path
)

Write-Host "[ALN] Running cross-runtime harness (PowerShell) with minimal PATH"

$oldPath = $Env:PATH
$Env:PATH = "C:\Windows\System32;C:\Windows"

Write-Host "[ALN] PATH set to limited value for test: $Env:PATH"

pwsh -NoProfile -ExecutionPolicy Bypass -File .aln\run-tests.ps1

Write-Host "[ALN] Completed harness run"

$Env:PATH = $oldPath

Write-Host "[ALN] Test completed"
