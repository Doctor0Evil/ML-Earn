<#
GitHub-Platform-Improvements.ps1
Aggregated platform improvement helpers: toolchain bootstrap, git identity, aliases, commit/push helper, gh convenience.
Safe for local invocation on Windows PowerShell 5.1+.
#>
[CmdletBinding()]
param(
    [string]$RepoPath = (Get-Location).Path,
    [string]$UserName,
    [string]$UserEmail,
    [switch]$SkipWinget
)

function Write-Section { param([string]$Text) Write-Host "`n=== $Text ===" -ForegroundColor Cyan }

function Ensure-Installed {
    param(
        [Parameter(Mandatory)][string]$CmdName,
        [Parameter(Mandatory)][string]$WingetId
    )
    if (Get-Command $CmdName -ErrorAction SilentlyContinue) {
        Write-Host "'$CmdName' already available."
        return
    }
    if ($SkipWinget) { Write-Warning "Skipping winget install for $CmdName (SkipWinget set)."; return }
    if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
        Write-Warning "winget not found. Install from Microsoft Store: https://aka.ms/getwinget"
        return
    }
    Write-Host "Installing '$CmdName' via winget ($WingetId)..."
    try { winget install -e --id $WingetId --silent } catch { Write-Warning "Install failed for $CmdName: $($_.Exception.Message)" }
}

Write-Section "Toolchain Bootstrap"
Ensure-Installed -CmdName git    -WingetId Git.Git
Ensure-Installed -CmdName gh     -WingetId GitHub.cli
Ensure-Installed -CmdName node   -WingetId OpenJS.NodeJS
Ensure-Installed -CmdName dotnet -WingetId Microsoft.DotNet.SDK.9

Write-Section "Git Identity"
if ($UserName) { git config --global user.name  $UserName }
if ($UserEmail) { git config --global user.email $UserEmail }
git config --global init.defaultBranch main
git config --global pull.rebase true
git config --global rerere.enabled true
git config --global core.autocrlf input

Write-Section "Repo Setup"
if (-not (Test-Path $RepoPath)) { throw "RepoPath '$RepoPath' does not exist." }
Push-Location $RepoPath
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
        if (-not $branch) { $branch = 'main'; git checkout -b $branch 2>$null | Out-Null }
        git add .
        git commit -m $Message 2>$null
        if ($LASTEXITCODE -ne 0) { Write-Host "No changes to commit."; return }
        $remoteExists = git remote 2>$null | Select-String -SimpleMatch $Remote
        if (-not $remoteExists) { Write-Warning "Remote '$Remote' not configured."; return }
        git push $Remote $branch
        Write-Host "Pushed changes to $Remote/$branch" -ForegroundColor Green
    }

    function Invoke-GitHubAuth { gh auth login }
    function Show-GitHubRepoInfo { try { gh repo view --web } catch { Write-Warning "Unable to open repo page." } }

    Write-Host "Helpers loaded: Invoke-GitCommitPush, Invoke-GitHubAuth, Show-GitHubRepoInfo"
}
finally { Pop-Location }

Write-Section "Complete"
Write-Host "GitHub platform improvements script finished."