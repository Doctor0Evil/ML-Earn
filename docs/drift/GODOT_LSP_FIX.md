# Godot GDScript Language Server Fix (ALN Module)

This module automates common fixes for the LSP connection problem when an editor cannot connect to Godot's GDScript language server at `127.0.0.1:6008` or `6005`.

## What it does
- Scans `127.0.0.1:6008` and `127.0.0.1:6005` to check if a listener exists.
- If Godot 4 (6005) is detected and reachable, the script will prefer 6005; otherwise it will prefer 6008.
- Normalizes `editor_settings-*.tres` files to enable the language server (host, port, threaded LSP).
- Adds safe VS Code launch profile(s) using `--editor --lang_server --editor-lsp-port` and writes recommended `.vscode/settings.json` values.
- Adds a sample Neovim LSP snippet for `gds` LSP.

## Usage
- Run diagnostics to see local state:
  - `node scripts/fix-godot-lsp.cjs --diagnostics`
- Attempt to apply fixes (idempotent):
  - `node scripts/fix-godot-lsp.cjs --apply`
- Force a port across the repo and save it: (will write `godot_lsp.config.json`)
  - `node scripts/fix-godot-lsp.cjs --force-port 6008 --save-config --apply`
- Run CI-compatible fail check (exits non-zero if problems detected):
  - `node scripts/fix-godot-lsp.cjs --ci-fail`
- Enable language server TRES edits explicitly:
  - `node scripts/fix-godot-lsp.cjs --enable-language-server`
- Update vscode launch/settings only:
  - `node scripts/fix-godot-lsp.cjs --vscode`
- Generate Neovim snippet only:
  - `node scripts/fix-godot-lsp.cjs --neovim`

### Firewall helper (optional)

`--allow-firewall-loopback` prints recommended firewall commands for your platform without applying them. Run with `--confirm` to attempt the change; the script will fail safely if not elevated or if the platform command fails.

Examples:
```bash
# Print the platform-appropriate firewall command (no changes):
node scripts/fix-godot-lsp.cjs --allow-firewall-loopback

# Attempt to apply firewall rule (requires elevation):
node scripts/fix-godot-lsp.cjs --allow-firewall-loopback --confirm
```

## Notes
- Godot 3 defaults to port 6008. Godot 4 defaults to port 6005; you may prefer to standardize on 6008 if you use a mixture of Godot versions.
 - **Important**: Start Godot and open your project before running the script if you rely on the active editor settings being applied; the official Godot Tools LSP expects Godot to be running and opened on the same project to report LSP status.
- Modifying configuration files will create a backup file with the `.bak-<timestamp>` suffix near the original file.
- This tool aims to be conservative — it backs up files and creates new elements only when missing.
- If Godot is not running, the script will only adjust local configuration to be compatible with the selected host/port.

### Firewall policy and lockfile

To apply the firewall helper automatically you must opt-in with the repo policy lockfile `.aln/firewall.policy.lock.json` that contains `allow_firewall_apply: true`. Use the default `--allow-firewall-loopback` to list the proper commands. Use `--allow-firewall-loopback --confirm` to attempt to apply them; the script will read the policy and refuse unless `allow_firewall_apply` is true.

Example policy file (repo root):

```json
{
  "allow_firewall_apply": false,
  "os": ["Windows_NT", "Linux"],
  "lastAppliedHash": null
}
```

## Security
This module intentionally avoids any privileged operations (e.g., firewall edits, system-wide changes). It provides diagnostics and guidance about firewall config changes instead. For automated firewall modifications, extend the script with OS-specific helpers and follow organization security rules.
