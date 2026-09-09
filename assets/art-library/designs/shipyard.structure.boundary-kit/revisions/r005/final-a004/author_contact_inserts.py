import bpy,bmesh,json,math
from pathlib import Path
from mathutils import Vector
OUT=Path('.runtime/construction-boundary-kit/r005/candidate-a004');plan=json.load(open(OUT/'contact-plan.json'));bpy.ops.wm.read_factory_settings(use_empty=True);S=bpy.context.scene;S.unit_settings.system='METRIC';bpy.context.preferences.filepaths.save_version=0
mat=bpy.data.materials.new('MAT-boundary-r005-fitted-contact-alloy');mat.use_nodes=True;mat.use_backface_culling=True;n=mat.node_tree.nodes.get('Principled BSDF');n.inputs['Base Color'].default_value=(.3,.095,.035,1);n.inputs['Metallic'].default_value=.65;n.inputs['Roughness'].default_value=.32;mat.diffuse_color=(.3,.095,.035,1)
exports={};counts={}
for p in plan['parts']:
 verts=[];faces=[]
 for patch in p['patches']:
  a=patch['bottomTriangleM'];bottom=[tuple(v)for v in a];top=[(v[0],v[1],.1875)for v in a];vs=[];mapping=[]
  for v in bottom+top:
   found=next((i for i,w in enumerate(vs)if sum((v[k]-w[k])**2 for k in range(3))<1e-20),None)
   if found is None:found=len(vs);vs.append(v)
   mapping.append(found)
  fs=[(2,1,0),(3,4,5),(0,1,4,3),(1,2,5,4),(2,0,3,5)]
  for f in fs:
   idx=list(dict.fromkeys(mapping[i]for i in f))
   if len(idx)>=3:faces.append(tuple(len(verts)+i for i in idx))
  verts.extend(vs)
 me=bpy.data.meshes.new('MESH-'+p['id']+'-native-triangle-contact-solids');me.from_pydata(verts,[],faces);me.update();bm=bmesh.new();bm.from_mesh(me);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bmesh.ops.triangulate(bm,faces=list(bm.faces));bm.to_mesh(me);bm.free();me.materials.append(mat);uv=me.uv_layers.new(name='UVMap')
 for f in me.polygons:
  axis=max(range(3),key=lambda i:abs(f.normal[i]));axes=[i for i in range(3)if i!=axis]
  for li in f.loop_indices:
   co=me.vertices[me.loops[li].vertex_index].co;uv.data[li].uv=(co[axes[0]],co[axes[1]])
 ob=bpy.data.objects.new('GEO-boundary-r005-'+p['id']+'--surface',me);S.collection.objects.link(ob);exports[p['id']]=ob;counts[p['id']]={'triangles':len(me.polygons),'vertices':len(me.vertices),'patchSolids':len(p['patches'])}
bpy.ops.object.select_all(action='DESELECT')
for ob in exports.values():ob.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(OUT/'kit.glb'),export_format='GLB',use_selection=True,export_yup=True,export_normals=True,export_tangents=True,export_materials='EXPORT',export_cameras=False,export_lights=False)
for ob in exports.values():ob.hide_render=True;ob.hide_set(True)
(OUT/'native-report.json').write_text(json.dumps(counts,indent=2)+'\n')
# Preserve installed native floor/wall dependencies in isolated evidence collection, never re-export them.
before=set(bpy.data.objects);bpy.ops.import_scene.gltf(filepath='assets/runtime/assembly/floor/r002/kit.glb');floors={o.name:o for o in set(bpy.data.objects)-before if o.type=='MESH'}
before=set(bpy.data.objects);bpy.ops.import_scene.gltf(filepath='assets/art-library/designs/shipyard.structure.boundary-kit/revisions/r004/family/kit.glb');walls={o.name:o for o in set(bpy.data.objects)-before if o.type=='MESH'}
for ob in list(floors.values())+list(walls.values()):ob.hide_render=True;ob.hide_set(True)
fixtures={f['id']:f for f in plan['fixtures']};placed=[]
def clear():
 for ob in placed:bpy.data.objects.remove(ob,do_unlink=True)
 placed.clear()
def dup(ob,xy=(0,0),q=0,z=0,name='review'):
 new=ob.copy();new.data=ob.data;new.name='GEO-r005-'+name;S.collection.objects.link(new);new.hide_render=False;new.hide_set(False);new.location=(xy[0],xy[1],z);new.rotation_mode='XYZ';new.rotation_euler=(0,0,q*math.pi/2);placed.append(new);return new
