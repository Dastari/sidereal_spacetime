#!/usr/bin/env bash
# Sequential evidence pack (one Blender at a time): export -> pose sheet -> wardrobe -> loops.
# Usage: evidence_pack.sh SCRATCH_DIR PROGRESS_DIR [LOOP_NAMES]
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
S="${1:?scratch}"
OUT="${2:?progress dir}"
LOOPS="${3:-}"
REV="$(python3 -c "import sys; sys.path.insert(0, '$HERE'); import rig; print(rig.REVISION)")"
export TMPDIR="$S/tmp"
mkdir -p "$TMPDIR" "$OUT/loops"
run() { blender -b --factory-startup -P "$HERE/build_body.py" -- "$@" 2>&1 | grep -E "CREW_BODY_DONE|Traceback|Error:" | grep -v EGL | cut -c1-160 || true; }
echo "== export"; run --out "$S/$REV" --no-render
echo "== poses"; run --out "$S/${REV}_poses" --no-export --shots poses --samples 16 --only idle,walk,run,aim_rifle,wave
cp "$S/${REV}_poses/pose_sheet.png" "$OUT/${REV}_pose_sheet.png"
echo "== wardrobe"; run --out "$S/${REV}_wardrobe" --no-export --shots wardrobe --samples 16 --only idle
for f in wardrobe_male wardrobe_female wardrobe_lineup; do cp "$S/${REV}_wardrobe/$f.png" "$OUT/${REV}_$f.png"; done
echo "== loops"
run --out "$S/${REV}_loops" --no-export --shots loops --samples 6 ${LOOPS:+--loops "$LOOPS"}
cp "$S/${REV}_loops/loops/"*.mp4 "$S/${REV}_loops/loops/"*.gif "$OUT/loops/" 2>/dev/null || true
echo "evidence pack for $REV done"
