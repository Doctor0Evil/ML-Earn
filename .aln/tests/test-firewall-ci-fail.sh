#!/usr/bin/env bash
set -euo pipefail

tmp=$(mktemp -d -t gdtest.XXXXXX)
pushd "$tmp" >/dev/null
mkdir -p .vscode
cat > .vscode/settings.json <<'JSON'
{ "godot_tools.gdscript_lsp.server_port": 6000 }
JSON
cat > editor_settings-100.tres <<'TRES'
[network]
language_server/host = "127.0.0.1"
language_server/port = 6000
TRES
cat > godot_lsp.config.json <<'CFG'
{ "defaultPort": 6008 }
CFG
# Run CI fail and expect non-zero exit
if ./.aln/cli/firewall-apply.sh --ci-fail 2>&1 | tee /tmp/out; then
  echo "expected ci-fail to exit non-zero"; exit 1
else
  grep -q '::error' /tmp/out || { echo 'expected annotation lines in output'; exit 1; }
  echo "CI fail test passed"
fi
popd >/dev/null
rm -rf "$tmp"
