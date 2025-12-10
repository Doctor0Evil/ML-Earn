#!/usr/bin/env bash
set -euo pipefail

SRC="${1:-$HOME/.config/nvim/init.vim}"
DST="${2:-.aln/cache/nvim/init.vim.sanitized}"
GODOT_LSP_PORT="${GODOT_LSP_PORT:-6008}"
echo "[ALN] Note: GODOT_LSP_PORT is governed by Policy.GodotLSPStandard_v1 (default 6008)."

echo "[ALN] Neovim config transform (user-safe) with GodotLspPort=$GODOT_LSP_PORT"

if [ ! -f "$SRC" ]; then
  echo "[ALN] Source config not found: $SRC" >&2
  exit 1
fi

mkdir -p "$(dirname "$DST")"
# Redact secrets and normalize lines that include a known LSP plugin port setting like 'cmd = { "gds-langserver","--host","127.0.0.1","--port","6008" }'
# Replace numeric port tokens with the standardized port.
sed -E 's/(--port["\s,="]*)([0-9]{2,5})/\1'"$GODOT_LSP_PORT"'/gI' "$SRC" | sed -E 's/(port\s*=\s*)[0-9]{2,5}/\1'"$GODOT_LSP_PORT"'/gI' | sed -E 's/(password|token|secret)[^=]*=.*/\1=<redacted>/I' > "$DST"

echo "[ALN] Neovim config copied and secrets redacted to $DST. Port normalized to $GODOT_LSP_PORT."
