#!/usr/bin/env bash
set -euo pipefail

echo "[ALN] Cross-runtime test harness (POSIX) starting in $(pwd)"

failures=()

run_test() {
  local id="$1"; shift
  echo "[ALN] Running test: $id"
  if ! eval "$*"; then
    echo "[ALN] Test FAILED: $id"
    failures+=("$id")
  else
    echo "[ALN] Test PASSED: $id"
  fi
}

# Detect runtimes
if command -v npm >/dev/null 2>&1 && command -v node >/dev/null 2>&1; then
  node_toolchain=1
  echo "[ALN] Node toolchain detected, npm tests ENABLED."
else
  node_toolchain=0
  echo "[ALN] npm/node not found. Skipping Node-based tests (no hard failure)."
fi

# 1) Static tests
run_test lint-json "find . -name '*.json' -print0 | xargs -0 -n1 sh -c 'cat \"$0\" | python -m json.tool >/dev/null 2>&1'" || true

# 2) ALN validation
if [ -x .aln/tools/validate-aln.sh ]; then
  run_test lint-aln ".aln/tools/validate-aln.sh"
else
  echo "[ALN] ALN validator script missing -> skipping lint-aln."
fi

# 3) Optional Node tests
if [ "$node_toolchain" -eq 1 ] && [ -f package.json ]; then
  run_test node-tests "npm test" || true
else
  echo "[ALN] Node tests skipped (package.json missing or npm unavailable)."
fi

# 4) Optional Python tests
if command -v python3 >/dev/null 2>&1 || command -v python >/dev/null 2>&1; then
  run_test python-tests "python3 -m pytest 2>/dev/null || python -m pytest 2>/dev/null" || true
else
  echo "[ALN] Python tests skipped (python not found)."
fi

# 5) Optional dotnet tests
if command -v dotnet >/dev/null 2>&1 && ls *.sln >/dev/null 2>&1; then
  run_test dotnet-tests "dotnet test" || true
else
  echo "[ALN] .NET tests skipped (dotnet or solution missing)."
fi

if [ "${#failures[@]}" -ne 0 ]; then
  echo "[ALN] One or more tests failed: ${failures[*]}"
  exit 1
fi

echo "[ALN] All active tests passed."
