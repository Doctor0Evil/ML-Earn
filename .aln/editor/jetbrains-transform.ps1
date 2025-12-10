param(
  [string]$SourceConfig,
  [string]$TargetConfig,
  [int]$GodotLspPort = 6008
)

Write-Host "[ALN] JetBrains config transform (user-safe) with GodotLspPort=$GodotLspPort"
Write-Host "[ALN] Note: Godot LSP port is governed by Policy.GodotLSPStandard_v1 (default 6008). Do not hardcode other ports unless policy changed."

if (-not (Test-Path $SourceConfig)) {
  Write-Error "[ALN] Source config not found: $SourceConfig"
  exit 1
}

$xml = Get-Content $SourceConfig -Raw
# Normalize known numeric port attributes in LSP-related blocks, without altering other content.
# This pattern handles attributes like port="1234" or <option name="port" value="1234"/>
$xmlUpdated = [regex]::Replace($xml, '(<option\s+name="port"\s+value=")\d+("\s*/>)', { param($m) $m.Groups[1].Value + $GodotLspPort + $m.Groups[2].Value })
$xmlUpdated = [regex]::Replace($xmlUpdated, '(port=" )?\d+(" )?', { param($m) 'port="' + $GodotLspPort + '"' })

# If updates made, write to target preserving structure
if ($xmlUpdated -ne $xml) {
  Copy-Item $SourceConfig $TargetConfig -Force
  $xmlUpdated | Out-File -FilePath $TargetConfig -Encoding UTF8 -Force
  Write-Host "[ALN] JetBrains config copied and normalized to Godot LSP port $GodotLspPort: $TargetConfig"
} else {
  Copy-Item $SourceConfig $TargetConfig -Force
  Write-Host "[ALN] JetBrains config copied, no LSP port normalization applied."
}
