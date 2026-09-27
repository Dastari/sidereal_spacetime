#!/usr/bin/env bash
# Idempotent installer for the Sidereal game-stack boot units on CT107 (10.0.1.200).
#
#   ops/systemd/install.sh --dry-run [options]   show what would change; touches nothing
#   ops/systemd/install.sh [options]             render, install, daemon-reload, enable
#   ops/systemd/install.sh --uninstall           disable --now and remove the units
#
# Options:
#   --root DIR         checkout that owns the live database and public client
#                      (default: the checkout containing this script)
#   --studio-root DIR  checkout that serves Studio/dashboard (default: --root)
#   --python PATH      Python >= 3.11 for dev.py (default: python3 on PATH)
#   --node PATH        node binary whose directory goes on the units' PATH (default: node on PATH)
#   --unit-dir DIR     where unit files go (default: /etc/systemd/system; tests use a temp dir)
#
# Installing enables the units for boot but starts nothing: handing the running detached
# processes over to systemd is a separate, deliberate step (see the wiki runbook
# Operations/Boot Services). SYSTEMCTL overrides the systemctl binary (tests).
set -euo pipefail

HERE=$(cd "$(dirname "$0")" && pwd)
ROOT_DIR=$(cd "$HERE/../.." && pwd)
STUDIO_ROOT=
UNIT_DIR=/etc/systemd/system
PYTHON_BIN=$(command -v python3 || true)
NODE_BIN=$(command -v node || true)
SYSTEMCTL=${SYSTEMCTL:-systemctl}
DRY_RUN=0
UNINSTALL=0
UNITS=(sidereal-database.service sidereal-public-client.service sidereal-studio.service)

usage() { sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'; }
die() { echo "install.sh: $*" >&2; exit 1; }

while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY_RUN=1 ;;
    --uninstall) UNINSTALL=1 ;;
    --root) ROOT_DIR=${2:?--root needs a directory}; shift ;;
    --studio-root) STUDIO_ROOT=${2:?--studio-root needs a directory}; shift ;;
    --python) PYTHON_BIN=${2:?--python needs a path}; shift ;;
    --node) NODE_BIN=${2:?--node needs a path}; shift ;;
    --unit-dir) UNIT_DIR=${2:?--unit-dir needs a directory}; shift ;;
    -h|--help) usage; exit 0 ;;
    *) die "unknown option $1 (see --help)" ;;
  esac
  shift
done

# Run a state-changing command, or only describe it in a dry run.
act() {
  if [ "$DRY_RUN" = 1 ]; then echo "  would run: $*"; else echo "  + $*"; "$@"; fi
}

if [ "$DRY_RUN" = 0 ] && [ "$UNIT_DIR" = /etc/systemd/system ] && [ "$(id -u)" != 0 ]; then
  die "run as root (or use --dry-run)"
fi
[ "$DRY_RUN" = 1 ] && echo "== DRY RUN: nothing is written, enabled, started or stopped"

if [ "$UNINSTALL" = 1 ]; then
  echo "== uninstall from $UNIT_DIR"
  changed=0
  for unit in "${UNITS[@]}"; do
    if [ -e "$UNIT_DIR/$unit" ]; then
      # Stopping goes through each supervisor, which shuts its service down cleanly and
      # removes its row from processes.json; restart detached with dev.py afterwards.
      act "$SYSTEMCTL" disable --now "$unit"
      act rm -f "$UNIT_DIR/$unit"
      changed=1
    else
      echo "  $unit: not installed"
    fi
  done
  [ "$changed" = 1 ] && act "$SYSTEMCTL" daemon-reload
  echo "done."
  exit 0
fi

STUDIO_ROOT=${STUDIO_ROOT:-$ROOT_DIR}

