"""Blender-authored side armor. No live assets or TypeScript geometry writes."""
from pathlib import Path
import bpy,sys,json,math,numpy as np
from mathutils import Vector
R=Path(__file__).resolve().parents[2];O=Path(sys.argv[sys.argv.index('--')+1]);rev=int(O.name[1:]);O.mkdir(parents=True,exist_ok=True)
# Reuse the approved roof's shared surface-authoring helpers, not its geometry.
helper=(R/'scripts/art_library/build_roof_review.py').read_text().split('components=[];exports=[]')[0]
exec(helper)
masters.name='EDITABLE-SIDE-HULL-MASTERS'
for m in mats.values():m.name=m.name.replace('roof','side-hull')
# Single-segment bevels retain the studless edge while bounding geometry cost.
oldbox=box
def box(name,lo,hi,mat='pale',bevel=.025):
 ob=oldbox(name,lo,hi,mat,bevel)
 for mod in ob.modifiers:
  if mod.type=='BEVEL':mod.segments=1
 return ob

def face(name,points,x0,x1,mat='pale'):
 n=len(points);v=[(x,y,z)for x in [x0,x1]for y,z in points];f=[tuple(reversed(range(n))),tuple(range(n,n*2))]+[(i,(i+1)%n,(i+1)%n+n,i+n)for i in range(n)]
 me=bpy.data.meshes.new(name);me.from_pydata(v,[],f);me.update();ob=bpy.data.objects.new('GEO-'+slug+'--'+name,me);masters.objects.link(ob);ob.data.materials.append(mats[mat]);active.append(ob)
 # Outward +X face uses planar UVs for etched panel detail.
 uv=me.uv_layers.new(name='UVMap')
 for p in me.polygons:
  for li in p.loop_indices:
   co=me.vertices[me.loops[li].vertex_index].co;uv.data[li].uv=((co.y+1)/2,co.z/3)
 b=ob.modifiers.new('Edge chamfer','BEVEL');b.width=.025;b.segments=1;ob.modifiers.new('Weighted face normals','WEIGHTED_NORMAL');return ob

def plate(name,y0,y1,z0,z1,x0=.75,x1=1.04,mat='pale',cut=.12):
 return face(name,[(y0+cut,z0),(y1-cut,z0),(y1,z0+cut),(y1,z1-cut),(y1-cut,z1),(y0+cut,z1),(y0,z1-cut),(y0,z0+cut)],x0,x1,mat)
def vent(y0,y1,z0,z1):
 box('deep-vent-well',(.62,y0,z0),(.80,y1,z1),'black',.015)
 for k in range(6):
  z=z0+.08+k*(z1-z0-.16)/6;box('horizontal-louver',(.79,y0+.07,z),(.965,y1-.07,z+.045),'steel',.008)
 for yy in [y0-.07,y1]:box('vent-side-jamb',(.72,yy,z0-.035),(1.025,yy+.07,z1+.035),'pale',.015)
 for zz in [z0-.09,z1]:box('vent-header',(.72,y0-.07,zz),(1.025,y1+.07,zz+.09),'pale',.018)
def lens(y0,y1,z,color='cyan'):
 plate('light-socket',y0-.08,y1+.08,z-.07,z+.16,1.045,1.085,'black',.04)
 box('emissive-lens',(1.09,y0,z),(1.12,y1,z+.08),color,.009)

