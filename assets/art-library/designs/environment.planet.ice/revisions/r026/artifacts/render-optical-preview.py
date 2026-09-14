import bpy
from pathlib import Path
out=Path(__file__).resolve().parent;bpy.ops.wm.open_mainfile(filepath=str(out/'kit.blend'));scene=bpy.context.scene;scene.cycles.samples=256;scene.cycles.use_denoising=False;scene.render.resolution_percentage=75;scene.render.filepath=str(out/'optical-preview.png');bpy.ops.render.render(write_still=True)
