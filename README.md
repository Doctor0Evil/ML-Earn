![ALN Compliance Charter](https://img.shields.io/badge/ALN%20Compliance-Enforced-brightgreen)
![KYC/DID Verified](https://img.shields.io/badge/KYC%20Verified-DID%20Required-blue)
![Immutable Ledger](https://img.shields.io/badge/Ledger-Blockchain%20Secured-orange)
![Audit-Ready](https://img.shields.io/badge/Audit-Continuous%20Monitoring-yellow)
![No Neural Networking](https://img.shields.io/badge/No%20Neural%20Networking-Deterministic%20Only-red)
![Asset-Backed](https://img.shields.io/badge/Asset%20Backed-Terra%20Blockchain-lightgrey)


<img src="https://r2cdn.perplexity.ai/pplx-full-logo-primary-dark%402x.png" style="height:64px;margin-right:32px"/>

***

GitHub-Solutions provides a robust framework combining ALN (Advanced Language Notation) governance, comprehensive CI/CD workflows, and supporting Node.js + PowerShell tooling designed to elevate GitHub platform capabilities and community collaboration.

Our objective is to enforce strict compliance, streamline project workflows, and empower developers with advanced validation and governance tools — improving stability, security, and collaboration across GitHub ecosystems.
![CI](https://github.com/Doctor0Evil/Github-Solutions/actions/workflows/ci.yml/badge.svg)

## Core Structure Overview

- **`aln/`** — Central repository for source ALN bundles and governance documentation, defining rules and policies for ALN language compliance.
- **`aln-json/`** — Auto-generated JSON schema projections derived from ALN sources for validation and interoperability.
- **`schemas/`** — JSON Schema definitions used by the Ajv library for rigorous data validation across ALN projects.
- **`scripts/`** — Collection of Node.js and PowerShell helper scripts:
  - ALN-to-JSON projection and mesh validation tooling.
  - Severity gate enforcement to ensure compliance thresholds.
  - Copilot metaprompt governance validation.
  - WASM inspection and environment bootstrap utilities.
- **`.github/workflows/`** — GitHub Actions workflows for ALN validation, firmware simulation, VM validation, copilot governance, telemetry export, and staged firmware rollouts.

## Local Development and Automation

### Node.js Environment

A minimal `package.json` scripts setup enables running core ALN tasks:

```jsonc
{
  "scripts": {
    "aln:projection": "node scripts/aln-to-json-projection.cjs",
    "aln:validate": "node scripts/aln-ajv-mesh-sweep.cjs",
    "aln:severity-gate": "node scripts/aln-severity-gate.cjs",
    "aln:metatest": "node scripts/aln-copilot-metatest.cjs"
  }
}
```

To get started locally:

```powershell
cd path\to\Github-Solutions
npm install
npm run aln:projection
npm run aln:validate
npm run aln:severity-gate
npm run aln:metatest
```

### PowerShell Utilities

- **AutoFix-Npm.ps1**  
Ensures Node.js, npm, and winget are installed and runs ALN validations:

```powershell
pwsh -File scripts/AutoFix-Npm.ps1 -RepoPath "path\to\Github-Solutions"
```

Use `-SkipInstall` flag if dependencies are already installed.

- **GitHub-Platform-Improvements.ps1**  
Bootstraps the environment by configuring git, GitHub CLI, Node.js, and .NET, adding helper functions for smoother development:

```powershell
pwsh -File scripts/GitHub-Platform-Improvements.ps1 -RepoPath "$PWD" -UserName "Your Name" -UserEmail "you@example.com"
```

Provides utilities like `Invoke-GitCommitPush`, `Invoke-GitHubAuth`, and `Show-GitHubRepoInfo`.

- **Inspect-Wasm.ps1**  
Inspect WebAssembly binaries (requires `wasm-objdump` in PATH):

```powershell
pwsh -File scripts/Inspect-Wasm.ps1 -WasmPath build/module.wasm
```

## Continuous Integration Workflows

Prebuilt GitHub Actions workflows automate critical validation steps including:

- ALN core language validation and restrictions on Python usage (`aln-ci-core.yml`).
- Hardware simulation matrix validation for device twin firmware (`aln-device-twin-ci.yml`).
- Virtual machine bootstrap validation (`aln-vm-bootstrap-validate.yml`).
- Repository policy and Copilot metaprompt governance (`aln-copilot-governance.yml`).
- Telemetry data export aggregation (`aln-telemetry-export.yml`).
- Controlled staged firmware update rollout lanes (`aln-firmware-update-lane.yml`).

## Governance and Security

- Strict enforcement banning Python runtimes in CI to avoid unpredictable runtime behavior.
- Severity gate policy with critical violation failure and a configurable cap for warning levels.
- Copilot metaprompt governance ensures presence of mandatory governance commands for safety.
- Immutable blockchain-secured audit trails ensure tamper-proof compliance logs.

## Recommended Local Workflow

1. Bootstrap your environment with environment improvements:

```powershell
pwsh -File scripts/GitHub-Platform-Improvements.ps1 -RepoPath "$PWD" -UserName "Dev" -UserEmail "dev@example.com"
```

2. Install dependencies and validate ALN bundles:

```powershell
npm install
npm run aln:projection
npm run aln:validate
npm run aln:severity-gate
```

3. Run metaprompt governance tests:

```powershell
npm run aln:metatest
```

## ALN Test Harness & Self-Tests

The project uses an ALN cross-runtime harness that does not require Node/Python/.NET to be installed. Use these commands to run the canonical tests and harness self-checks:

Windows (PowerShell):
```powershell
pwsh -File .aln\run-tests.ps1
```

Linux/WSL:
```bash
chmod +x .aln/run-tests.sh .aln/tools/validate-aln.sh
./.aln/run-tests.sh
```

Harness self-tests (simulate missing runtimes):
```bash
chmod +x .aln/tests/test-crossruntime-harness.sh
./.aln/tests/test-crossruntime-harness.sh
```

PowerShell harness self-test:
```powershell
pwsh -File .aln\tests\Test-CrossRuntimeHarness.ps1
```

## Troubleshooting Tips

- If `npm` commands are not recognized after automatic installation, restart your PowerShell window to refresh the environment variables.
- For Ajv JSON schema validation errors, check detailed error reports in `reports/aln-constraint-report.json`.
- Use `Inspect-Wasm.ps1` to debug WebAssembly binary issues during simulation pipeline additions.

### Godot GDScript LSP Fix

If your IDE shows the "Couldn't connect to the GDScript language server at 127.0.0.1:6008" error, run the helper script to diagnose and apply local fixes:

```powershell
node scripts/fix-godot-lsp.cjs --diagnostics
node scripts/fix-godot-lsp.cjs --apply
```

The script will check ports (6008 and 6005), detect reachable ones, update `.vscode/settings.json`, add a safe `.vscode/launch.json` profile to launch Godot with `--lang_server`, and write a sample Neovim snippet.
If you'd like to standardize a port across the repo, run:

```powershell
node scripts/fix-godot-lsp.cjs --force-port 6008 --save-config --apply
```

Use `--ci-fail` in CI to validate changes on PRs:

```powershell
node scripts/fix-godot-lsp.cjs --ci-fail
```
For copy-pasteable ops commands (netstat/ss, Godot CLI invocation, firewall commands), see `docs/drift/GODOT_LSP_OPS.md`.
Also the CI diagnostics action (`.github/workflows/godot-lsp-diagnostics.yml`) validates Godot LSP configs on PRs that touch `*.tres` or `.vscode/`.

## Future Enhancements (Planned)

- Artifact uploads for telemetry and WASM logs integrated into firmware/twin workflows.
- Replacement of regex-based ALN parsers with full-featured, syntax-correct parsers.
- Secure signing and verification workflows added for firmware images to enhance integrity guarantees.

***

This README.md is designed to empower developers and maintainers with comprehensive, enforceable governance and tooling for ALN-based projects on GitHub, strengthening workflows, security, and collaboration for the broader GitHub community and enterprise ecosystems.

For more, explore GitHub's built-in collaboration features, advanced security integrations, and automation tools that support agile, secure development and deployment [GitHub Overview].[14][15][17]

***

## Drift detection prototypes

This repo now contains a prototype of drift detection and incremental analysis features in `src/drift` and `src/lsp`.

Key files:
- `src/drift/dependency-graph.ts`: module/file dependency graph with reverse closure for impacted file analysis.
- `src/drift/test-impact.ts`: test-impact analyzer combining coverage and historical failure data to score impacted tests.
- `src/drift/cache-key.ts`: cache key generation for analysis/build tools by mixing content, config, tool versions and dependency signatures.
- `src/lsp/semantic-drift.ts`: example LSP diagnostic skeleton for semantic drift heuristics.
- `scripts/semgrep/semantic-drift-rules.yml`: sample semgrep rules that can be used in CI to detect control-flow regressions.

Run the tests after installing dependencies:
```powershell
npm ci
npm test
```

The CI workflow skeleton is in `.github/workflows/drift-check.yml` and demonstrates lint, unit tests, and drift checks.

