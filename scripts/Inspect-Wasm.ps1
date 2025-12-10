<#
Inspect-Wasm.ps1
Purpose:
- Safely check whether a given file contains the phrase "wasm-objdump".
- No background jobs or infinite loops.
- For local inspection only; does not modify files.

    Usage:
      pwsh -File .\scripts\Inspect-Wasm.ps1 -Path .\dist\module.wasm.txt
#>

param(
    [Parameter(Mandatory = $true)]
    [string]$Path
)

if (-not (Test-Path $Path)) {
    Write-Error "File not found: $Path"
    exit 1
}

$found = Select-String -Path $Path -Pattern 'wasm-objdump' -Quiet
if ($found) {
    Write-Host "'wasm-objdump' was found in '$Path'."
    exit 0
} else {
    Write-Host "'wasm-objdump' was NOT found in '$Path'."
    exit 2
}