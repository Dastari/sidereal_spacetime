import bpy,bmesh,math,json,sys
from pathlib import Path
from mathutils import Vector
OUT=Path(sys.argv[sys.argv.index('--')+1]);OUT.mkdir(parents=True,exist_ok=True)
audit=json.load(open('.runtime/construction-boundary-kit/r003/attempt-a001/floor-contact-audit.json'))
bpy.ops.wm.open_mainfile(filepath=str(Path('assets/art-library/designs/shipyard.structure.boundary-kit/revisions/r002/boundary-kit.blend').resolve()))
S=bpy.context.scene
coll=bpy.data.collections.new('AUTHORING-FLUSH-SEAM-CONTACT-R003');S.collection.children.link(coll)
profile=[(x-1,min(.1875,z))for x,z in audit['derivedSeamProfileXZ']]
verts=[(x,y,z)for y in [-.09,-.045]for x,z in profile];n=len(profile)
faces=[tuple(range(n-1,-1,-1)),tuple(range(n,2*n))]+[(i,(i+1)%n,(i+1)%n+n,i+n)for i in range(n)]
me=bpy.data.meshes.new('flush-contact-native');me.from_pydata(verts,[],faces);me.update();bm=bmesh.new();bm.from_mesh(me);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bmesh.ops.triangulate(bm,faces=list(bm.faces));bm.to_mesh(me);bm.free();me.update()
mat=bpy.data.materials['MAT-gasket-contact-seat'].copy();mat.name='MAT-flush-threshold-contact';mat.use_backface_culling=True;mat.node_tree.nodes.get('Principled BSDF').inputs['Roughness'].default_value=.36;me.materials.append(mat)
uv=me.uv_layers.new(name='UVMap')
for f in me.polygons:
 axis=max(range(3),key=lambda i:abs(f.normal[i]));axes=[i for i in range(3)if i!=axis]
 for li in f.loop_indices:
  v=me.vertices[me.loops[li].vertex_index].co;uv.data[li].uv=(v[axes[0]],v[axes[1]])
insert=bpy.data.objects.new('GEO-door-flush-seam-contact--surface',me);coll.objects.link(insert);insert['interface']='Exact native orthogonal floor seam complement; floorTop6; no pressure rating'
# Export identity-local insert; instance translation to seamX is explicit metadata.
bpy.ops.object.select_all(action='DESELECT');insert.select_set(True);bpy.context.view_layer.objects.active=insert
bpy.ops.export_scene.gltf(filepath=str(OUT/'kit.glb'),export_format='GLB',use_selection=True,export_apply=False,export_yup=True,export_texcoords=True,export_normals=True,export_tangents=True,export_materials='EXPORT',export_extras=True)
# Actual installed floor mesh copies in source context, not ideal plane.
before=set(bpy.data.objects);bpy.ops.import_scene.gltf(filepath=str(Path('assets/runtime/assembly/floor/r002/kit.glb').resolve()));imported=set(bpy.data.objects)-before
original=next(o for o in imported if o.name.startswith('GEO-part-0b833a4f3016609e9b96--floor'))
data=original.data.copy();matrix=original.matrix_world.copy()
for o in imported:bpy.data.objects.remove(o,do_unlink=True)
for x in range(2):
 for y in range(-2,1):
  ob=bpy.data.objects.new('REVIEW-native-quarter-%d-%d'%(x,y),data);S.collection.objects.link(ob);ob.matrix_world=matrix;ob.location+=Vector((x,y,0))
insert.location.x=1
for ob in S.objects:
 if ob.type=='MESH':ob.hide_render=not(ob.name.startswith(('GEO-door-frame-2m--','GEO-door-leaf--','GEO-door-perimeter-seal--','GEO-door-frame-seal-seat--','GEO-door-flush-seam-contact--','REVIEW-native-quarter-')));ob.hide_set(ob.hide_render)
# Save editable source before temporary evidence visibility changes.
S.render.engine='CYCLES';S.cycles.device='CPU';S.cycles.samples=48;S.cycles.use_denoising=False;S.render.threads_mode='FIXED';S.render.threads=4;S.view_settings.view_transform='AgX';bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'boundary-kit.blend'))
for ob in S.objects:
 if ob.type in ['LIGHT','CAMERA']:bpy.data.objects.remove(ob,do_unlink=True)
def light(name,pos,power,size,target=(1,0,1)):
 d=bpy.data.lights.new(name,'AREA');d.energy=power;d.size=size;o=bpy.data.objects.new(name,d);S.collection.objects.link(o);o.location=pos;o.rotation_euler=(Vector(target)-o.location).to_track_quat('-Z','Y').to_euler()
light('KEY',(-2,-4,5),850,3);light('FILL',(4,-2,3),350,3);light('BACK',(1,3,4),700,3)
d=bpy.data.cameras.new('REVIEW-camera');cam=bpy.data.objects.new('REVIEW-camera',d);S.collection.objects.link(cam);S.camera=cam;d.type='ORTHO'
def capture(name,pos,target,scale,transparent=False):
 cam.location=pos;cam.rotation_euler=(Vector(target)-cam.location).to_track_quat('-Z','Y').to_euler();d.ortho_scale=scale;d.clip_start=.00005;S.render.resolution_x=1000;S.render.resolution_y=900;S.render.resolution_percentage=100;S.render.image_settings.file_format='PNG';S.render.image_settings.color_mode='RGBA';S.render.film_transparent=transparent;S.render.filepath=str(OUT/name);bpy.ops.render.render(write_still=True)
ring=bpy.data.objects['GEO-door-perimeter-seal--surface'];key=ring.data.shape_keys.key_blocks['SealRetracted'];root=bpy.data.objects['ROOT-door-leaf'];key.value=0
capture('closed-native-floor.png',(3,-5,3),(1,-.3,1.35),4.2)
key.value=1;root.rotation_euler.z=-math.pi/2;ring.rotation_euler.z=-math.pi/2
capture('open-native-floor.png',(3,-5,3.5),(1,-.4,1.35),4.5)
# Native floor seam at contact line. Door hidden identically in before/after close evidence.
for ob in S.objects:
 if ob.type=='MESH'and ob.name.startswith('GEO-door-')and ob!=insert:ob.hide_render=True
insert.hide_render=True
capture('native-seam-before.png',(1.03,-.11,.235),(1,-.068,.1855),.052)
insert.hide_render=False
capture('native-seam-after.png',(1.03,-.11,.235),(1,-.068,.1855),.052)
# Actual closed lip contact; front oblique macro.
root.rotation_euler.z=0;ring.rotation_euler.z=0;key.value=0;ring.hide_render=False
capture('closed-lip-contact.png',(1.02,-.13,.23),(1,-.067,.191),.045)
for ob in S.objects:
 if ob.type=='MESH':ob.hide_render=ob!=insert
capture('threshold-cutout.png',(1.04,-.11,.22),(1,-.0675,.1855),.063,True)
(OUT/'geometry.json').write_text(json.dumps({'profileXZLocalM':profile,'extrusionYM':[-.09,-.045],'fixtureTranslationM':[1,0,0],'sourceFloorSha256':audit['floorSha256'],'authoring':'Native Blender mesh from exact exported floor triangle cross-section, UVs/tangents/material retained; source floor unmodified'},indent=2)+'\n')
print('THRESHOLD_COMPLETE')
