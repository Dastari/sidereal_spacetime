import bpy,bmesh,math,json,sys,hashlib,random
from pathlib import Path
from mathutils import Vector
OUT=Path('.runtime/construction-boundary-kit/r004/candidate-a006');plan=json.loads((OUT/'family-plan.json').read_text())
bpy.ops.wm.read_factory_settings(use_empty=True);S=bpy.context.scene;S.unit_settings.system='METRIC'
source=bpy.data.collections.new('AUTHORING-editable-native-parts');S.collection.children.link(source);exports=bpy.data.collections.new('EXPORT-pinned-local-geometry');S.collection.children.link(exports);reviews=bpy.data.collections.new('REVIEW-actual-native-shell-fixtures');S.collection.children.link(reviews)
mats={}
def mat(k,c,rough,metal,emit=0):
 m=bpy.data.materials.new('MAT-boundary-r004-'+k);m.use_nodes=True;m.use_backface_culling=True;n=m.node_tree.nodes.get('Principled BSDF');n.inputs['Base Color'].default_value=(*c,1);n.inputs['Roughness'].default_value=rough;n.inputs['Metallic'].default_value=metal
 if emit:n.inputs['Emission Color'].default_value=(*c,1);n.inputs['Emission Strength'].default_value=emit
 m.diffuse_color=(*c,1);mats[k]=m
mat('core',(.055,.082,.112),.43,.45);mat('pale',(.48,.57,.65),.3,.025);mat('recess',(.016,.027,.045),.46,.05);mat('wine',(.18,.025,.047),.32,.08);mat('steel',(.31,.4,.47),.25,.8);mat('cyan',(.003,.68,1),.23,.05,2.8)
# Shared authored micro-normal detail; no micro-geometry and no core perforation.
im=bpy.data.images.new('boundary-r004-enamel-normal',width=64,height=64,alpha=True);im.colorspace_settings.name='Non-Color';rng=random.Random(4);pix=[]
for _ in range(64*64):
 x=rng.uniform(-.022,.022);y=rng.uniform(-.022,.022);pix.extend((.5+x/2,.5+y/2,.5+math.sqrt(1-x*x-y*y)/2,1))
im.pixels.foreach_set(pix);im.filepath_raw=str(OUT/'enamel-normal.png');im.file_format='PNG';im.save();im.pack()
for k in ['pale','wine']:
 m=mats[k];tex=m.node_tree.nodes.new('ShaderNodeTexImage');tex.image=im;nm=m.node_tree.nodes.new('ShaderNodeNormalMap');nm.inputs['Strength'].default_value=.24;m.node_tree.links.new(tex.outputs['Color'],nm.inputs['Color']);m.node_tree.links.new(nm.outputs['Normal'],m.node_tree.nodes.get('Principled BSDF').inputs['Normal'])
roots={};objects={};current=None
def prism(name,p,z0,z1,material,bevel=0):
 if sum(a[0]*b[1]-a[1]*b[0]for a,b in zip(p,p[1:]+p[:1]))<0:p=p[::-1]
 n=len(p);vs=[(x,y,z)for z in [z0,z1]for x,y in p];faces=[tuple(range(n-1,-1,-1)),tuple(range(n,2*n))]+[(i,(i+1)%n,(i+1)%n+n,i+n)for i in range(n)];me=bpy.data.meshes.new(current+'-'+name);me.from_pydata(vs,[],faces);me.update();bm=bmesh.new();bm.from_mesh(me);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(me);bm.free();me.materials.append(mats[material]);ob=bpy.data.objects.new('GEO-'+current+'--'+name,me);source.objects.link(ob);ob.parent=roots[current];objects[current].append(ob)
 uv=me.uv_layers.new(name='UVMap')
 for f in me.polygons:
  axis=max(range(3),key=lambda i:abs(f.normal[i]));axes=[i for i in range(3)if i!=axis]
  for li in f.loop_indices:
   co=me.vertices[me.loops[li].vertex_index].co;uv.data[li].uv=(co[axes[0]],co[axes[1]])
 if bevel:
  mod=ob.modifiers.new('Authored bevel','BEVEL');mod.width=bevel;mod.segments=2;mod.limit_method='ANGLE';mod=ob.modifiers.new('Weighted corner response','WEIGHTED_NORMAL');mod.keep_sharp=True
 tri=ob.modifiers.new('Explicit native tangent triangles','TRIANGULATE');tri.keep_custom_normals=True
 return ob

