param(
  [int]$ForcePort = 0,
  [switch]$AllowLoopback,
  [switch]$Apply,
  [switch]$Confirm,
  [switch]$SimulateApply,
  [switch]$Diagnostics,
  [switch]$CiFail,
  [string]$PolicyLockfile = ".aln/firewall.policy.lock.json"
)

Write-Host "[ALN] Firewall apply bootstrap"

if ($Diagnostics) {
  Write-Host "[ALN] Diagnostics for firewall apply (scope: godot)"
  Write-Host "Forced port:" $(if ($ForcePort -ne 0) { $ForcePort } else { 'none' })
  Write-Host "Loopback would be allowed:" $AllowLoopback
  Write-Host "Policy lockfile present: " (Test-Path $PolicyLockfile)
  if (Test-Path $PolicyLockfile) {
    try { Get-Content $PolicyLockfile -Raw | ConvertFrom-Json | Out-Null } catch { Write-Error "Policy lockfile exists but is invalid JSON"; exit 2 }
  }
  exit 0
}

if ($CiFail) {
  Write-Host "[ALN] CI diagnostics (fail on mismatch) for Godot LSP"
  $issues = @()
  $expectedPort = 6008
  if (Test-Path "godot_lsp.config.json") {
    try { $cfg = Get-Content "godot_lsp.config.json" -Raw | ConvertFrom-Json -ErrorAction Stop; if ($cfg.defaultPort) { $expectedPort = [int]$cfg.defaultPort } } catch { }
  }
  Write-Host "[ALN] Expected LSP port: $($expectedPort)"

  # Check editor_settings TRES files
  Get-ChildItem -Recurse -Filter 'editor_settings*.tres' | ForEach-Object {
    $file = $_.FullName
    $text = Get-Content $file -Raw
    $m = [regex]::Match($text, 'language_server/port\s*=\s*(\d+)', 'IgnoreCase')
    if (-not $m.Success) {
      $issues += @{ file = $file; issue = 'missing_port' }
      Write-Host ("::error file={0},line=1::Editor settings missing language_server/port (expected {1})" -f $file,$expectedPort)
    } else {
      $p = [int]$m.Groups[1].Value
      if ($p -ne $expectedPort) {
        $issues += @{ file = $file; issue = 'port_mismatch'; value = $p }
        Write-Host ("::error file={0},line=1::Editor settings language_server/port {1} does not match policy expected {2}" -f $file, $p, $expectedPort)
      }
    }
  }

  # Check VS Code settings
  $vsc = '.vscode/settings.json'
  if (Test-Path $vsc) {
    try { $s = Get-Content $vsc -Raw | ConvertFrom-Json -ErrorAction Stop } catch { $s = $null }
    if ($null -eq $s) {
      $issues += @{ file = $vsc; issue = 'vscode_parse_error' }
      Write-Host ("::error file={0},line=1::VS Code settings could not be parsed as JSON" -f $vsc)
    } else {
      $portCandidates = @($s.'godot_tools.lsp.port', $s.'godot_tools.gdscript_lsp.server_port', $s.'godot_tools.gdscript_lsp.port')
      $p = $portCandidates | Where-Object { $_ -ne $null } | Select-Object -First 1
      if ($null -eq $p) {
        $issues += @{ file = $vsc; issue = 'vscode_port_missing' }
        Write-Host ("::error file={0},line=1::VS Code settings missing Godot LSP port (expected {1})" -f $vsc, $expectedPort)
      } else {
        if ([int]$p -ne $expectedPort) {
          $issues += @{ file = $vsc; issue = 'vscode_port_mismatch'; value = [int]$p }
          Write-Host ("::error file={0},line=1::VS Code settings port {1} does not match expected {2}" -f $vsc, $p, $expectedPort)
        }
      }
    }
  } else {
    $issues += @{ file = $vsc; issue = 'vscode_missing' }
    Write-Host ("::error file={0},line=1::VS Code settings.json missing; expected to set Godot LSP host/port to {1}" -f $vsc, $expectedPort)
  }

  # Check policy lockfile
  if (Test-Path $PolicyLockfile) {
    try { $lock = Get-Content $PolicyLockfile -Raw | ConvertFrom-Json -ErrorAction Stop } catch { $issues += @{ file = $PolicyLockfile; issue = 'policy_parse_error' }; Write-Host ("::error file={0},line=1::Policy lockfile invalid JSON or missing required fields" -f $PolicyLockfile) }
    if ($null -ne $lock) {
      if (-not $lock.allow_firewall_apply) {
        $issues += @{ file = $PolicyLockfile; issue = 'policy_opt_out' }
        Write-Host ("::error file={0},line=1::Policy lockfile indicates firewall apply is NOT allowed (allow_firewall_apply=false)." -f $PolicyLockfile)
      }
    }
  } else {
    $issues += @{ file = $PolicyLockfile; issue = 'policy_missing' }
    Write-Host ("::error file={0},line=1::Policy lockfile $PolicyLockfile not found; create one to enable policy-locked firewall changes" -f $PolicyLockfile)
  }

  if ($issues.Count -gt 0) {
    Write-Host "[ALN] CI diagnostics found $($issues.Count) issue(s)."
    exit 1
  } else {
    Write-Host "[ALN] CI diagnostics: no issues found."
    exit 0
  }
}

if ($ForcePort -ne 0 -and ($ForcePort -lt 1 -or $ForcePort -gt 65535)) {
  Write-Error "[ALN] --force-port must be between 1 and 65535."
  exit 1
}

if ($Apply -and -not $Confirm) {
  Write-Error "[ALN] --apply requires --confirm to actually change firewall rules."
  exit 1
}

if ($Apply) {
  if (-not (Test-Path $PolicyLockfile)) {
    Write-Error "[ALN] Policy lockfile '$PolicyLockfile' not found; refusing to apply."
    exit 1
  }
  $lock = Get-Content $PolicyLockfile -Raw | ConvertFrom-Json
  Write-Host "[ALN] Policy version: $($lock.version); editor: $($lock.last_editor)"
  $answer = Read-Host "[ALN] Apply firewall changes under this lockfile? (yes/no)"
  if ($answer -ne "yes") { Write-Host "[ALN] Aborted by user, no changes applied."; exit 0 }
}

if ($ForcePort -ne 0) {
  Write-Host "[ALN] Requested forced port $ForcePort"
  if ($Apply -and $Confirm) {
    if ($SimulateApply) { Write-Host "[ALN] (SIMULATED) would configure firewall rule for port $ForcePort." }
    else { Write-Host "[ALN] (DRY-RUN DISABLED) would configure firewall rule for port $ForcePort." }
    # TODO: Add concrete New-NetFirewallRule invocation with audit logging only.
  } else {
    Write-Host "[ALN] Dry-run only. Use --apply --confirm to commit changes."
  }
}

if ($AllowLoopback) {
  Write-Host "[ALN] Requested allow-firewall-loopback"
  if ($Apply -and $Confirm) {
    if ($SimulateApply) { Write-Host "[ALN] (SIMULATED) would add rule for loopback traffic." }
    else { Write-Host "[ALN] (DRY-RUN DISABLED) would add rule for loopback traffic." }
    # TODO: Add concrete firewall rule for 127.0.0.1/::1 only.
  } else {
    Write-Host "[ALN] Dry-run only for loopback rule."
  }
}

Write-Host "[ALN] Firewall script completed."
