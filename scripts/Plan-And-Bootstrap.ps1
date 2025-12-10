# Github-Solutions Bootstrap & Planning Script
# - Creates Inspect-Wasm.ps1, AutoFix-Npm.ps1, and GitHub-Platform-Improvements.ps1.
# - Avoids infinite loops / indefinite background jobs.
# - Includes safety / non-harm disclaimers.
# - Explains Node / npm / winget requirements and manual-install fallback.

param(
    [string]$RepoRoot = (Get-Location).Path,
    [string]$ScriptsDirName = "scripts"
)

# Resolve script directory
$ScriptsDir = Join-Path $RepoRoot $ScriptsDirName
if (-not (Test-Path $ScriptsDir)) {
    New-Item -Path $ScriptsDir -ItemType Directory -Force | Out-Null
}

# -----------------------------------------------------------------------------
# 1. Inspect-Wasm.ps1 — simple check for "wasm-objdump" (no loops)
# -----------------------------------------------------------------------------

$inspectPath = Join-Path $ScriptsDir "Inspect-Wasm.ps1"
$inspectContent = @'
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

# Simple content check using Select-String
$found = Select-String -Path $Path -Pattern 'wasm-objdump' -Quiet
if ($found) {
    Write-Host "'wasm-objdump' was found in '$Path'."
    exit 0
} else {
    Write-Host "'wasm-objdump' was NOT found in '$Path'."
    exit 2
}
'@

Set-Content -Path $inspectPath -Value $inspectContent -Encoding UTF8

# -----------------------------------------------------------------------------
# 2. AutoFix-Npm.ps1 — handles missing node/npm/winget with clear instructions
# -----------------------------------------------------------------------------

$autoFixPath = Join-Path $ScriptsDir "AutoFix-Npm.ps1"
$autoFixContent = @'
<#
AutoFix-Npm.ps1
Purpose:
- Detects missing node / npm / winget.
- Explains that installing Node / winget may require admin rights.
- Does NOT attempt privileged installation.
- Provides safe guidance and exits cleanly.

    Usage:
      pwsh -File .\scripts\AutoFix-Npm.ps1 -RepoPath C:\Users\Hunter\Repos\Github-Solutions

    IMPORTANT:
      - Install Node.js manually from https://nodejs.org/ (LTS) if not present.
      - To use winget, install "App Installer" from Microsoft Store, then reboot/sign-out.
#>

param(
    [string]$RepoPath = (Get-Location).Path
)

Write-Host "=== AutoFix-Npm.ps1 ==="

$hasNode   = [bool](Get-Command node   -ErrorAction SilentlyContinue)
$hasNpm    = [bool](Get-Command npm    -ErrorAction SilentlyContinue)
$hasWinget = [bool](Get-Command winget -ErrorAction SilentlyContinue)

Write-Host "node available : $hasNode"
Write-Host "npm  available : $hasNpm"
Write-Host "winget available : $hasWinget"

