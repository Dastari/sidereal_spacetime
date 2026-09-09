import bpy, math, json, os, sys
from pathlib import Path
from mathutils import Vector
OUT=Path(sys.argv[sys.argv.index('--')+1]);OUT.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
S=bpy.context.scene;S.unit_settings.system='METRIC';S.unit_settings.scale_length=1
mats={}
def mat(k,c,rough=.35,metal=0,emit=0):
 m=bpy.data.materials.new('MAT-boundary-'+k);m.use_nodes=True;n=m.node_tree.nodes.get('Principled BSDF');n.inputs['Base Color'].default_value=(*c,1);n.inputs['Roughness'].default_value=rough;n.inputs['Metallic'].default_value=metal
 if emit:n.inputs['Emission Color'].default_value=(*c,1);n.inputs['Emission Strength'].default_value=emit
 m.diffuse_color=(*c,1);mats[k]=m;return m
mat('pressure-core',(.055,.082,.112),.43,.45);mat('pale-polymer',(.48,.57,.65),.3,.025);mat('recess',(.016,.027,.045),.46);mat('wine-paint',(.18,.025,.047),.32,.08);mat('steel',(.31,.4,.47),.25,.8);mat('cyan',(.003,.68,1),.23,.05,2.8);mat('amber',(.95,.39,.045),.33,.03,1.1)
roots={};objects={};current=None
masters=bpy.data.collections.new('AUTHORING-NATIVE-BOUNDARY');S.collection.children.link(masters)
def root(slug,pivot=(0,0,0)):
 global current
 current=slug;o=bpy.data.objects.new('ROOT-'+slug,None);o.location=pivot;masters.objects.link(o);roots[slug]=o;objects[slug]=[];return o

def box(name,lo,hi,material,bevel=0):
 verts=[(x,y,z)for z in [lo[2],hi[2]]for y in [lo[1],hi[1]]for x in [lo[0],hi[0]]]
 faces=[(0,2,3,1),(4,5,7,6),(0,1,5,4),(2,6,7,3),(0,4,6,2),(1,3,7,5)]
 mesh=bpy.data.meshes.new('mesh-'+current+'-'+name);mesh.from_pydata(verts,[],faces);mesh.update();o=bpy.data.objects.new('GEO-'+current+'--'+name,mesh);masters.objects.link(o);o.parent=roots[current];mesh.materials.append(mats[material]);objects[current].append(o)
 uv=mesh.uv_layers.new(name='UVMap')
 for poly in mesh.polygons:
  axis=max(range(3),key=lambda i:abs(poly.normal[i]));dims=[i for i in range(3)if i!=axis]
  for li in poly.loop_indices:
   co=mesh.vertices[mesh.loops[li].vertex_index].co;uv.data[li].uv=(co[dims[0]],co[dims[1]])
 if bevel:
  mod=o.modifiers.new('Authored shallow edge bevel','BEVEL');mod.width=bevel;mod.segments=2;mod.affect='EDGES'
  mod=o.modifiers.new('Weighted corner normals','WEIGHTED_NORMAL');mod.keep_sharp=True
 return o

def face_plate(name,x0,x1,z0,z1,side,material='pale-polymer',deep=.008):
 y0,y1=(.046875,.046875+deep)if side==1 else(-.046875-deep,-.046875)
 return box(name,(x0,y0,z0),(x1,y1,z1),material,min(.005,deep*.35))

