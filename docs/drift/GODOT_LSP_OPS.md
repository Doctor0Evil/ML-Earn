# Godot GDScript LSP - Ops Quick Reference

This file contains concise, copy-pasteable operations for diagnosing and fixing the Godot GDScript LSP (localhost) connection problem.

## Check what listens on 6008 (and 6005)

### Windows (PowerShell / CMD)

```bat
REM TCP listeners on 6008
netstat -ano | findstr :6008

REM If you want the owning EXE as well (requires admin):
netstat -abno | findstr :6008
```

Match the PID in Task Manager > Details for the owning process.

### Linux

```bash
# Using ss (modern)
sudo ss -lptn 'sport = :6008'

# Or classic netstat
sudo netstat -ltnp | grep ':6008'
```

These commands show the PID and process listening on port 6008. Repeat for 6005 if using Godot 4.

---

## Start Godot with LSP enabled

Assumes Editor Settings → Network → Language Server is set to desired host/port.

### Linux

```bash
# Godot 4
godot4 --editor --lang_server --editor-lsp-port 6008 --path /absolute/path/to/your/project

# Godot 3
godot --editor --path /absolute/path/to/your/project
```

### Windows (PowerShell/CMD)

```bat
# Godot 4
"C:\Program Files\Godot\godot4.exe" --editor --lang_server --editor-lsp-port 6008 --path "C:\path\to\project"

# Godot 3
"C:\Program Files\Godot\Godot_v3.x\Godot.exe" --editor --path "C:\path\to\project"
```

For headless LSP (CI-style) use `--no-window` or `--headless` with `--lang_server` where supported.

---

## VS Code godot_tools settings (example)

Add to `.vscode/settings.json` (or update via `--vscode` CLI transform):

```json
{
  "godot_tools.gdscript_lsp.enabled": true,
  "godot_tools.gdscript_lsp.server_host": "127.0.0.1",
  "godot_tools.gdscript_lsp.server_port": 6008,
  "godot_tools.editor_path": "C:/Program Files/Godot/godot4.exe",
  "godot_tools.editor_extra_args": [
    "--editor",
    "--lang_server",
    "--editor-lsp-port",
    "6008"
  ]
}
```

Ensure the port here matches Godot's Editor → Editor Settings → Network → Language Server.

---

## Change Godot LSP port (6005 vs 6008)

### In Godot Editor

1. Open **Editor → Editor Settings**.
2. Go to **Network → Language Server**.
3. Set **Remote Host** to `127.0.0.1` and **Remote Port** to `6005` (Godot 4 default), or `6008` if you want cross-compatibility with Godot 3.
4. Restart Godot to rebind LSP.

### In VS Code Godot Tools

Set **Gdscript Lsp: Server Host** to `127.0.0.1` and **Gdscript Lsp: Server Port** to your chosen port.

---

## Firewall rules for loopback 127.0.0.1:6008 (only if necessary)

These commands are *explicit* and affect local loopback only. They should be run with the appropriate privileges by a trusted operator and only when required.

### Windows (PowerShell)

```powershell
# Run elevated (Admin) PowerShell
New-NetFirewallRule `
  -DisplayName "Allow Godot LSP 6008 Loopback" `
  -Direction Inbound `
  -Action Allow `
  -Protocol TCP `
  -LocalPort 6008 `
  -LocalAddress 127.0.0.1
```

This creates an inbound rule restricted to the loopback address; no LAN/WAN exposure.

### Linux (iptables example)

```bash
sudo iptables -A INPUT -i lo -p tcp --dport 6008 -j ACCEPT
```

This affects only the loopback interface (`lo`) and keeps the language server local.

---

## Using the repo helper script

- Run diagnostics:

```bash
node scripts/fix-godot-lsp.cjs --diagnostics
```

- Apply configuration changes (idempotent):

```bash
node scripts/fix-godot-lsp.cjs --apply
```

- Only write VS Code settings and launch profile:

```bash
node scripts/fix-godot-lsp.cjs --vscode
```

- Add a Neovim LSP snippet:

```bash
node scripts/fix-godot-lsp.cjs --neovim
```

- Show firewall commands (no modifications):

```bash
node scripts/fix-godot-lsp.cjs --allow-firewall-loopback
```

- Apply firewall rule (explicit confirmation required):

```bash
node scripts/fix-godot-lsp.cjs --allow-firewall-loopback --confirm
```

(If run without `--confirm`, the script prints the recommended command only.)

### CI enforcement and remediation

Pull requests that touch Godot project files or VS Code settings will run the `Godot Diagnostics` workflow. It executes the ALN firewall CLI in CI fail mode:

```bash
./.aln/cli/firewall-apply.sh --ci-fail
```

Behavior:
- With no `--ci-fail` the script logs issues but does not fail the job.
- With `--ci-fail` the script emits GitHub Action annotations using `::error` lines for each mismatch (editor settings vs expected port, missing VS Code settings, invalid policy lockfile shape), and exits with status `1` when any issues are found.
- The job prints a short remediation summary on failure; it never mutates the local firewall in CI.

If you get a layout failure in CI, run the ALN harness locally and fix by aligning Godot's `Editor Settings → Network → Language Server` port with `.vscode/settings.json` and validating through the ALN docs/workflows.

To avoid privileged operations during tests, you can run a simulated apply which performs all policy checks and updates the policy file `lastAppliedHash`, but does not execute platform commands:

```bash
node scripts/fix-godot-lsp.cjs --allow-firewall-loopback --confirm --simulate-apply --port 6008
```

- Force a port and save the selected default for repo-wide use:

```bash
node scripts/fix-godot-lsp.cjs --force-port 6008 --save-config --apply
```

### CI integration (diagnostics)

Included workflow: `.github/workflows/godot-lsp-diagnostics.yml` runs on PRs touching `*.tres`, `.vscode/**`, and Godot project files. It runs:

```bash
node scripts/fix-godot-lsp.cjs --ci-fail
```

The `--ci-fail` action validates `editor_settings-*.tres`, `.vscode/settings.json`, and `launch.json` against the repo-configured port (if present in `godot_lsp.config.json`) or the default (6008). If mismatches are found the action exits non-zero and fails the workflow.

---

## Notes and best practices

- Always open the Godot project first before starting the editor/integration in your IDE. Godot Tools expects the same project instance to be open to provide correct LSP diagnostics.
- Prefer loopback-only changes to avoid exposing LSP to the network.
- If you standardize on a single port across your team (e.g., 6008), configure Godot and the IDE accordingly.
- We avoid automated firewall edits by default — use `--allow-firewall-loopback` only when you have explicit permission or are operating a local dev machine.