echo "== validate"
check_path() { # label path
  case "$2" in
    /*) ;;
    *) die "$1 must be an absolute path: $2" ;;
  esac
  # systemd splits ExecStart on whitespace and expands % specifiers; sed rendering uses | and &.
  case "$2" in *[[:space:]%\\\"\'\|\&]*) die "$1 contains characters systemd or the renderer would reinterpret: $2" ;; esac
}
[ -n "$PYTHON_BIN" ] || die "python3 not found; pass --python"
[ -n "$NODE_BIN" ] || die "node not found on PATH (sudo resets PATH); pass --node"
ROOT_DIR=$(cd "$ROOT_DIR" 2>/dev/null && pwd -P) || die "--root does not exist"
STUDIO_ROOT=$(cd "$STUDIO_ROOT" 2>/dev/null && pwd -P) || die "--studio-root does not exist"
for pair in "root:$ROOT_DIR" "studio-root:$STUDIO_ROOT" "python:$PYTHON_BIN" "node:$NODE_BIN" "unit-dir:$UNIT_DIR"; do
  check_path "${pair%%:*}" "${pair#*:}"
done
[ -x "$NODE_BIN" ] || die "node is not executable: $NODE_BIN"
"$PYTHON_BIN" -c 'import sys; sys.exit(sys.version_info < (3, 11))' || die "$PYTHON_BIN is older than Python 3.11 (dev.py needs tomllib)"

require() { # description path
  [ -e "$2" ] || die "$1 is missing: $2"
}
for checkout in "$ROOT_DIR" "$STUDIO_ROOT"; do
  require "dev.py" "$checkout/scripts/dev.py"
  require "vite (npm ci)" "$checkout/node_modules/vite/bin/vite.js"
  grep -q 'def supervise(' "$checkout/scripts/dev.py" \
    || die "$checkout/scripts/dev.py predates the supervised serve mode; update that checkout first"
  # dev.py only drives a unit whose name its own dev.toml maps; the names must agree.
  "$PYTHON_BIN" - "$checkout/dev.toml" "${UNITS[@]}" <<'PY' || die "$checkout/dev.toml [systemd] does not map the installed unit names"
import sys, tomllib
from pathlib import Path
expected = dict(zip(('database', 'public-client', 'dashboard'), sys.argv[2:]))
sys.exit(tomllib.loads(Path(sys.argv[1]).read_text()).get('systemd') != expected)
PY
done
# Refuse a root that would start an empty world or serve nothing: live paths must exist.
require "live database directory" "$ROOT_DIR/.spacetime-data"
require "SpacetimeDB CLI (dev.py setup)" "$ROOT_DIR/.tools/spacetime/spacetime"
require "activated public client release" "$ROOT_DIR/.runtime/public-client/current/index.html"
echo "  root:        $ROOT_DIR"
echo "  studio-root: $STUDIO_ROOT"
echo "  python:      $PYTHON_BIN"
echo "  node:        $NODE_BIN"
echo "  unit dir:    $UNIT_DIR"

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
UNIT_PATH="$(dirname "$NODE_BIN"):/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
for unit in "${UNITS[@]}"; do
  sed -e "s|@ROOT@|$ROOT_DIR|g" -e "s|@STUDIO_ROOT@|$STUDIO_ROOT|g" \
      -e "s|@PYTHON@|$PYTHON_BIN|g" -e "s|@PATH@|$UNIT_PATH|g" \
      "$HERE/$unit.in" > "$tmp/$unit"
  if grep -q '@[A-Z_]*@' "$tmp/$unit"; then die "unrendered placeholder left in $unit"; fi
done
if command -v systemd-analyze >/dev/null 2>&1; then
  # Checks syntax and that every ExecStart binary exists; read-only.
  (cd "$tmp" && systemd-analyze verify --man=no "${UNITS[@]/#/$tmp/}") || die "systemd-analyze verify rejected the rendered units"
  echo "  systemd-analyze verify: ok"
fi

echo "== unit files"
changed=0
[ -d "$UNIT_DIR" ] || act install -d -m 0755 "$UNIT_DIR"
for unit in "${UNITS[@]}"; do
  if [ -f "$UNIT_DIR/$unit" ] && cmp -s "$tmp/$unit" "$UNIT_DIR/$unit"; then
    echo "  $unit: unchanged"
    continue
  fi
  if [ -f "$UNIT_DIR/$unit" ]; then
    echo "  $unit: update"
    diff -u "$UNIT_DIR/$unit" "$tmp/$unit" | sed 's/^/    /' || true
  else
    echo "  $unit: new"
    [ "$DRY_RUN" = 1 ] && sed 's/^/    /' "$tmp/$unit"
  fi
  act install -m 0644 "$tmp/$unit" "$UNIT_DIR/$unit"
  changed=1
done
if [ "$changed" = 1 ]; then act "$SYSTEMCTL" daemon-reload; fi

echo "== enable for boot (nothing is started)"
for unit in "${UNITS[@]}"; do
  if [ "$DRY_RUN" = 0 ] && [ "$("$SYSTEMCTL" is-enabled "$unit" 2>/dev/null || true)" = enabled ]; then
    echo "  $unit: already enabled"
  else
    act "$SYSTEMCTL" enable "$unit"
  fi
done
echo "done. dev.py in $ROOT_DIR (and $STUDIO_ROOT for Studio) now drives these units through systemctl."
echo "Hand the running detached processes over with the runbook: Operations/Boot Services."
