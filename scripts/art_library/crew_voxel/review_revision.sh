#!/usr/bin/env bash
# Sequential (one Blender at a time) review pack for a body revision:
#   export + matched front / close-up vs previous revisions + reference pose sheet.
# Usage: review_revision.sh SCRATCH_DIR PROGRESS_DIR PREV_BLEND [PREV2_BLEND]
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
S="${1:?scratch}"
OUT="${2:?progress dir}"
PREV="${3:?previous revision .blend}"
PREV2="${4:-}"
REV="$(python3 -c "import sys; sys.path.insert(0, '$HERE'); import rig; print(rig.REVISION)")"
REFS=/root/sidereal-progress/verify/refs/char-body
export TMPDIR="$S/tmp"
mkdir -p "$S/$REV" "$S/cmp" "$TMPDIR"
run() { blender -b --factory-startup -P "$@" 2>&1 | grep -E "CREW_BODY_DONE|Traceback|Error:" | grep -v EGL || true; }
run "$HERE/build_body.py" -- --out "$S/$REV" --no-render
run "$HERE/compare.py" -- --blend "$S/$REV/crew-body.blend" --out "$S/cmp/${REV}_front.png"
run "$HERE/compare.py" -- --blend "$S/$REV/crew-body.blend" --out "$S/cmp/${REV}_close.png" --closeup
run "$HERE/compare.py" -- --blend "$PREV" --out "$S/cmp/prev_front.png"
run "$HERE/compare.py" -- --blend "$PREV" --out "$S/cmp/prev_close.png" --closeup
if [ -n "$PREV2" ]; then run "$HERE/compare.py" -- --blend "$PREV2" --out "$S/cmp/prev2_front.png"; fi
python3 "$HERE/compose_review.py" "$S/cmp" "$OUT" "$REV" "$REFS"
run "$HERE/build_body.py" -- --out "$S/${REV}_poses" --no-export --shots poses --samples 16 \
  --only idle,walk,run,aim_rifle,wave
cp "$S/${REV}_poses/pose_sheet.png" "$OUT/${REV}_pose_sheet.png"
echo "review pack for $REV written to $OUT"