def wall(slug,L):
 root(slug);box('pressure-backing',(.0625,-.046875,.1875),(L-.0625,.046875,3),'pressure-core')
 for side in [-1,1]:
  for i in range(int(L)):
   x0=.092+i*(L-.184)/int(L);x1=.092+(i+1)*(L-.184)/int(L)-.014
   for j,(z0,z1)in enumerate([(.31,.91),(.94,2.18),(2.21,2.60)]):face_plate(f'panel-{side}-{i}-{j}',x0,x1,z0,z1,side,deep=.012)
   face_plate(f'upper-badge-{side}-{i}',x0+.045,min(x0+.26,x1-.025),2.64,2.73,side,'wine-paint',.011)
   for z in [.38,2.51]:face_plate(f'fastener-{side}-{i}-{z}',x1-.055,x1-.032,z,z+.025,side,'steel',.015)
  face_plate(f'skirting-{side}',.074,L-.074,.205,.282,side,'recess',.015)
  face_plate(f'top-cap-{side}',.074,L-.074,2.88,2.985,side,'recess',.015)
  face_plate(f'light-housing-{side}',.39 if L==2 else .31,L-.13,2.70,2.82,side,'recess',.013)
  face_plate(f'cyan-strip-{side}',.43 if L==2 else .34,L-.17,2.743,2.775,side,'cyan',.015)
  face_plate(f'base-trim-{side}',.12,L-.12,.293,.306,side,'steel',.012)
wall('wall-2m',2);wall('wall-1m',1)

# Junction cores consume a .125m square node zone; straight bodies stop at its faces.
for slug,ports in [('join-straight',['-x','+x']),('closure-end',['+x']),('closure-corner',['+x','+y']),('closure-t',['-x','+x','+y'])]:
 root(slug);box('node-pressure-core',(-.0625,-.0625,.1875),(.0625,.0625,3),'pressure-core')
 # Contact faces stay exact; exposed faces receive visual material segmentation within the same closed mesh.
 ob=objects[slug][0];ob.data.materials.append(mats['steel']);ob.data.materials.append(mats['pale-polymer'])
 for p in ob.data.polygons:
  n=p.normal;face=('+x'if n.x>0 else'-x')if abs(n.x)>.5 else ('+y'if n.y>0 else'-y')if abs(n.y)>.5 else 'z'
  p.material_index=0 if face in ports else 1 if face=='z'else 2

root('door-frame-2m')
box('left-pressure-jamb',(.0625,-.046875,.1875),(.375,.046875,3),'pressure-core')
box('right-pressure-jamb',(1.625,-.046875,.1875),(1.9375,.046875,3),'pressure-core')
box('pressure-header',(.375,-.046875,2.4375),(1.625,.046875,3),'pressure-core')
for side in [-1,1]:
 for x0,x1,name in [(.083,.365,'left'),(1.635,1.917,'right')]:
  if name=='left' and side==-1:
   for k,(a,b)in enumerate([(.215,.57),(.69,1.95),(2.07,2.40)]):face_plate(name+'-frame-'+str(side)+'-'+str(k),x0,x1,a,b,side,deep=.012)
  else:face_plate(name+'-frame-'+str(side),x0,x1,.215,2.40,side,deep=.012)
  face_plate(name+'-kick-'+str(side),x0+.02,x1-.02,.30,.49,side,'recess',.015)
  face_plate(name+'-status-'+str(side),x0+.043,x1-.043,1.36,1.44,side,'amber',.015)
 face_plate('lintel-'+str(side),.092,1.908,2.47,2.87,side,deep=.012)
 face_plate('header-inset-'+str(side),.47,1.53,2.55,2.78,side,'recess',.014)
 face_plate('lintel-signal-'+str(side),.65,1.35,2.67,2.697,side,'cyan',.015)
 face_plate('cap-'+str(side),.075,1.925,2.90,2.986,side,'recess',.015)

