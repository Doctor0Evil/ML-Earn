Import-Module Pester -ErrorAction SilentlyContinue

Describe "Firewall CLI --force-port and --confirm" {
  It "fails on invalid port" {
    & .aln/cli/firewall-apply.ps1 -ForcePort 70000 2>$null
    $LASTEXITCODE | Should -Not -Be 0
  }

  It "requires --confirm when --apply is set" {
    & .aln/cli/firewall-apply.ps1 -ForcePort 8080 -Apply 2>$null
    $LASTEXITCODE | Should -Not -Be 0
  }

  It "runs dry-run successfully without apply" {
    & .aln/cli/firewall-apply.ps1 -ForcePort 8080
    $LASTEXITCODE | Should -Be 0
  }
}