def plate(name,u,n,a,b,y0,y1,z0,z1,k,bev=.003):
 return prism(name,[[u[i]*x+n[i]*y for i in range(2)]for x,y in [(a,y0),(b,y0),(b,y1),(a,y1)]],z0,z1,k,bev)
for part in plan['parts']:
 current=part['id'];roots[current]=bpy.data.objects.new('ROOT-'+current,None);source.objects.link(roots[current]);objects[current]=[]
 core=prism('continuous-core',part['corePolygonM'],.1875,3,'core')
 if part['kind']=='node':
  core.data.materials.append(mats['pale']);core.data.materials.append(mats['steel'])
  for f in core.data.polygons:
   f.material_index=2 if abs(f.normal.z)>.9 else 1
 else:
  d=part['sourceSpanUnits'];L=math.hypot(*d)/32;u=[x/(L*32)for x in d];n=[-u[1],u[0]];start=part['startCutbackM'];end=L-part['endCutbackM'];length=end-start;count=max(1,math.ceil(length/1.15))
  for side in [-1,1]:
   def yy(a,b):return (a,b)if side>0 else(-b,-a)
   y0,y1=yy(.046875,.058875)
   for i in range(count):
    a=start+.021+i*(length-.042)/count;b=start+.021+(i+1)*(length-.042)/count-.014
    for j,(z0,z1)in enumerate([(.31,.91),(.94,2.18),(2.21,2.60)]):plate('panel-%d-%d-%d'%(side,i,j),u,n,a,b,y0,y1,z0,z1,'pale')
    badgeEnd=min(a+.19,b-.01)
    if badgeEnd>a+.02:plate('wine-%d-%d'%(side,i),u,n,a+.01,badgeEnd,*yy(.046875,.057875),2.64,2.72,'wine',.002)
   for k,z0,z1 in [('skirting',.205,.282),('top-cap',2.88,2.985)]:plate(k+str(side),u,n,start+.012,end-.012,*yy(.046875,.061875),z0,z1,'recess',.002)
   plate('cyan'+str(side),u,n,start+.07,end-.07,*yy(.046875,.061875),2.743,2.775,'cyan',.0015)
   plate('base-steel'+str(side),u,n,start+.03,end-.03,*yy(.046875,.057875),.293,.306,'steel',.001)
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'editable-parts.blend'))
print('STAGE_PREEXPORT_SOURCE_SAVED',flush=True)
# Evaluate native modifier stacks into one mesh group per reusable part; preserve authored loop normals/UVs.
bpy.context.view_layer.update();dep=bpy.context.evaluated_depsgraph_get();exported={};nativeReport={}
for part in plan['parts']:
 pid=part['id'];verts=[];faces=[];uvs=[];normals=[];materials=[];face_mats=[]
 for ob in objects[pid]:
  ev=ob.evaluated_get(dep);me=ev.to_mesh(preserve_all_data_layers=True,depsgraph=dep);offset=len(verts);verts.extend(tuple(v.co)for v in me.vertices)
  for f in me.polygons:
   faces.append(tuple(offset+i for i in f.vertices));ma=bpy.data.materials[me.materials[f.material_index].name]
   if ma not in materials:materials.append(ma)
   face_mats.append(materials.index(ma))
   for li in f.loop_indices:uvs.append(tuple(me.uv_layers.active.data[li].uv));normals.append(tuple(me.corner_normals[li].vector))
  ev.to_mesh_clear()
 me=bpy.data.meshes.new('native-'+pid);me.from_pydata(verts,[],faces);me.update()
 for m in materials:me.materials.append(m)
 for f,mi in zip(me.polygons,face_mats):f.material_index=mi
 uv=me.uv_layers.new(name='UVMap')
 for l,v in zip(uv.data,uvs):l.uv=v
 me.normals_split_custom_set(normals);ob=bpy.data.objects.new('GEO-boundary-r004-'+pid+'--surface',me);exports.objects.link(ob);exported[pid]=ob
 nativeReport[pid]={'triangles':len(faces),'materials':len(materials),'vertices':len(verts),'nodePrefix':ob.name}