# Offset hinge lets the open leaf clear the full1.25m doorway. LocalX .0625..1.3125.
root('door-leaf',( .3125,-.0625,0))
box('solid-door-leaf',(.0625,0,.1875),(1.3125,.0625,2.4375),'pressure-core')
for side in [0,1]:
 y0,y1=(.002,.01)if side==0 else(.0525,.0605)
 # inset face panels stay within slab bounds; carve visual bays into a separate skin, no core holes.
 # Relief needs to sit outside an inset core; actual base core below is narrowed to preserve faces.
 for j,(z0,z1)in enumerate([(.26,.58),(.60,1.79),(1.82,2.36)]):
  box(f'door-panel-{side}-{j}',(.105,y0,z0),(1.27,y1,z1),'wine-paint'if j==1 else'pale-polymer',.003)
 detail0,detail1=(.0005,.0035) if side==0 else(.059,.062)
 box('door-spine-'+str(side),(.65,detail0, .29),(.72,detail1,2.30),'steel',.001)
 box('door-stripe-'+str(side),(.83,detail0,1.94),(1.15,detail1,1.969),'amber',.001)
# Recess structural leaf body between decorative surfaces; edge rails retain full depth and exact contacts.
core=objects['door-leaf'][0]
for v in core.data.vertices:v.co.y=.012 if v.co.y==0 else .05
for x0,x1 in [(.0625,.105),(1.27,1.3125)]:box('leaf-edge-'+str(x0),(x0,0,.1875),(x1,.0625,2.4375),'pressure-core')
for z0,z1 in [(.1875,.26),(2.36,2.4375)]:box('leaf-horizontal-edge-'+str(z0),(.105,0,z0),(1.27,.0625,z1),'pressure-core')
# Hinge straps attach leaf to pivot and are included in its moving node.
for z in [.58,1.96]:box('hinge-strap-'+str(z),(0,0,z),(.09,.012,z+.10),'steel',.002)

# Rigid leaf fit tolerance:2mm per aperture side; gasket behavior is unimplemented.
for ob in objects['door-leaf']:
 if 'hinge-strap' not in ob.name:
  for v in ob.data.vertices:
   v.co.x=.0645+(v.co.x-.0625)*(1.246/1.25)
   v.co.z=.1895+(v.co.z-.1875)*(2.246/2.25)

# Explicit empties are exported sockets, never used as authority automatically.
hinge=bpy.data.objects.new('SOCKET-door-hinge',None);masters.objects.link(hinge);hinge.parent=roots['door-frame-2m'];hinge.location=(.3125,-.0625,.1875)
S.render.engine='CYCLES';S.cycles.device='CPU';S.cycles.samples=128;S.cycles.use_denoising=False;S.render.threads_mode='FIXED';S.render.threads=4
S.view_settings.view_transform='AgX';S.world.color=(.08,.10,.15)
for slug, obs in objects.items():
 for ob in obs:ob.hide_set(slug!='wall-2m')
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'boundary-kit.blend'))
for obs in objects.values():
 for ob in obs:ob.hide_set(False)

# Export evaluated, merged per component. Source objects/modifiers remain intact in saved .blend.
export=bpy.data.collections.new('EXPORT-DERIVED');S.collection.children.link(export)
exported=[];stats={}
for slug,obs in objects.items():
 copies=[]
 for ob in obs:
  mesh=bpy.data.meshes.new_from_object(ob.evaluated_get(bpy.context.evaluated_depsgraph_get()));cp=bpy.data.objects.new('TEMP-'+ob.name,mesh);export.objects.link(cp);copies.append(cp)
 bpy.ops.object.select_all(action='DESELECT')
 for cp in copies:cp.select_set(True)
 bpy.context.view_layer.objects.active=copies[0];bpy.ops.object.join();o=copies[0];o.name='GEO-'+slug+'--surface';o.location=roots[slug].location
 tri=o.modifiers.new('Export explicit tangent triangles','TRIANGULATE');bpy.ops.object.modifier_apply(modifier=tri.name)
 stats[slug]={'triangles':len(o.data.polygons),'vertices':len(o.data.vertices),'materialSlots':len(o.data.materials),'localBounds':{'min':[min(v.co[i]for v in o.data.vertices)for i in range(3)],'max':[max(v.co[i]for v in o.data.vertices)for i in range(3)]},'translation':list(o.location),'nodePrefix':o.name}
 exported.append(o)
