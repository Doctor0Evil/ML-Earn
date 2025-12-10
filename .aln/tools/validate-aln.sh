#!/usr/bin/env bash
set -euo pipefail

root="${1:-$(pwd)}"
echo "[ALN] Validating .aln files in $root"

errors=()

while IFS= read -r -d '' f; do
  text="$(cat "$f")"
  echo "$text" | grep -qE 'aln[[:space:]]+MODULE[[:space:]]+[A-Za-z0-9_]+'
  has_header=$?
  echo "$text" | grep -q 'END MODULE'
  has_footer=$?
  if [ $has_header -ne 0 ] || [ $has_footer -ne 0 ]; then
    echo "[ALN] Structural issue in $f"
    errors+=("$f")
  fi
done < <(find "$root" -name '*.aln' -print0)

if [ "${#errors[@]}" -ne 0 ]; then
  echo "[ALN] Invalid ALN structure detected in: ${errors[*]}"
  exit 1
fi

echo "[ALN] All .aln files passed structural validation."