bpy.ops.object.select_all(action='DESELECT')
for ob in exported.values():ob.select_set(True)
bpy.context.view_layer.objects.active=next(iter(exported.values()))
bpy.ops.export_scene.gltf(filepath=str(OUT/'kit.glb'),export_format='GLB',use_selection=True,export_apply=False,export_yup=True,export_texcoords=True,export_normals=True,export_tangents=True,export_materials='EXPORT')
print('STAGE_EXPORT_DONE',flush=True)
for i,(pid,root)in enumerate(roots.items()):root.location=(i%8*6,25+i//8*6,0)
# Editable part gallery kept separate from actual fixture board.
print('STAGE_LAYOUT_DONE',flush=True)
for ob in list(exported.values()):ob.hide_render=True
print('STAGE_HIDE_DONE',flush=True)
source.hide_render=True
print('STAGE_SOURCE_HIDE_DONE',flush=True)
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'boundary-kit.blend'))
print('STAGE_SOURCE_SAVED',flush=True)
# Import actual native floor and roof assets once for reference fixtures.
def load(path,prefix):
 before=set(bpy.data.objects);bpy.ops.import_scene.gltf(filepath=str(Path(path).resolve()));added=set(bpy.data.objects)-before;lib={}
 for ob in added:
  if ob.type=='MESH':lib[ob.name]={'data':ob.data.copy(),'matrix':ob.matrix_world.copy()}
 for ob in added:bpy.data.objects.remove(ob,do_unlink=True)
 return lib
print('STAGE_FLOOR_IMPORT',flush=True)
floors=load('assets/runtime/assembly/floor/r002/kit.glb','floor');roofs=load('assets/art-library/designs/shipyard.structure.roof-kit/revisions/r001/kit.glb','roof')
fixtureObjects={};roofObjects={}
for index,fixture in enumerate(plan['fixtures']):
 col=index%4;row=index//4;offset=(col*6,row*6);members=[];roofmembers=[]
 for p in fixture['placements']:
  ob=bpy.data.objects.new('REVIEW-'+p['key'],exported[p['partId']].data);reviews.objects.link(ob);ob.location=(offset[0]+p['originUnits'][0]/32,offset[1]+p['originUnits'][1]/32,0);ob.rotation_euler.z=p['quarterTurns']*math.pi/2;members.append(ob)
 for fp in fixture['nativeFloors']:
  for lib,name,z,isroof in [(floors,fp['native']['nodePrefix'],0,False),(roofs,'GEO-roof-'+fp['partId']+'--surface',3,True)]:
   saved=next(v for k,v in lib.items()if k.startswith(name));ob=bpy.data.objects.new('REVIEW-'+fixture['id']+('-roof'if isroof else'-floor')+str(len(members)),saved['data']);reviews.objects.link(ob);ob.matrix_world=saved['matrix'];ob.location+=Vector((offset[0]+fp['originUnits'][0]/32,offset[1]+fp['originUnits'][1]/32,z));ob.rotation_euler.z+=fp['quarterTurns']*math.pi/2;members.append(ob)
   if isroof:roofmembers.append(ob);ob.hide_render=True
 fixtureObjects[fixture['id']]=members;roofObjects[fixture['id']]=roofmembers;fixture['reviewOffsetM']=offset