bpy.ops.object.select_all(action='DESELECT')
for ob in exported:ob.select_set(True)
hinge.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(OUT/'kit.glb'),export_format='GLB',use_selection=True,export_apply=True,export_yup=True,export_texcoords=True,export_normals=True,export_tangents=True,export_materials='EXPORT',export_extras=True)
(OUT/'geometry-report.json').write_text(json.dumps(stats,indent=2))
proxies={slug:[{'id':ob.name,'min':[min(v.co[i]for v in ob.data.vertices)for i in range(3)],'max':[max(v.co[i]for v in ob.data.vertices)for i in range(3)],'material':ob.data.materials[0].name}for ob in obs]for slug,obs in objects.items()}
(OUT/'draft-occupancy-boxes.json').write_text(json.dumps({'status':'draft visual authoring boxes; NOT approved collision, damage, pressure rating or voxel clipping','units':'Blender local metres before leaf pivot transform','parts':proxies},indent=2))
# Derived objects are no longer needed for CPU evidence; render the exact evaluated source surfaces.
for ob in exported:bpy.data.objects.remove(ob,do_unlink=True)
# Room-context arrangement: four metres wide; walls left and back, doorway at front right.
placements=[('wall-2m',(0,0,0),0),('wall-1m',(2.35,0,0),0),('door-frame-2m',(3.70,0,0),0),('door-leaf',(3.70,0,0),0),('closure-corner',(6.30,0,0),0),('closure-t',(6.75,0,0),0),('closure-end',(7.20,0,0),0),('join-straight',(7.65,0,0),0)]
for slug,p,rot in placements:
 r=roots[slug];r.location=Vector(p)+Vector((.3125,-.0625,0)if slug=='door-leaf'else(0,0,0));r.rotation_euler.z=rot
# Non-export review ground and labels.
current='review';roots[current]=bpy.data.objects.new('REVIEW',None);S.collection.objects.link(roots[current]);objects[current]=[]
box('ground',(-.4,-1,-.02),(8.2,.6,.1875),'recess',.01)
def label(text,p,size=.13):
 curve=bpy.data.curves.new('review-label','FONT');curve.body=text;curve.size=size;curve.align_x='CENTER';curve.extrude=0;o=bpy.data.objects.new('LABEL-'+text,curve);S.collection.objects.link(o);o.location=p;o.rotation_euler=(math.pi/2,0,0);curve.materials.append(mats['pale-polymer'])
for title,x in [('2m wall',1),('1m wall',2.85),('1.25m clear / hinged door',4.70),('Corner / T / End / Join',6.97)]:label(title,(x,-.12,3.25),.115)
label('NATIVE STRUCTURAL BOUNDARY KIT  /  r001 WORKING CANDIDATE',(3.85,-.12,3.60),.16)
label('Floor +0.1875m   |   Ceiling +3m   |   2.8125m standing clearance',(3.85,-.12,-.25),.13)
def light(name,loc,power,size,color):
 d=bpy.data.lights.new(name,'AREA');d.energy=power;d.shape='DISK';d.size=size;d.color=color;o=bpy.data.objects.new(name,d);S.collection.objects.link(o);o.location=loc;o.rotation_euler=(Vector((3,0,1.5))-o.location).to_track_quat('-Z','Y').to_euler()
light('KEY',(0,-5,7),1400,7,(.78,.88,1));light('FILL',(8,-3,4),800,5,(.62,.76,1));light('RIM',(4,3,6),1700,5,(.30,.63,1))
camd=bpy.data.cameras.new('review-camera');cam=bpy.data.objects.new('review-camera',camd);S.collection.objects.link(cam);S.camera=cam
cam.location=(9,-14,8);target=Vector((3.7,0,1.6));cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler();camd.type='ORTHO';camd.ortho_scale=9.3
S.render.resolution_x=1600;S.render.resolution_y=900;S.render.resolution_percentage=100;S.render.image_settings.file_format='PNG';S.render.film_transparent=False
S.render.filepath=str(OUT/'review-closed.png');bpy.ops.render.render(write_still=True)
roots['door-leaf'].rotation_euler.z=-math.pi/2
S.render.filepath=str(OUT/'review-open.png');bpy.ops.render.render(write_still=True)
# Close hero crop gives useful material/bevel assessment.
for slug in roots:
 if slug not in ['door-frame-2m','door-leaf','review']:
  for o in objects.get(slug,[]):o.hide_render=True
