param(
    [string]$ProjectRoot = (Get-Location).Path
)

Write-Host "[ALN] Cross-runtime harness starting in $ProjectRoot"

# 1) Detect npm/node in a sanitized way
$npm = (Get-Command npm -ErrorAction SilentlyContinue)
$node = (Get-Command node -ErrorAction SilentlyContinue)

$nodeToolchain = $false
if ($npm -and $node) {
    $nodeToolchain = $true
    Write-Host "[ALN] Node toolchain detected, npm tests ENABLED."
} else {
    Write-Warning "[ALN] npm/node not found. Skipping Node-based tests (no hard failure)."
}

$failures = @()

function Invoke-ALNTest([string]$Id, [string]$Cmd) {
    Write-Host "[ALN] Running test: $Id"
    & powershell -NoProfile -Command $Cmd
    if ($LASTEXITCODE -ne 0) {
        Write-Warning "[ALN] Test FAILED: $Id"
        $script:failures += $Id
    } else {
        Write-Host "[ALN] Test PASSED: $Id"
    }
}

# 2a) Static tests
Invoke-ALNTest "lint-json" "Get-ChildItem -Recurse -Filter *.json | ForEach-Object { Get-Content $_.FullName | ConvertFrom-Json | Out-Null }";

# 2b) ALN validation (uses only PowerShell + regex)
if (Test-Path .aln\tools\Validate-Aln.ps1) {
    Invoke-ALNTest "lint-aln" ".aln\tools\Validate-Aln.ps1";
} else {
    Write-Warning "[ALN] ALN validator script missing -> skipping lint-aln."
}

# 3) Optional Node tests
if ($nodeToolchain -and (Test-Path package.json)) {
    Invoke-ALNTest "node-tests" "npm test";
} else {
    Write-Host "[ALN] Node tests skipped (package.json missing or npm unavailable)."
}

# 4) Optional Python tests
$python = (Get-Command python -ErrorAction SilentlyContinue) -or (Get-Command py -ErrorAction SilentlyContinue)
if ($python) {
    Invoke-ALNTest "python-tests" "if (Get-Command py -ErrorAction SilentlyContinue) { py -m pytest } else { python -m pytest }";
} else {
    Write-Host "[ALN] Python tests skipped (python not found)."
}

# 5) Optional dotnet tests
$dotnet = (Get-Command dotnet -ErrorAction SilentlyContinue)
if ($dotnet -and (Get-ChildItem -Filter *.sln -ErrorAction SilentlyContinue)) {
    Invoke-ALNTest "dotnet-tests" "dotnet test";
} else {
    Write-Host "[ALN] .NET tests skipped (dotnet or solution missing)."
}

if ($failures.Count -gt 0) {
    Write-Error "[ALN] One or more tests failed: $($failures -join ', ')"
    exit 1
}

Write-Host "[ALN] All active tests passed."
