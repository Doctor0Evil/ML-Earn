param()

$origDir = Get-Location
$tmp = Join-Path $origDir 'tmpci'
if (-not (Test-Path $tmp)) { New-Item -ItemType Directory -Path $tmp | Out-Null }
Push-Location $tmp

New-Item -ItemType Directory -Path .vscode -Force | Out-Null
"{ `"godot_tools.gdscript_lsp.server_port`": 6000 }" | Out-File -FilePath .vscode\settings.json
Set-Content -Path editor_settings-100.tres -Value '[network]`nlanguage_server/host = "127.0.0.1"`nlanguage_server/port = 6000' -Encoding UTF8
Set-Content -Path ..\godot_lsp.config.json -Value '{ "defaultPort": 6008 }' -Encoding UTF8

# Run the diagnostic CI mode and expect it to fail
$Output = & ..\..\.aln\cli\firewall-apply.ps1 -CiFail 2>&1
$exit = $LASTEXITCODE
Write-Host $Output
if ($exit -eq 0) { Write-Error 'Expected diagnostic CI fail to exit non-zero'; exit 1 }
if ($Output -notmatch '::error') { Write-Error 'Expected ::error annotations in output'; exit 1 }

Pop-Location
Remove-Item -Path $tmp -Recurse -Force
Write-Host 'PowerShell CI-fail test passed'