def fixture(fid,offset=(0,0),showwalls=False,explode=0,contact=True):
 f=fixtures[fid]
 for p in f['nativeFloors']:dup(floors[p['native']['nodePrefix']],(offset[0]+p['originUnits'][0]/32,offset[1]+p['originUnits'][1]/32),p['quarterTurns'],0,'floor')
 if contact:
  for p in f['placements']:dup(exports[p['partId']],(offset[0]+p['originUnits'][0]/32,offset[1]+p['originUnits'][1]/32),p['quarterTurns'],explode,'contact')
 if showwalls:
  for p in f['nativeWalls']:dup(walls['GEO-boundary-r004-'+p['partId']+'--surface'],(offset[0]+p['originUnits'][0]/32,offset[1]+p['originUnits'][1]/32),p['quarterTurns'],0,'wall')
S.render.engine='CYCLES';S.cycles.device='CPU';S.cycles.samples=32;S.cycles.use_denoising=False;S.render.resolution_percentage=100;S.render.image_settings.file_format='PNG';S.view_settings.view_transform='AgX';S.render.film_transparent=False;S.world=bpy.data.worlds.new('Review blue studio');S.world.use_nodes=True;S.world.node_tree.nodes['Background'].inputs[0].default_value=(.055,.08,.13,1);S.world.node_tree.nodes['Background'].inputs[1].default_value=.6
for name,pos,power,size in [('Key',(1,-3,8),1300,6),('Fill',(-4,1,5),850,5),('Rim',(5,6,7),1700,4)]:
 d=bpy.data.lights.new(name,'AREA');d.energy=power;d.shape='DISK';d.size=size;ob=bpy.data.objects.new(name,d);S.collection.objects.link(ob);ob.location=pos;ob.rotation_euler=(Vector((2,1,0))-ob.location).to_track_quat('-Z','Y').to_euler()
camera=bpy.data.objects.new('CAM-r005-contact-proof',bpy.data.cameras.new('CAM-r005-contact-proof'));S.collection.objects.link(camera);S.camera=camera;camera.data.type='ORTHO';camera.data.clip_start=.0001;camera.data.clip_end=100
records=[]
def render(name,position,target,scale,w=1400,h=1000,alpha=False):
 camera.location=position;camera.rotation_euler=(Vector(target)-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.ortho_scale=scale;S.render.resolution_x=w;S.render.resolution_y=h;S.render.film_transparent=alpha;S.render.image_settings.color_mode='RGBA'if alpha else'RGB';S.render.filepath=str(OUT/(name+'.png'));bpy.ops.render.render(write_still=True);records.append({'path':name+'.png','camera':position,'target':target,'orthoScaleM':scale,'width':w,'height':h,'actualGeometryScale':1,'context':'Native Blender geometry; exploded contact insert translation only where filename says exploded'})
# Actual thin inserts are largely concealed in use; exploded evidence exposes them without scaling geometry.
fixture('audit-T-eight-quarter-seams',showwalls=False,explode=.065)
render('T-contact-exploded',(5,-4,4),(2,1,.1),5.1)
clear();fixture('audit-T-eight-quarter-seams',showwalls=False)
render('T-contact-installed',(4,-4,5),(2,1,.1875),4.8)
render('T-junction-contact-close',(2.18,-.24,.45),(2,0,.1875),.23)
clear();fixture('audit-T-eight-quarter-seams',showwalls=False,contact=False)
render('T-junction-before',(2.18,-.24,.45),(2,0,.1875),.23)
clear();fixture('audit-T-eight-quarter-seams',showwalls=True)
render('T-wall-base-installed',(6,-7,8),(2,1,1.2),7.8)
clear();fixture('mixed-square-triangle',explode=.07)
render('diagonal-contact-exploded',(5,-4,4),(1.5,1,.1),5.2)
clear()
for i,f in enumerate(plan['fixtures'][:12]):fixture(f['id'],offset=((i%4)*6,(i//4)*6),explode=.08)
render('all12-contact-board',(16,-18,26),(10,7,0),27,2000,1600)
clear();p=next(p for p in plan['parts']if p['floorPartId']=='quarter-1m');dup(exports[p['id']]);render('native-contact-cutout',(1.8,-1.6,1.4),(.5,.5,.186),1.5,1100,1000,True)
# Save with meaningful assembled T fixture; cutout export source remains named and editable.
clear();fixture('audit-T-eight-quarter-seams',showwalls=True);S.render.film_transparent=False
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'boundary-kit.blend'));(OUT/'capture-record.json').write_text(json.dumps({'renderer':'Blender4.3.2 Cycles CPU32samples AgX','images':records},indent=2)+'\n');print('R005_DONE',flush=True)
