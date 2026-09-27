"""Render saved native kit; also export its open assembly as review GLB."""
from pathlib import Path
import sys,bpy
from mathutils import Vector
out=Path(sys.argv[sys.argv.index('--')+1]);bpy.ops.wm.open_mainfile(filepath=str(out/'pilot-kit.blend'))
s=bpy.context.scene;s.cycles.use_denoising=False;s.cycles.samples=48
c=s.camera
c.location=(-12,18,12);c.data.ortho_scale=16;c.rotation_euler=(Vector((0,7,1))-c.location).to_track_quat('-Z','Y').to_euler()
for o in s.objects:
 if o.parent and 'roof-' in o.parent.name:o.hide_render=False
s.render.filepath=str(out/'blender-closed.png');bpy.ops.render.render(write_still=True)
for o in s.objects:
 if o.parent and 'roof-' in o.parent.name:o.hide_render=True
s.render.filepath=str(out/'cutout.png');bpy.ops.render.render(write_still=True)
bpy.ops.object.select_all(action='DESELECT')
for o in s.objects:
 if o.type=='MESH' and not o.hide_render:o.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(out/'assembly.glb'),use_selection=True,export_format='GLB',export_apply=True)
c.location=(0,7,20);c.rotation_euler=(Vector((0,7,0))-c.location).to_track_quat('-Z','Y').to_euler();s.render.filepath=str(out/'blender-top.png');bpy.ops.render.render(write_still=True)
# Each kit component gets a transparent cutout and a standalone editable source.
for o in s.objects:
 if o.type=='MESH':o.hide_render=True
c.data.ortho_scale=5;c.location=(4,-5,4)
for component in __import__('json').loads((out/'components.json').read_text()):
 col=bpy.data.collections[component['slug']]
 for o in col.objects:o.hide_render=False;o.hide_set(False)
 target=Vector((component['nominal_dimensions_m'][0]/2,.7,.5));c.location=target+Vector((4,-6,4));c.rotation_euler=(target-c.location).to_track_quat('-Z','Y').to_euler();s.render.resolution_x=700;s.render.resolution_y=600;s.render.filepath=str(out/component['slug']/'cutout.png');bpy.ops.render.render(write_still=True)
 # The shared source contains editable masters for all modules; no flattened export round trip.
 for o in col.objects:o.hide_render=True;o.hide_set(True)
