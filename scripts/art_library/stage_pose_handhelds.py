"""Editable stock fitting revision of original native handhelds; no installed fixtures."""
import bpy,bmesh,json,sys,hashlib
from pathlib import Path
from mathutils import Vector
root=Path(__file__).resolve().parents[2];out=root/'assets/art-library/designs/crew.animation.aim/revisions/r002/equipment';out.mkdir(exist_ok=True)
if (out/'handheld-source.blend').exists():raise RuntimeError('Immutable output exists')
bpy.ops.wm.open_mainfile(filepath=str(root/'assets/source/equipment-kit.blend'));bpy.context.preferences.filepaths.save_version=0
assets=['carbine','long-rifle','compact-pistol','heavy-handgun','sample-scanner','plasma-cutter']
for name in assets:
 obj=bpy.data.objects[name];obj.location=(0,0,0);obj.rotation_euler=(0,0,0)
 if name in ['carbine','long-rifle']:
  mesh=next(c for c in obj.children if c.type=='MESH');bm=bmesh.new();bm.from_mesh(mesh.data);seen=set()
  for v in bm.verts:
   if v in seen:continue
   island=set([v]);todo=[v];seen.add(v)
   while todo:
    current=todo.pop()
    for edge in current.link_edges:
     other=edge.other_vert(current)
     if other not in seen:seen.add(other);island.add(other);todo.append(other)
   # Source helpers use (x,-gltfZ,gltfY); only original stock islands, not receiver.
   center=sum((-p.co.y for p in island))/len(island)
   if center>.14:
    for vertex in island:
     z=-vertex.co.y;vertex.co.y=-(.095+(z-.095)*(.18-.095)/(.4315-.095))
  bm.to_mesh(mesh.data);bm.free()
# Original authored flashlight, fitting the existing 7.5cm grip convention.
flash=bpy.data.objects.new('flashlight',None);bpy.context.collection.objects.link(flash)
for name,pos,size,material in [('grip',(0,0,0),(.075,.155,.09),'rubber'),('body',(0,.06,-.12),(.12,.13,.26),'indigo'),('head',(0,.06,-.26),(.16,.17,.08),'steel'),('lens',(0,.06,-.304),(.13,.13,.009),'cyan')]:
 bpy.ops.mesh.primitive_cube_add(size=1,location=(pos[0],-pos[2],pos[1]));o=bpy.context.object;o.name='GEO-flashlight-'+name;o.dimensions=(size[0],size[2],size[1]);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(bpy.data.materials['equipment.'+material]);o.parent=flash
 mod=o.modifiers.new('Fine manufactured bevel','BEVEL');mod.width=.004;mod.segments=2;bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=mod.name)
assets.append('flashlight')
# Save editable revision with original non-handheld source content retained but not exported.
bpy.ops.wm.save_as_mainfile(filepath=str(out/'handheld-source.blend'))
records=[]
for name in assets:
 obj=bpy.data.objects[name];bpy.ops.object.select_all(action='DESELECT');obj.select_set(True)
 for child in obj.children:child.select_set(True)
 path=out/(name+'.glb');bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_extras=True,export_cameras=False,export_lights=False)
 records.append({'assetId':name,'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'bytes':path.stat().st_size})
(out/'export-manifest.json').write_text(json.dumps({'revision':'r002','source':'handheld-source.blend','sourceSha256':hashlib.sha256((out/'handheld-source.blend').read_bytes()).hexdigest(),'entries':records},indent=2))