if (-not $hasNode -or -not $hasNpm) {
    Write-Host ""
    Write-Host "Node.js / npm are NOT available in this session."
    Write-Host "To proceed, perform MANUAL installation steps:"
    Write-Host " 1. Download Node.js LTS MSI from https://nodejs.org/en (LTS recommended)."
    Write-Host " 2. Run installer and select 'Add to PATH'."
    Write-Host "  2a. If you cannot run as admin, use a user-local installer or nvm-windows."
    Write-Host " 3. Close ALL PowerShell/terminal windows, then open a NEW one."
    Write-Host " 4. Verify with:  node -v  and  npm -v."
    Write-Host ""
    Write-Host "Optional: To use winget:"
    Write-Host "  - Install 'App Installer' from Microsoft Store."
    Write-Host "  - Sign out / reboot, then run 'winget -v' from a NEW PowerShell window."
    Write-Host ""
    Write-Host "After tools are installed, from repo root run:"
    Write-Host "  cd `"$RepoPath`""
    Write-Host "  npm install"
    Write-Host "  npm run aln:projection"
    Write-Host "  npm run aln:validate"
    Write-Host "  npm run aln:severity-gate"
    exit 1
}

if (-not (Test-Path $RepoPath)) {
    Write-Error "RepoPath '$RepoPath' does not exist."
    exit 1
}

Push-Location $RepoPath
try {
    Write-Host ""
    Write-Host "Running Node / npm smoke test in '$RepoPath'..."
    node -v
    npm -v
    npm install
    npm run aln:projection
    npm run aln:validate
    npm run aln:severity-gate
    Write-Host "Node / npm commands completed."
} finally {
    Pop-Location
}
'@

Set-Content -Path $autoFixPath -Value $autoFixContent -Encoding UTF8

# -----------------------------------------------------------------------------
# 3. GitHub-Platform-Improvements.ps1 — no infinite loops, just helpers
# -----------------------------------------------------------------------------

$platformPath = Join-Path $ScriptsDir "GitHub-Platform-Improvements.ps1"
$platformContent = @'
<#
GitHub-Platform-Improvements.ps1
Purpose:
- Provide safe, one-shot improvements for Git / GitHub workflow.
- No indefinite background jobs or infinite while-loops.
- Adds helpful git aliases and a standardized commit+push helper.

    Usage:
      pwsh -File .\scripts\GitHub-Platform-Improvements.ps1 -RepoPath C:\Users\Hunter\Repos\Github-Solutions -UserName "Your Name" -UserEmail "you@example.com"
#>

param(
    [string]$RepoPath = (Get-Location).Path,
    [string]$UserName,
    [string]$UserEmail
)

Write-Host "=== GitHub Platform Improvements ==="

if (-not (Test-Path $RepoPath)) {
    Write-Error "RepoPath '$RepoPath' does not exist."
    exit 1
}

Push-Location $RepoPath
try {
    if ($UserName)  { git config --global user.name  $UserName }
    if ($UserEmail) { git config --global user.email $UserEmail }

    git config --global init.defaultBranch main
    git config --global pull.rebase true
    git config --global rerere.enabled true
    git config --global core.autocrlf input

    if (-not (Test-Path ".git")) {
        Write-Host "Initializing git repository in '$RepoPath'..."
        git init | Out-Null
    }

    git config alias.st   "status -sb"
    git config alias.co   "checkout"
    git config alias.br   "branch"
    git config alias.cm   "commit -m"
    git config alias.last "log -1 --stat"
    git config alias.lg   "log --oneline --graph --decorate --all"

    function Invoke-GitCommitPush {
        param(
            [string]$Message = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') automated commit",
            [string]$Remote  = "origin"
        )
        $branch = git rev-parse --abbrev-ref HEAD 2>$null
        if (-not $branch) {
            $branch = "main"
            git checkout -b $branch 2>$null | Out-Null
        }

        git add .
        git commit -m $Message 2>$null
        if ($LASTEXITCODE -ne 0) {
            Write-Host "No changes to commit or commit failed."
            return
        }

        $remoteExists = git remote 2>$null | Select-String -SimpleMatch $Remote
        if (-not $remoteExists) {
            Write-Warning "Remote '$Remote' not set. Use 'git remote add $Remote <url>' then re-run."
            return
        }

        git push $Remote $branch
        Write-Host "Pushed to '$Remote/$branch'."
    }

    Write-Host "GitHub platform helpers loaded into current session."
    Write-Host "You can now run: Invoke-GitCommitPush -Message 'your message'"
} finally {
    Pop-Location
}
'@

Set-Content -Path $platformPath -Value $platformContent -Encoding UTF8

# -----------------------------------------------------------------------------
# 4. README note stub (append-only, non-destructive)
# -----------------------------------------------------------------------------

$readmePath = Join-Path $RepoRoot "README.md"
$readmeNote = @"

## Local Tooling Notes (Auto-Generated)

- Node.js and npm are required to run project scripts. Install Node.js LTS from https://nodejs.org/en and ensure 'Add to PATH' is selected in the installer.
- On Windows, the winget CLI depends on the 'App Installer' package from Microsoft Store and typically requires admin rights to install or repair.
- Scripts added:
    - $ScriptsDirName/Inspect-Wasm.ps1 – checks a file for the phrase "wasm-objdump" without modifying it.
    - $ScriptsDirName/AutoFix-Npm.ps1 – detects missing node/npm/winget and prints safe installation guidance.
    - $ScriptsDirName/GitHub-Platform-Improvements.ps1 – configures convenient git settings and aliases with no long-running loops.

These scripts are provided as-is, with the intention of avoiding harmful behavior and respecting user permissions.
"@

if (Test-Path $readmePath) {
    Add-Content -Path $readmePath -Value "`n$readmeNote"
} else {
    Set-Content -Path $readmePath -Value $readmeNote -Encoding UTF8
}

Write-Host ""
Write-Host "Bootstrap complete."
Write-Host "Created/updated:"
Write-Host " - $inspectPath"
Write-Host " - $autoFixPath"
Write-Host " - $platformPath"
Write-Host " - $readmePath"