for o in list(S.objects):
 if o.type=='FONT':o.hide_render=True
roots['door-leaf'].rotation_euler.z=0
cam.location=(7.4,-5,3.9);cam.rotation_euler=(Vector((4.7,0,1.55))-cam.location).to_track_quat('-Z','Y').to_euler();camd.ortho_scale=3.7;S.render.resolution_x=900;S.render.resolution_y=1000;S.render.filepath=str(OUT/'door-close.png');bpy.ops.render.render(write_still=True)
# Actual source junction assembly and native floor context; rendering only.
for ob in list(S.objects):
 if ob.type in ['MESH','FONT']:ob.hide_render=True
clones=[]
def inst(slug,pos,rot=0):
 r=bpy.data.objects.new('REVIEW-INSTANCE-'+slug,None);S.collection.objects.link(r);r.location=pos;r.rotation_euler.z=rot
 for source in objects[slug]:
  ob=source.copy();ob.data=source.data;S.collection.objects.link(ob);ob.parent=r;ob.hide_render=False;clones.append(ob)
 return r
inst('door-frame-2m',(2,0,0),math.pi)
l=inst('door-leaf',(2-.3125,.0625,0),math.pi);l.rotation_euler.z=math.pi-math.pi/2
for pos,rot in [((2,0,0),0),((4,0,0),math.pi/2),((4,2,0),math.pi),((2,2,0),math.pi),((0,2,0),-math.pi/2)]:inst('wall-2m',pos,rot)
for pos,rot in [((0,0,0),0),((4,0,0),math.pi/2),((4,2,0),math.pi),((0,2,0),-math.pi/2)]:inst('closure-corner',pos,rot)
for pos in [(2,0,0),(2,2,0)]:inst('join-straight',pos,0)
floorfile=Path('assets/art-library/shipyard-floor/r002/variants/square-2m/model.glb')
before=set(S.objects);bpy.ops.import_scene.gltf(filepath=str(floorfile));floorobs=set(S.objects)-before
for ob in floorobs:
 ob.hide_render=False
for x in [2]:
 mapping={ob:ob.copy()for ob in floorobs}
 for ob,copy in mapping.items():
  S.collection.objects.link(copy);copy.parent=mapping.get(ob.parent);copy.hide_render=False
  if copy.parent is None:copy.location.x+=x
cam.location=(7,-8,8);cam.rotation_euler=(Vector((2,1,1.3))-cam.location).to_track_quat('-Z','Y').to_euler();camd.ortho_scale=6.7
S.render.resolution_x=1200;S.render.resolution_y=1000;S.render.filepath=str(OUT/'room-junctions-native-floor.png');bpy.ops.render.render(write_still=True)
# Transparent isolated wall cutout, not an artificial checkerboard.
for ob in list(S.objects):
 if ob.type in ['MESH','FONT']:ob.hide_render=True
for ob in objects['wall-2m']:ob.hide_render=False
cam.location=(3,-5,3.7);cam.rotation_euler=(Vector((1,0,1.5))-cam.location).to_track_quat('-Z','Y').to_euler();camd.ortho_scale=3.4
S.render.film_transparent=True;S.render.image_settings.color_mode='RGBA';S.render.resolution_x=800;S.render.resolution_y=1000;S.render.filepath=str(OUT/'cutout.png');bpy.ops.render.render(write_still=True)
print('BOUNDARY_KIT_DONE',json.dumps(stats))