S.render.engine='CYCLES';S.cycles.device='CPU';S.cycles.samples=32;S.cycles.use_denoising=False;S.render.threads_mode='FIXED';S.render.threads=4;S.view_settings.view_transform='AgX';S.world=bpy.data.worlds.new('Boundary review space');S.world.color=(.035,.035,.035)
for name,pos,power,size in [('KEY',(0,-8,26),12000,12),('FILL',(25,15,24),11000,15),('RIM',(-10,20,15),9000,10)]:
 d=bpy.data.lights.new(name,'AREA');d.energy=power;d.size=size;ob=bpy.data.objects.new(name,d);S.collection.objects.link(ob);ob.location=pos;ob.rotation_euler=(Vector((10,10,0))-ob.location).to_track_quat('-Z','Y').to_euler()
d=bpy.data.cameras.new('REVIEW-camera');cam=bpy.data.objects.new('REVIEW-camera',d);S.collection.objects.link(cam);S.camera=cam;d.type='ORTHO';d.clip_end=1000
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'boundary-kit.blend'))
def capture(name,pos,target,scale,w=1200,h=1000):
 cam.location=pos;cam.rotation_euler=(Vector(target)-cam.location).to_track_quat('-Z','Y').to_euler();d.ortho_scale=scale;S.render.resolution_x=w;S.render.resolution_y=h;S.render.resolution_percentage=100;S.render.image_settings.file_format='PNG';S.render.image_settings.color_mode='RGBA';S.render.filepath=str(OUT/name);bpy.ops.render.render(write_still=True)
# All12 single-floor loops board: labels are authored scene text, no reference pixels edited.
labels=[]
for i,f in enumerate(plan['fixtures'][:12]):
 tx=bpy.data.curves.new('label-'+f['id'],'FONT');tx.body=f['id'][7:];tx.size=.29;ob=bpy.data.objects.new('LABEL-'+f['id'],tx);reviews.objects.link(ob);ob.location=(f['reviewOffsetM'][0],f['reviewOffsetM'][1]-.62,.01);labels.append(ob)
for f in plan['fixtures'][12:]:
 for ob in fixtureObjects[f['id']]:ob.hide_render=True
capture('all12-closed-loops-top.png',(10,7,30),(10,7,0),26,2400,1800)
capture('all12-closed-loops-oblique.png',(25,-24,33),(10,7,1),31,2400,1800)
for f in plan['fixtures'][:12]:
 for ob in roofObjects[f['id']]:ob.hide_render=False
capture('all12-native-roof-contact.png',(25,-24,33),(10,7,1),31,2400,1800)
for ob in labels:ob.hide_render=True
for fixture in plan['fixtures']:
 for other in plan['fixtures']:
  for ob in fixtureObjects[other['id']]:ob.hide_render=other!=fixture or ob in roofObjects[other['id']]
 pts=fixture['nominalPolygonUnits'];off=fixture['reviewOffsetM'];cx=off[0]+(min(p[0]for p in pts)+max(p[0]for p in pts))/64;cy=off[1]+(min(p[1]for p in pts)+max(p[1]for p in pts))/64;extent=max(max(p[0]for p in pts)-min(p[0]for p in pts),max(p[1]for p in pts)-min(p[1]for p in pts))/32;scale=max(5.3,extent*1.55+2)
 capture(fixture['id']+'.png',(cx+6,cy-9,10),(cx,cy,1.4),scale,1100,1000)
# Leave saved editable source exact; evidence visibility changes are temporary.
(OUT/'native-geometry-report.json').write_text(json.dumps(nativeReport,indent=2)+'\n');(OUT/'review-fixtures.json').write_text(json.dumps(plan['fixtures'],indent=2)+'\n');print('R004_NATIVE_FAMILY_COMPLETE',len(exported),sum(p['triangles']for p in nativeReport.values()))
