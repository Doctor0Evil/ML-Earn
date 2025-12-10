param(
    [string]$Root = (Get-Location).Path
)

Write-Host "[ALN] Validating .aln files in $Root"

$errors = @()

Get-ChildItem -Recurse -Filter *.aln | ForEach-Object {
    $file = $_.FullName
    $text = Get-Content $file -Raw

    if ($text -notmatch 'aln\s+MODULE\s+\w+') {
        Write-Warning "[ALN] $file: missing 'aln MODULE' header"
        $script:errors += $file
    }
    if ($text -notmatch 'END MODULE') {
        Write-Warning "[ALN] $file: missing 'END MODULE' footer"
        $script:errors += $file
    }
}

if ($errors.Count -gt 0) {
    Write-Error "[ALN] Invalid ALN structure detected in: $($errors -join ', ')"
    exit 1
}

Write-Host "[ALN] All .aln files passed structural validation."