inv=json.loads((R/'.runtime/art-library/side-hull/inventory.json').read_text());components=[];exports=[];exportcol=bpy.data.collections.new('NATIVE-EXPORT-DERIVED');s.collection.children.link(exportcol)
variants={-8:'vent',-6:'red-service',-4:'twin-vent',-2:'utility',0:'identity',2:'red-service',4:'vent',6:'plain-service',8:'forward-vent'}
for placement in inv['parts']:
 px,py,pz=placement['position'];side=1 if px>0 else -1;variant=variants[int(py)];slug=placement['assetId'];active=[];lights=[]
 box('inner-armor-carrier',(.3125,-1,0),(.56,1,2.9375),'dark',0)
 box('continuous-upper-shoulder',(.3125,-1,2.42),(.89,1,2.78),'dark',.025)
 box('continuous-lower-sill',(.3125,-1,.03),(.94,1,.35),'dark',.025)
 # Broad overlapping top armor, three long plates instead of a row of little teeth.
 plate('shoulder-armor',-.99,.99,2.71,2.89,.3125,.90,'dark',.04)
 for yy in [-.93,.59] if variant in ['vent','forward-vent','utility'] else [-.34]:
  plate('shoulder-clamp',yy,yy+.30,2.60,2.93,.54,.96,'pale',.04)
 if variant not in ['identity','red-service']:
  box('top-recess',(.46,-.45,2.891),(.78,.42,2.902),'black',.003)
  for yy in [-.36,-.16,.04,.24]:box('top-grille',(.50,yy,2.904),(.74,yy+.04,2.921),'steel',.003)
 if variant in ['identity','red-service']:
  box('wrapped-top-clamp',(.34,-.34,2.895),(.91,-.04,2.933),'pale',.008)
 box('recessed-service-backplane',(.33,-.96,.35),(.70,.96,2.42),'black',.015)
 plate('lower-armor',-.93,.93,.27,.60,.64,1.00,'pale',.08)
 if variant in ['vent','twin-vent','forward-vent']:
  plate('upper-armor',-.93,.93,1.81,2.43,.66,1.05,'pale',.14)
  if variant=='twin-vent':
   vent(-.81,-.04,.75,1.68);vent(.12,.81,.75,1.68)
  else:vent(-.77,.75,.78,1.65)
  lens(-.62,.38,2.21)
  plate('flanking-left-strap',-.99,-.82,.36,2.55,.55,1.075,'dark',.045)
  plate('flanking-right-strap',.81,.97,.36,2.50,.55,1.075,'pale',.045)
 elif variant=='red-service':
  plate('service-door-collar',-.86,.87,.53,2.39,.50,.85,'dark',.17)
  plate('red-pressed-service-door',-.73,.68,.62,2.28,.73,1.075,'red',.15)
  box('door-top-shadow',(.84,-.48,2.14),(1.09,.47,2.21),'dark',.01)
  for z in [.91,1.92]:box('hinge',(.88,-.80,z),(1.12,-.58,z+.17),'steel',.018)
  box('recessed-handle', (1.074,.37,1.38),(1.091,.54,1.72),'black',.008)
  box('handle-grip',(1.088,.40,1.43),(1.12,.47,1.65),'steel',.008)
  box('warning-tab',(1.078,-.39,.85),(1.092,-.1,.92),'amber',.003)
  lens(-.68,.45,2.55)
 elif variant=='utility':
  plate('utility-housing',-.91,.84,.49,2.48,.53,.90,'dark',.16)
  for yy in [-.84,.42]:
   plate('projecting-utility-pod',yy,yy+.38,.45,1.51,.84,1.13,'pale',.08)
   box('utility-pod-dark-inset',(1.132,yy+.08,.64),(1.14,yy+.30,1.20),'black',.004)
   for zz in [.72,.84,.96,1.08]:box('utility-pod-recess-louver',(1.141,yy+.09,zz),(1.155,yy+.29,zz+.032),'steel',.002)
   box('utility-pod-amber-indicator',(1.142,yy+.16,1.24),(1.155,yy+.22,1.38),'amber',.003)
   # Sloped top shoulder in X/Z extruded across the pod width.
   verts=[(x,y,z) for y in [yy,yy+.38]for x,z in [(.82,1.40),(1.14,1.40),(1.14,1.53),(.82,1.70)]]
   me=bpy.data.meshes.new('sloped-pod');me.from_pydata(verts,[],[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)]);me.update();ob=bpy.data.objects.new('GEO-'+slug+'--sloped-pod-shoulder',me);masters.objects.link(ob);ob.data.materials.append(mats['pale']);active.append(ob)
   uv=me.uv_layers.new(name='UVMap')
   for f in me.polygons:
    for li in f.loop_indices:co=me.vertices[me.loops[li].vertex_index].co;uv.data[li].uv=(co.x,co.z)
   bevel=ob.modifiers.new('Shoulder bevel','BEVEL');bevel.width=.012;bevel.segments=1;ob.modifiers.new('Weighted normal','WEIGHTED_NORMAL')
  for zz in [1.1,1.3,1.5,1.7]:box('machinery-spacer',(.94,-.68,zz),(1.07,.67,zz+.065),'steel',.01)
  plate('dark-service-spine',-.45,.43,.40,2.48,.79,1.06,'dark',.10)
  plate('utility-port',-.30,.27,1.13,2.23,.94,1.125,'black',.07)
  box('socket-cyan-strip',(1.112,-.19,1.48),(1.127,-.10,2.06),'cyan',.008)
  for yy in [-.77,.60]:box('utility-rail',(.88,yy,.64),(1.05,yy+.12,2.18),'pale',.018)
  plate('projecting-coupler',-.31,.26,.57,1.05,.93,1.12,'steel',.10)
  box('socket-amber', (1.126,.10,1.41),(1.14,.20,1.81),'amber',.008)
 elif variant=='identity':
  plate('name-shield',-.91,.91,.42,2.53,.59,1.02,'dark',.17)
  for yy in [-.92,.81]:plate('armor-edge',yy,yy+.11,.51,2.42,.61,1.08,'pale',.03)
  box('registration-red-key', (1.022,-.60,2.23),(1.04,-.28,2.29),'red',.006)
  lens(-.62,-.17,.37,'amber')
 else:
  plate('pale-service-door',-.91,.89,.62,2.45,.60,1.02,'pale',.15)
  plate('inset-small-service-box',-.65,.16,1.08,2.16,.96,1.08,'dark',.08)
  vent(.30,.70,1.02,2.03)
  lens(-.52,-.03,1.85)
 # Discrete service detail, layered armor lips and flush attachment blocks.
 if variant in ['vent','forward-vent','twin-vent']:
  plate('stepped-left-shoulder',-.90,-.50,1.75,2.20,1.025,1.12,'pale',.07)
  box('small-service-groove',(1.055,.20,1.94),(1.07,.67,1.985),'black',.004)
  for yy in [-.64,.60]:plate('lower-skirt-corner',yy,yy+.24,.17,.62,.93,1.115,'pale',.04)
 if variant=='red-service':
  for zz in [1.08,1.86]:box('door-panel-score',(1.076,-.52,zz),(1.084,.23,zz+.018),'dark',.001)
  box('door-data-plate',(1.08,-.41,1.25),(1.093,-.12,1.38),'dark',.003)
  for yy in [-.38,-.28,-.18]:box('door-status-dot',(1.094,yy,1.29),(1.101,yy+.035,1.32),'steel',.001)
 if variant=='identity':
  for yy in [-.64,.39]:plate('identity-attachment',yy,yy+.21,.62,.86,1.024,1.1,'steel',.035)
  box('name-panel-seam',(1.022,-.60,1.05),(1.03,.61,1.067),'black',.001)
 # Restrained amber service stripe on selected joints and inset lower locks.
 if variant in ['vent','twin-vent','plain-service','forward-vent']:
  box('amber-socket',(.85,.76,.87),(1.03,.88,1.64),'dark',.012)
  box('amber-lens',(1.034,.79,.98),(1.049,.85,1.50),'amber',.006)
 for yy in [-.69,.60]:box('lower-lock',(1.001,yy,.36),(1.027,yy+.08,.48),'steel',.004)
 # Sparse fixtures: valid PartLight contract, local exterior pools only.
 if variant in ['vent','utility','forward-vent']:
  lights=[{'position':[1.13,-.1,2.12],'direction':[-.45,0,-1],'color':[.06,.7,1],'intensity':.65,'range':1.5,'angle':1.35}]
 # Fit the existing placed origin. No placement transform or identity changes.
 for ob in active:
  bpy.context.view_layer.objects.active=ob;ob.select_set(True);bpy.ops.object.transform_apply(location=True,rotation=True,scale=True);ob.select_set(False)
  for v in ob.data.vertices:v.co.x=side*(5+v.co.x)-px
  if side<0:
   import bmesh
   bm=bmesh.new();bm.from_mesh(ob.data);bmesh.ops.reverse_faces(bm,faces=list(bm.faces));bm.to_mesh(ob.data);bm.free()
 for light in lights:light['position'][0]=side*(5+light['position'][0])-px;light['direction'][0]*=side
 # True editable clearance recesses around retained independent thruster mounts.
 baseline=json.loads((R/'.runtime/art-library/side-hull/baseline/wayfarer.json').read_text());catalog={a['id']:a for a in json.loads((R/'.runtime/art-library/side-hull/baseline/catalog.json').read_text())['assets']}
 for mount in baseline['parts']:
  if not mount['id'].startswith(('drives-maneuver','drives-retro')) or mount['position'][0]*side<0 or abs(mount['position'][1]-py)>1:continue
  bounds=catalog[mount['assetId']]['bounds'];lo=[mount['position'][i]+bounds['min'][i]-placement['position'][i]-.015625 for i in range(3)];hi=[mount['position'][i]+bounds['max'][i]-placement['position'][i]+.015625 for i in range(3)]
  # Opening continues to exterior so the existing nozzle remains visible.
  if side>0:hi[0]=2.0
  else:lo[0]=-2.0
  bpy.ops.mesh.primitive_cube_add(size=1,location=[(a+b)/2 for a,b in zip(lo,hi)]);cut=bpy.context.object;cut.name='CUT-'+mount['id'];cut.dimensions=[b-a for a,b in zip(lo,hi)];bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);cut.hide_render=True;cut.hide_viewport=True
  for ob in active:
   boolean=ob.modifiers.new('Retained thruster socket '+mount['id'],'BOOLEAN');boolean.operation='DIFFERENCE';boolean.solver='EXACT';boolean.object=cut

 bpy.context.view_layer.update();verts=[ob.matrix_world@Vector(v)for ob in active for v in ob.bound_box];bounds={'min':[min(v[i]for v in verts)for i in range(3)],'max':[max(v[i]for v in verts)for i in range(3)]}
 sys.path.insert(0,str(R/'scripts'));from voxelize_blender import voxelize
 proxy_material=bpy.data.materials.get('MAT-closed-proxy') or bpy.data.materials.new('MAT-closed-proxy');proxy_material.use_nodes=True;proxies=[]
 for src in active:
  if min(src.dimensions)<.0625:continue
  evaluated=src.evaluated_get(bpy.context.evaluated_depsgraph_get());evaluated_mesh=evaluated.to_mesh();empty=len(evaluated_mesh.polygons)==0;evaluated.to_mesh_clear()
  if empty:continue
  ob=src.copy();ob.data=src.data.copy();s.collection.objects.link(ob);ob.data.materials.clear();ob.data.materials.append(proxy_material)
  for f in ob.data.polygons:f.material_index=0
  proxies.append(ob)
 sampled=voxelize(proxies,.0625)
 for ob in proxies:bpy.data.objects.remove(ob,do_unlink=True)
 d=O/slug;d.mkdir(exist_ok=True);(d/'samples.json').write_text(json.dumps(sampled));bpy.ops.object.select_all(action='DESELECT')
 for ob in active:
  copy=ob.copy();copy.data=ob.data.copy();exportcol.objects.link(copy);copy.select_set(True);bpy.context.view_layer.objects.active=copy
  for mod in list(copy.modifiers):
   if mod.type=='BEVEL' and mod.width==0:copy.modifiers.remove(mod)
   else:bpy.ops.object.modifier_apply(modifier=mod.name)
  bpy.context.view_layer.objects.active=copy
  tri=copy.modifiers.new('Explicit tangent triangulation','TRIANGULATE');bpy.ops.object.modifier_apply(modifier=tri.name)
 bpy.ops.object.join();bpy.ops.object.transform_apply(location=True,rotation=True,scale=True);merged=bpy.context.object;merged.name='GEO-'+slug+'--surface';exports.append(merged)
 bpy.ops.export_scene.gltf(filepath=str(d/'model.glb'),use_selection=True,export_format='GLB',export_apply=True,export_tangents=True)
 components.append({'slug':slug,'variant':variant,'side':side,'node_prefix':merged.name,'bounds':bounds,'lights':lights,'objects':[ob.name for ob in active]})
bpy.ops.object.select_all(action='DESELECT')
for ob in exports:ob.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(O/'kit.glb'),use_selection=True,export_format='GLB',export_apply=True,export_tangents=True)
for ob in exports:ob.hide_render=True
(O/'components.json').write_text(json.dumps(components,indent=2));bpy.ops.file.pack_all();bpy.ops.wm.save_as_mainfile(filepath=str(O/'side-hull-kit.blend'))
