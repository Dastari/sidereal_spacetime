from pathlib import Path
import bpy,json,sys,shutil,hashlib
from mathutils import Vector
root=Path(__file__).resolve().parents[2];out=root/'.runtime/art-library/hull/r006';archive=out/'attempt-palette-before'
if archive.exists():raise ValueError('Palette attempt already preserved; avoid overwriting history')
archive.mkdir()
for name in ['pilot-kit.blend','assembly.glb','cutout.png','blender-closed.png','blender-top.png','blender-side.png','blender-worn.png','blender-damaged.png']:shutil.copy2(out/name,archive/name)
shutil.copytree(out/'outer-diagonal-cheek',archive/'outer-diagonal-cheek')
all_before={str(p.relative_to(out)):hashlib.sha256(p.read_bytes()).hexdigest() for c in json.loads((out/'components.json').read_text()) for p in (out/c['slug']).glob('*.glb')}
bpy.ops.wm.open_mainfile(filepath=str(out/'pilot-kit.blend'));original=bpy.data.materials['Service red'];original_color=list(original.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value)
def linear(c):return c/12.92 if c<=.04045 else ((c+.055)/1.055)**2.4
color=[linear(int('8e345b'[i:i+2],16)/255) for i in [0,2,4]]
mat=original.copy();mat.name='Outer service paint / palette 15 sRGB 8e345b';mat.use_fake_user=True;mat.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value=(*color,1)
col=bpy.data.collections['outer-diagonal-cheek'];count=0
for o in col.objects:
 for slot in o.material_slots:
  if slot.material==original:slot.material=mat;count+=1
for state in ['clean','worn','damaged']:
 bpy.ops.object.select_all(action='DESELECT')
 for o in col.objects:
  o.hide_set(False);o.select_set(True)
  for slot in o.material_slots:
   if slot.material.name.startswith(('clean','worn','damaged')):slot.material=bpy.data.materials[state+(' nameplate' if 'nameplate' in slot.material.name else ' hull paint')]
 bpy.context.view_layer.objects.active=list(col.objects)[0];bpy.ops.export_scene.gltf(filepath=str(out/'outer-diagonal-cheek'/(state+'.glb')),export_format='GLB',use_selection=True,export_apply=True)
for o in col.objects:
 o.hide_set(True)
 for slot in o.material_slots:
  if slot.material.name.startswith(('clean','worn','damaged')):slot.material=bpy.data.materials['clean'+(' nameplate' if 'nameplate' in slot.material.name else ' hull paint')]
assert original_color==list(original.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value)
s=bpy.context.scene;c=s.camera;c.location=(-12,23,13);c.data.ortho_scale=15;c.rotation_euler=(Vector((0,10,1))-c.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.select_all(action='DESELECT')
for o in s.objects:
 if o.type=='MESH' and not o.hide_render:o.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(out/'assembly.glb'),export_format='GLB',use_selection=True,export_apply=True)
bpy.ops.wm.save_as_mainfile(filepath=str(out/'pilot-kit.blend'))
for name,location,roof in [('cutout.png',(-12,23,13),False),('blender-closed.png',(-12,23,13),True),('blender-top.png',(0,10,20),False),('blender-side.png',(-16,10,4),False)]:
 for o in s.objects:
  if o.parent and any(x in o.parent.name for x in ['pilot-roof','vestibule-roof','outer-roof-collar']):o.hide_render=not roof
 c.location=location;c.rotation_euler=(Vector((0,10,0 if name=='blender-top.png' else 1))-c.location).to_track_quat('-Z','Y').to_euler();s.render.filepath=str(out/name);bpy.ops.render.render(write_still=True)
report={'scope':'Only new outer cheek service paint; no reused r004 paint change','srgb_hex':'#8e345b','linear_rgb':color,'legacy_pipeline':'Same piecewise sRGB to linear transfer as scripts/export_voxel_blender.py','assigned_master_material_slots':count,'original_service_red_unchanged':True,'unchanged_native_glbs':[p for p,sha in all_before.items() if hashlib.sha256((out/p).read_bytes()).hexdigest()==sha],'changed_native_glbs':[p for p,sha in all_before.items() if hashlib.sha256((out/p).read_bytes()).hexdigest()!=sha]};(out/'palette-correction.json').write_text(json.dumps(report,indent=2));print('PALETTE_COMPLETE',flush=True)
