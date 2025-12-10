#!/usr/bin/env bash
set -euo pipefail

echo "[ALN] test: invalid port"
if ./.aln/cli/firewall-apply.sh --force-port 70000 2>/dev/null; then
  echo "expected failure for invalid port"; exit 1
fi

echo "[ALN] test: apply without confirm"
if ./.aln/cli/firewall-apply.sh --force-port 8080 --apply 2>/dev/null; then
  echo "expected failure for apply without confirm"; exit 1
fi

echo "[ALN] test: dry-run OK"
./.aln/cli/firewall-apply.sh --force-port 8080

echo "[ALN] all firewall tests passed."
