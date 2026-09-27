"""Compose review images with ffmpeg: reference | new | previous (| older) at equal height, labelled.
python3 compose_review.py CMP_DIR OUT_DIR REV REFS_DIR"""
import os
import subprocess
import sys

cmp_dir, out, rev, refs = sys.argv[1:5]
FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"


def panel(src, label, dst, h=900, crop=None):
    vf = (f"crop={crop}," if crop else "") + f"scale=-2:{h}:flags=lanczos,pad=iw+16:ih:8:0:color=0x0b1530," \
        f"drawtext=fontfile={FONT}:text='{label}':x=18:y=14:fontsize=26:fontcolor=0x9fd8ff"
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", src, "-vf", vf, dst], check=True)
    return dst


def hstack(items, dst):
    ins = sum((["-i", i] for i in items), [])
    fc = "".join(f"[{k}:v]" for k in range(len(items))) + f"hstack=inputs={len(items)}[v]"
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", *ins, "-filter_complex", fc, "-map", "[v]", dst], check=True)


t = os.path.join(cmp_dir, "_p")
os.makedirs(t, exist_ok=True)
items = [panel(f"{refs}/crew_front_large.png", "reference crew", f"{t}/a.png"),
         panel(f"{refs}/base_rig_male.png", "reference base rig", f"{t}/b.png"),
         panel(f"{cmp_dir}/{rev}_front.png", rev, f"{t}/c.png"),
         panel(f"{cmp_dir}/prev_front.png", "previous", f"{t}/d.png")]
if os.path.exists(f"{cmp_dir}/prev2_front.png"):
    items.append(panel(f"{cmp_dir}/prev2_front.png", "older", f"{t}/e.png"))
hstack(items, f"{out}/{rev}_side_by_side.png")
# surface close-up: reference torso crop vs ours
close = [panel(f"{refs}/crew_front_large.png", "reference torso", f"{t}/f.png", crop="iw*0.7:ih*0.42:iw*0.15:ih*0.42"),
         panel(f"{cmp_dir}/{rev}_close.png", f"{rev} torso", f"{t}/g.png"),
         panel(f"{cmp_dir}/prev_close.png", "previous torso", f"{t}/h.png")]
hstack(close, f"{out}/{rev}_surface_closeup.png")
print("composed", rev)
