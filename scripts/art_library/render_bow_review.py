"""Render the actual dressed Wren kit in Blender. Reads a prefab-dress-dump JSON.
Run with nice -n 15 blender -b -t 2 -P this-file -- DUMP OUTPUT.png.
Evidence only: no runtime publication, authority, or asset mutation.
"""
import json
import math
import sys
from pathlib import Path
import bpy
from mathutils import Vector
sys.path.insert(0, str(Path(__file__).resolve().parent))
import render_prefabs as R

args = sys.argv[sys.argv.index('--') + 1:]
dump, output = Path(args[0]), Path(args[1])
work = output.parent / 'blender-work'
work.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
sc, cam = R.setup_scene(16)
detail = R.P.detail_height(str(work / 'detail.png'))
ship = R.Ship(json.loads(dump.read_text()), detail, str(work))
ship.show('flight', scale=False)
# Same fore/starboard quarter as Babylon alpha=-.6, beta=.95.
target = Vector((9.5, 3, 1.2))
beta, alpha = .95, -.6
direction = Vector((-math.sin(alpha) * math.sin(beta), -math.cos(alpha) * math.sin(beta), math.cos(beta)))
cam.location = target + direction * 15
cam.rotation_euler = (target - cam.location).to_track_quat('-Z', 'Y').to_euler()
cam.data.type = 'PERSP'
cam.data.sensor_fit = "VERTICAL"
cam.data.sensor_height = 24
cam.data.lens = 24 / (2 * math.tan(.5 / 2))
# Eevee matches the game's real-time material treatment; run with LP_NUM_THREADS=2.
sc.render.engine = 'BLENDER_EEVEE_NEXT'
sc.eevee.taa_render_samples = 64
sc.render.resolution_x, sc.render.resolution_y = 1200, 900
sc.render.resolution_percentage = 100
sc.render.filepath = str(output)
bpy.ops.wm.save_as_mainfile(filepath=str(output.with_suffix('.blend')), compress=True)
bpy.ops.render.render(write_still=True)
