"""Retain editable occupancy solids and render actual mapped material variants."""
import bpy,sys,json
from pathlib import Path
from mathutils import Vector
out=Path(sys.argv[sys.argv.index('--')+1]);bpy.ops.wm.open_mainfile(filepath=str(out/'pilot-kit.blend'))
old=bpy.data.collections.get('OCCUPANCY-PROXIES-OPAQUE')
if old:
 for obj in list(old.objects):bpy.data.objects.remove(obj,do_unlink=True)
 bpy.data.collections.remove(old)
for state in ['worn','damaged']:
 for suffix in [' hull paint',' nameplate']:
  mat=bpy.data.materials['clean'+suffix].copy();mat.name=state+suffix;mat.use_fake_user=True
  for node in mat.node_tree.nodes:
   if node.type=='TEX_IMAGE':
    name=Path(node.image.filepath).name.replace('clean-',state+'-');node.image=bpy.data.images.load(str(out/'maps'/name),check_existing=True);node.image.pack()
    if 'normal' in name or 'roughness' in name:node.image.colorspace_settings.name='Non-Color'
col=bpy.data.collections.new('OCCUPANCY-PROXIES-OPAQUE');bpy.context.scene.collection.children.link(col)
for c in json.loads((out/'components.json').read_text()):
 slug=c['slug'];w,_,h=c['nominal_dimensions_m'];corner='corner' in slug;tile=slug.startswith(('floor','roof'));diag='diagonal' in slug
 xy=[(0,0),(2,0),(0,2)] if corner else [(0,0),(w,0),(w,2),(0,2)] if tile else [(0,0),(w,2),(w-(.75 if w==4 else .375),2),(0,.375)] if diag else [(0,0),(2,0),(2,.375),(0,.375)]
 n=len(xy);m=bpy.data.meshes.new('Solid proxy '+slug);m.from_pydata([(x,y,z) for z in [0,h] for x,y in xy],[],[tuple(reversed(range(n))),tuple(range(n,n*2))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]);m.materials.append(bpy.data.materials['Opaque occupancy only']);o=bpy.data.objects.new('PROXY-'+slug,m);col.objects.link(o);o.hide_render=True;o.hide_set(True);o['representation']='Opaque occupied-cell proxy, not optical visual';o['cell_meters']=.0625
s=bpy.context.scene;c=s.camera;c.location=(-12,18,12);c.data.ortho_scale=16;c.rotation_euler=(Vector((0,7,1))-c.location).to_track_quat('-Z','Y').to_euler();s.cycles.use_denoising=False;s.cycles.samples=48
bpy.ops.wm.save_as_mainfile(filepath=str(out/'pilot-kit.blend'))
for state in ['worn','damaged']:
 for o in s.objects:
  if o.type!='MESH' or o.hide_render:continue
  for slot in o.material_slots:
   if slot.material.name.startswith('clean'):slot.material=bpy.data.materials[state+(' nameplate' if 'nameplate' in slot.material.name else ' hull paint')]
 s.render.filepath=str(out/f'blender-{state}.png');bpy.ops.render.render(write_still=True)
 for o in s.objects:
  if o.type!='MESH':continue
  for slot in o.material_slots:
   if slot.material.name.startswith(state):slot.material=bpy.data.materials['clean'+(' nameplate' if 'nameplate' in slot.material.name else ' hull paint')]
