"""Render original equipment thumbnails; managed dev.py export-inventory-icons.
Loads the preserved source read-only and never saves a modified .blend.
"""
import bpy, hashlib, json, math
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[1]
SOURCE=ROOT/'assets/source/equipment-kit.blend'
OUT=ROOT/'assets/runtime/equipment/icons'; OUT.mkdir(parents=True,exist_ok=True)
source_hash=hashlib.sha256(SOURCE.read_bytes()).hexdigest()
bpy.ops.wm.open_mainfile(filepath=str(SOURCE))
scene=bpy.context.scene
for obj in scene.objects: obj.hide_render=True
scene.render.engine='CYCLES'; scene.cycles.device='CPU';scene.cycles.samples=48;scene.cycles.use_denoising=False
scene.render.resolution_x=256;scene.render.resolution_y=256;scene.render.resolution_percentage=100
scene.render.film_transparent=True;scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA';scene.render.image_settings.color_depth='8';scene.render.image_settings.compression=90
scene.view_settings.view_transform='AgX';scene.view_settings.look='AgX - Medium High Contrast';scene.view_settings.exposure=0;scene.view_settings.gamma=1
world=bpy.data.worlds.new('Inventory-neutral-studio');world.use_nodes=True;world.node_tree.nodes['Background'].inputs['Color'].default_value=(.32,.36,.43,1);world.node_tree.nodes['Background'].inputs['Strength'].default_value=.45;scene.world=world
bpy.ops.object.camera_add();camera=bpy.context.object;camera.name='REVIEW-inventory-camera';camera.data.type='ORTHO';scene.camera=camera
lights=[]
for name,power,size in [('key',190,3),('fill',90,3),('rim',140,2)]:
 bpy.ops.object.light_add(type='AREA');light=bpy.context.object;light.name='REVIEW-inventory-'+name;light.data.energy=power;light.data.shape='DISK';light.data.size=size;lights.append(light)
assets=['compact-pistol','heavy-handgun','carbine','long-rifle','sample-scanner','medkit','power-cell','utility-backpack','resource-canister','plasma-cutter','supply-crate']
entries=[]
for asset in assets:
 root=bpy.data.objects.get(asset);assert root is not None,asset
 root.location=(0,0,0);root.rotation_euler=(0,0,0);root.scale=(1,1,1)
 meshes=[obj for obj in root.children_recursive if obj.type=='MESH'];assert meshes
 for obj in meshes:obj.hide_render=False
 bpy.context.view_layer.update()
 points=[obj.matrix_world@Vector(corner) for obj in meshes for corner in obj.bound_box]
 center=Vector(tuple((min(p[k] for p in points)+max(p[k] for p in points))/2 for k in range(3)))
 # Guns/tools expose their long broad side, avoiding an end-on barrel silhouette.
 # Packs/cases instead expose the authored service panel and grip/handle.
 view=Vector((5,3,3.6)) if asset in ['compact-pistol','heavy-handgun','carbine','long-rifle','sample-scanner','plasma-cutter'] else Vector((3,-5,3.6))
 if asset in ['sample-scanner','resource-canister']: view=Vector((3,5,3.2))
 camera.location=center+view.normalized()*4
 camera.rotation_euler=(center-camera.location).to_track_quat('-Z','Y').to_euler()
 bpy.context.view_layer.update();inverse=camera.matrix_world.inverted()
 projected=[inverse@p for p in points]
 extent=max(max(p.x for p in projected)-min(p.x for p in projected),max(p.y for p in projected)-min(p.y for p in projected))
 camera.data.ortho_scale=extent*1.20
 for light,offset in zip(lights,[(2,-3,4),(-3,-1,2),(0,3,3)]):
  light.location=center+Vector(offset);light.rotation_euler=(center-light.location).to_track_quat('-Z','Y').to_euler()
 path=OUT/(asset+'.png');scene.render.filepath=str(path);bpy.ops.render.render(write_still=True)
 image=bpy.data.images.load(str(path),check_existing=False);pixels=list(image.pixels)
 alpha=pixels[3::4];assert min(alpha)==0 and max(alpha)>.99,asset
 occupied=[i for i,a in enumerate(alpha) if a>.02];assert occupied,asset
 bounds=[min(i%256 for i in occupied),min(i//256 for i in occupied),max(i%256 for i in occupied)+1,max(i//256 for i in occupied)+1]
 assert all(6<=v<=250 for v in bounds),f'Clipped icon: {asset} {bounds}'
 entries.append({'assetId':asset,'file':path.name,'width':256,'height':256,'rgba':True,'boundsPixels':bounds,'bytes':path.stat().st_size,'sha256':hashlib.sha256(path.read_bytes()).hexdigest()})
 bpy.data.images.remove(image)
 for obj in meshes:obj.hide_render=True
# Review-only contact sheet from the actual transparent outputs, with no redraw.
width,height=1024,768
sheet=bpy.data.images.new('Inventory contact sheet',width=width,height=height,alpha=True)
canvas=[.024,.035,.055,1.]*(width*height)
for index,entry in enumerate(entries):
 image=bpy.data.images.load(str(OUT/entry['file']),check_existing=False);data=list(image.pixels)
 x0=(index%4)*256;y0=height-(index//4+1)*256
 for y in range(256):
  for x in range(256):
   source=(y*256+x)*4;target=((y0+y)*width+x0+x)*4;a=data[source+3]
   for c in range(3):canvas[target+c]=data[source+c]*a+canvas[target+c]*(1-a)
 sheet.pixels.foreach_set(canvas);bpy.data.images.remove(image)
sheet.filepath_raw=str(OUT/'contact-sheet.png');sheet.file_format='PNG';sheet.save()
assert hashlib.sha256(SOURCE.read_bytes()).hexdigest()==source_hash,'Preserved source changed'
total=sum(e['bytes'] for e in entries);assert total<1024*1024,f'Icon payload exceeded 1MiB: {total}'
manifest={'schema':1,'source':str(SOURCE.relative_to(ROOT)),'sourceSha256':source_hash,'generator':'scripts/build_inventory_icons.py','generatorSha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),'camera':'orthographic broad-side three-quarter, 20 percent fit margin','lighting':'neutral CPU Cycles48 samples, shared original PBR materials, transparent film','iconBytes':total,'entries':entries,'contactSheet':'contact-sheet.png','contactSheetSha256':hashlib.sha256((OUT/'contact-sheet.png').read_bytes()).hexdigest()}
(OUT/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(json.dumps({'inventoryIcons':len(entries),'totalIconBytes':total,'sourceUnchanged':True}))
