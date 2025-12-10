<#
AutoFix-Npm.ps1
Purpose: Automatically ensure Node.js + npm availability, then run ALN projection/validation scripts.
Safeguards: Avoids infinite loops, provides clear exit codes, and prompts user when a new session is needed.
#>
[CmdletBinding()]
param(
    [string]$RepoPath = "C:\Users\Hunter\Repos\Github-Solutions",
    [switch]$SkipInstall
)

$ErrorActionPreference = 'Stop'

function Write-Section { param([string]$Text); Write-Host "`n=== $Text ===" -ForegroundColor Cyan }

function Ensure-ToolInstalled {
    param(
        [Parameter(Mandatory)][string]$CmdName,
        [Parameter(Mandatory)][string]$WingetId
    )
    if (Get-Command $CmdName -ErrorAction SilentlyContinue) {
        Write-Host "'$CmdName' already available."
        return
    }
    Write-Host "Missing '$CmdName'. Attempting winget install ($WingetId)..."
    if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
        Write-Warning "winget not found. Install from Microsoft Store: https://aka.ms/getwinget"
        return
    }
    try {
        winget install -e --id $WingetId --silent
    } catch {
        Write-Warning "Install failed for $CmdName via winget: $($_.Exception.Message)"
    }
}

Write-Section "Toolchain Check"
Ensure-ToolInstalled -CmdName node -WingetId OpenJS.NodeJS

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "Node still not available. Open a NEW PowerShell window after installation completes, then re-run this script."
    exit 1
}

# npm typically bundled with Node; re-check
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    Write-Host "Node is present but npm not recognized yet; new session may be required."
    exit 1
}

Write-Section "Repository Presence"
if (-not (Test-Path $RepoPath)) {
    Write-Warning "RepoPath '$RepoPath' not found. Creating placeholder directory; clone or verify repo before proceeding."
    New-Item -Path $RepoPath -ItemType Directory -Force | Out-Null
}

Push-Location $RepoPath
try {
    if (-not $SkipInstall) {
            Write-Warning "package.json missing; skipping install."
        }
    }

    Write-Section "ALN Projection"
    if (Get-Command npm -ErrorAction SilentlyContinue) {
        if ((Get-Content package.json -Raw) -match 'aln:projection') {
            npm run aln:projection || throw "Projection script failed."
        } else {
            Write-Warning "aln:projection script not defined in package.json."
        }
    }

    Write-Section "Ajv Mesh Sweep"
    if ((Get-Content package.json -Raw) -match 'aln:validate' -or (Get-Content package.json -Raw) -match 'aln:ajv-mesh') {
        if ((Get-Content package.json -Raw) -match 'aln:validate') {
            npm run aln:validate || Write-Warning "aln:validate script failed."
        } elseif ((Get-Content package.json -Raw) -match 'aln:ajv-mesh') {
            npm run aln:ajv-mesh || Write-Warning "aln:ajv-mesh script failed."
        }
    } else {
        Write-Warning "No Ajv validation script defined."
    }

    Write-Section "Severity Gate"
    if ((Get-Content package.json -Raw) -match 'aln:severity-gate' -or (Get-Content package.json -Raw) -match 'aln:sev-gate') {
        if ((Get-Content package.json -Raw) -match 'aln:severity-gate') {
            npm run aln:severity-gate || Write-Warning "Severity gate script failed."
        } elseif ((Get-Content package.json -Raw) -match 'aln:sev-gate') {
            npm run aln:sev-gate || Write-Warning "Severity gate script failed."
        }
    } else {
        Write-Warning "No severity gate script found."
    }
}
finally {
    Pop-Location
}

Write-Section "Completed"
Write-Host "AutoFix-Npm sequence finished."