#!/usr/bin/env bash
set -euo pipefail

echo "[ALN] Running cross-runtime harness with minimal PATH (no npm, python, dotnet)"

# Launch harness with a minimal PATH so external runtimes are not available
OLD_PATH="$PATH"
export PATH="/usr/bin:/bin"

./.aln/run-tests.sh

echo "[ALN] Completed harness run (no runtimes available)"

# Restore path
export PATH="$OLD_PATH"

echo "[ALN] test-crossruntime-harness.sh completed." 
