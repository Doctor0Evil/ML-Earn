#!/usr/bin/env bash
set -euo pipefail

FORCE_PORT=0
ALLOW_LOOPBACK=0
APPLY=0
CONFIRM=0
SIMULATE=0
DIAGNOSTICS=0
CI_FAIL=0
POLICY_LOCKFILE=".aln/firewall.policy.lock.json"

while [ $# -gt 0 ]; do
  case "$1" in
    --force-port)
      FORCE_PORT="$2"; shift 2;;
    --allow-firewall-loopback)
      ALLOW_LOOPBACK=1; shift;;
    --apply)
      APPLY=1; shift;;
    --confirm)
      CONFIRM=1; shift;;
    --simulate-apply)
      SIMULATE=1; shift;;
    --ci-fail)
      CI_FAIL=1; shift;;
    --diagnostics)
      DIAGNOSTICS=1; shift;;
    --policy-lockfile)
      POLICY_LOCKFILE="$2"; shift 2;;
    * )
      echo "[ALN] Unknown flag: $1" >&2; exit 1;
  esac
done

if [ "$DIAGNOSTICS" -eq 1 ]; then
  echo "[ALN] Diagnostics for firewall apply (scope: godot)"
  echo "Forced port: ${FORCE_PORT:-(none)}"
  echo "Loopback would be allowed: ${ALLOW_LOOPBACK}" 
  echo "Policy lockfile present: $( [ -f "$POLICY_LOCKFILE" ] && echo yes || echo no )"
  if [ -f "$POLICY_LOCKFILE" ]; then
    if ! jq -e . "${POLICY_LOCKFILE}" >/dev/null 2>&1; then
      echo "[ALN] Policy lockfile exists but is invalid JSON" >&2; exit 2
    fi
  fi
  exit 0
fi

if [ "$CI_FAIL" -eq 1 ]; then
  echo "[ALN] CI diagnostics (fail on mismatch) for Godot LSP"
  issues=()
  # Determine expected port: from godot_lsp.config.json or default 6008
  expected_port=6008
  if [ -f godot_lsp.config.json ]; then
    cfg_port=$(jq -r '.defaultPort // empty' godot_lsp.config.json 2>/dev/null || echo)
    if [ -n "$cfg_port" ]; then expected_port=$cfg_port; fi
  fi
  echo "[ALN] Expected LSP port: $expected_port"

  # Check editor_settings *.tres files for port
  while IFS= read -r -d '' f; do
    p=$(grep -Eo 'language_server/port\s*=\s*[0-9]+' "$f" | sed -E 's/[^0-9]*([0-9]+).*/\1/') || true
    if [ -z "$p" ]; then
      issues+=("$f:missing_port")
      echo "::error file=$f,line=1::Editor settings missing language_server/port (expected $expected_port)"
    elif [ "$p" -ne "$expected_port" ]; then
      issues+=("$f:port_mismatch:$p")
      echo "::error file=$f,line=1::Editor settings language_server/port $p does not match policy expected $expected_port"
    fi
  done < <(find . -name 'editor_settings*.tres' -print0)

  # Check .vscode settings.json for port
  if [ -f .vscode/settings.json ]; then
    vs_port=$(jq -r '."godot_tools.lsp.port" // ."godot_tools.gdscript_lsp.server_port" // ."godot_tools.gdscript_lsp.port" // empty' .vscode/settings.json 2>/dev/null || echo)
    if [ -z "$vs_port" ]; then
      issues+=(".vscode/settings.json:missing_port")
      echo "::error file=.vscode/settings.json,line=1::VS Code settings missing Godot LSP port (expected $expected_port)";
    elif [ "$vs_port" -ne "$expected_port" ]; then
      issues+=(".vscode/settings.json:port_mismatch:$vs_port")
      echo "::error file=.vscode/settings.json,line=1::VS Code settings port $vs_port does not match expected $expected_port";
    fi
  else
    issues+=(".vscode/settings.json:missing_file")
    echo "::error file=.vscode/settings.json,line=1::VS Code settings.json missing; expected to set Godot LSP host/port to $expected_port";
  fi

  # Check policy lockfile shape
  if [ -f "$POLICY_LOCKFILE" ]; then
    if ! jq -e '.allow_firewall_apply? // empty' "$POLICY_LOCKFILE" >/dev/null 2>&1; then
      issues+=("$POLICY_LOCKFILE:invalid_shape")
      echo "::error file=$POLICY_LOCKFILE,line=1::Policy lockfile missing required fields or invalid JSON";
    fi
  else
    issues+=("$POLICY_LOCKFILE:missing")
    echo "::error file=$POLICY_LOCKFILE,line=1::Policy lockfile $POLICY_LOCKFILE not found; create one to enable policy-locked firewall changes";
  fi

  if [ ${#issues[@]} -ne 0 ]; then
    echo "[ALN] CI diagnostics found ${#issues[@]} issue(s)."
    exit 1
  else
    echo "[ALN] CI diagnostics: no issues found."
    exit 0
  fi
fi

if [ "$FORCE_PORT" -ne 0 ] && { [ "$FORCE_PORT" -lt 1 ] || [ "$FORCE_PORT" -gt 65535 ]; }; then
  echo "[ALN] --force-port must be between 1 and 65535." >&2
  exit 1
fi

if [ "$APPLY" -eq 1 ] && [ "$CONFIRM" -ne 1 ]; then
  echo "[ALN] --apply requires --confirm to mutate firewall rules." >&2
  exit 1
fi

if [ "$APPLY" -eq 1 ]; then
  if [ ! -f "$POLICY_LOCKFILE" ]; then
    echo "[ALN] Policy lockfile '$POLICY_LOCKFILE' not found; refusing to apply." >&2
    exit 1
  fi
  echo "[ALN] Policy lockfile: $POLICY_LOCKFILE"
  read -r -p "[ALN] Apply firewall changes under this lockfile? (yes/no) " answer
  if [ "$answer" != "yes" ]; then
    echo "[ALN] Aborted by user, no changes applied."; exit 0
  fi
fi

if [ "$FORCE_PORT" -ne 0 ]; then
  echo "[ALN] Requested forced port $FORCE_PORT"
  if [ "$APPLY" -eq 1 ] && [ "$CONFIRM" -eq 1 ]; then
    if [ "$SIMULATE" -eq 1 ]; then
      echo "[ALN] (SIMULATED) Would configure firewall rule for port $FORCE_PORT."
    else
      echo "[ALN] (DRY-RUN DISABLED) Would configure firewall rule for port $FORCE_PORT."
      # TODO: Implement iptables/nft concrete commands here with logging.
    fi
  else
    echo "[ALN] Dry-run only; use --apply --confirm to commit changes.";
  fi
fi

if [ "$ALLOW_LOOPBACK" -eq 1 ]; then
  echo "[ALN] Requested allow-firewall-loopback"
  if [ "$APPLY" -eq 1 ] && [ "$CONFIRM" -eq 1 ]; then
    if [ "$SIMULATE" -eq 1 ]; then
      echo "[ALN] (SIMULATED) Would add loopback firewall rule (127.0.0.1 / ::1)."
    else
      echo "[ALN] (DRY-RUN DISABLED) Would add loopback firewall rule (127.0.0.1 / ::1)."
      # TODO: Implement iptables/nft concrete commands here with logging.
    fi
  else
    echo "[ALN] Dry-run only for loopback rule.";
  fi
fi

echo "[ALN] Firewall script completed."
