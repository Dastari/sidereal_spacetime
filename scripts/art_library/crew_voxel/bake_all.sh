#!/usr/bin/env bash
# Full crew bake: one export process + N parallel contact-sheet processes (headless Blender only).
# Usage: scripts/art_library/crew_voxel/bake_all.sh OUT_DIR [SAMPLES]
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
OUT="${1:?out dir}"
SAMPLES="${2:-8}"
mkdir -p "$OUT"
ACTION_GROUPS=(
  "idle,idle_armed,idle_pistol,walk,run,crouch_idle,crouch_walk,aim_rifle,aim_pistol"
  "shoot_rifle,shoot_pistol,reload,melee_swing,throw,pick_up,carry_idle,carry_walk,use_interact"
  "repair_loop,sit,sit_idle,wave,point,cheer,thumbs_up,emote_happy,emote_sad"
  "emote_angry,emote_confused,celebrate,hurt,death,knocked_out,revive,jetpack_hover,climb_ladder"
)
blender -b --factory-startup -P "$HERE/build_body.py" -- --out "$OUT/export" --no-render > "$OUT/export.log" 2>&1 &
i=0
for g in "${ACTION_GROUPS[@]}"; do
  blender -b --factory-startup -P "$HERE/build_body.py" -- --out "$OUT/sheet$i" --no-export --shots anim \
    --samples "$SAMPLES" --only "$g" > "$OUT/sheet$i.log" 2>&1 &
  i=$((i + 1))
done
blender -b --factory-startup -P "$HERE/build_body.py" -- --out "$OUT/turn" --no-export --no-anim --shots turnaround \
  --samples 24 > "$OUT/turn.log" 2>&1 &
wait
grep -h "CREW_BODY_DONE\|Traceback\|Error:" "$OUT"/*.log | grep -v EGL || true
