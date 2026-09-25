import bpy,sys
from pathlib import Path
O=Path(sys.argv[sys.argv.index('--')+1]);bpy.ops.wm.open_mainfile(filepath=str(O/'review-assembly.blend'));s=bpy.context.scene
p=bpy.data.materials['MAT-Frontier-roof-dark'].node_tree.nodes.get('Principled BSDF');links=bpy.data.materials['MAT-Frontier-roof-dark'].node_tree.links
for l in list(p.inputs['Normal'].links):links.remove(l)
s.render.resolution_percentage=60;s.cycles.samples=16;s.render.filepath=str(O/'diagnostic-no-normal.png');bpy.ops.render.render(write_still=True)
