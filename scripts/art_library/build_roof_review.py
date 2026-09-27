"""Editable Blender Frontier roof kit, mapped relief and shared native GLB."""
from pathlib import Path
import bpy,sys,json,hashlib,math,numpy as np
from mathutils import Vector
R=Path(__file__).resolve().parents[2];O=Path(sys.argv[sys.argv.index('--')+1]);(O/'maps').mkdir(exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True);bpy.context.preferences.filepaths.save_version=0
s=bpy.context.scene;s.unit_settings.system='METRIC';s.render.engine='CYCLES';s.cycles.samples=24;s.cycles.use_denoising=False
s.render.image_settings.color_mode='RGBA';s.render.film_transparent=True;s.view_settings.view_transform='AgX'
s.world=bpy.data.worlds.new('Neutral review');s.world.use_nodes=True;s.world.node_tree.nodes['Background'].inputs[0].default_value=(.14,.18,.26,1);s.world.node_tree.nodes['Background'].inputs[1].default_value=.5
N=512;y,x=np.mgrid[0:N,0:N]/N
# Deterministic authored UV height field: fine recessed service borders, slots and flush screws.
h=np.zeros((N,N),np.float32);edge=(np.minimum.reduce([x,1-x,y,1-y])<.014);h[edge]=0
for xx in [.06,.94]:
 for yy in [.06,.94]:
  d=np.sqrt((x-xx)**2+(y-yy)**2);h[d<.012]=-.002;h[(abs(x-xx)<.008)&(abs(y-yy)<.0016)]=-.004
h[(abs(y-.86)<.002)&(x>.16)&(x<.41)]=-.002
h[(abs(x-.88)<.002)&(y>.62)&(y<.81)]=-.002
rng=np.random.default_rng(29);noise=rng.normal(0,.000003,(N,N));h+=noise

def png(name,arr):
 im=bpy.data.images.new(name,N,N,alpha=True);im.colorspace_settings.name='Non-Color';im.pixels.foreach_set(arr.astype(np.float32).reshape(-1));im.filepath_raw=str(O/'maps'/name);im.file_format='PNG';im.save();return im
nh=np.stack([-np.gradient(h,axis=1)*N,-np.gradient(h,axis=0)*N,np.ones_like(h)],-1);nh/=np.linalg.norm(nh,axis=-1)[...,None]
normal=png('frontier-normal.png',np.concatenate([nh*.5+.5,np.ones((N,N,1))],-1))
calm_h=noise
calm_n=np.stack([-np.gradient(calm_h,axis=1)*N,-np.gradient(calm_h,axis=0)*N,np.ones_like(calm_h)],-1);calm_n/=np.linalg.norm(calm_n,axis=-1)[...,None]
calm_normal=png('frontier-calm-normal.png',np.concatenate([calm_n*.5+.5,np.ones((N,N,1))],-1))
rough=png('frontier-roughness.png',np.stack([np.clip(.29+noise*400,.27,.33)]*3+[np.ones_like(h)],-1))
height=png('frontier-height.png',np.stack([np.clip(h*80+.5,0,1)]*3+[np.ones_like(h)],-1))
metalmap=png('frontier-metallic.png',np.stack([np.zeros_like(h)]*3+[np.ones_like(h)],-1))
mats={}
for name,c,metal in [('pale',(.55,.59,.66),0),('dark',(.060,.074,.115),0),('red',(.30,.025,.055),0),('steel',(.095,.12,.15),.78),('black',(.009,.016,.025),0),('amber',(.8,.31,.045),0),('cyan',(.015,.7,1),0)]:
 m=bpy.data.materials.new('MAT-Frontier-roof-'+name);m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*c,1);p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=.36
 if name in ['cyan','amber']:p.inputs['Emission Color'].default_value=(*c,1);p.inputs['Emission Strength'].default_value=5 if name=='cyan' else 2
 else:
  no=m.node_tree.nodes.new('ShaderNodeTexImage');no.image=calm_normal if name=='dark' else normal;nm=m.node_tree.nodes.new('ShaderNodeNormalMap');m.node_tree.links.new(no.outputs['Color'],nm.inputs['Color']);m.node_tree.links.new(nm.outputs['Normal'],p.inputs['Normal'])
  ro=m.node_tree.nodes.new('ShaderNodeTexImage');ro.image=rough;m.node_tree.links.new(ro.outputs['Color'],p.inputs['Roughness'])
 mats[name]=m
masters=bpy.data.collections.new('EDITABLE-ROOF-MASTERS');s.collection.children.link(masters);active=[]
def box(name,lo,hi,mat='pale',bevel=.025):
 bpy.ops.mesh.primitive_cube_add(size=1,location=[(a+b)/2 for a,b in zip(lo,hi)]);o=bpy.context.object;o.name='GEO-'+slug+'--'+name;o.dimensions=[b-a for a,b in zip(lo,hi)];bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
 o.data.materials.append(mats[mat]);b=o.modifiers.new('Satin edge bevel','BEVEL');b.width=min(bevel,min(o.dimensions)*.24);b.segments=2;
 if bevel>0:o.modifiers.new('Weighted face normals','WEIGHTED_NORMAL')
 for c in list(o.users_collection):c.objects.unlink(o)
 masters.objects.link(o);active.append(o);return o

def poly(name,xy,z0,z1,mat):
 n=len(xy);v=[(a,b,z) for z in [z0,z1] for a,b in xy];f=[tuple(reversed(range(n))),tuple(range(n,2*n))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
 me=bpy.data.meshes.new(name);me.from_pydata(v,[],f);me.update();o=bpy.data.objects.new('GEO-'+slug+'--'+name,me);masters.objects.link(o);o.data.materials.append(mats[mat]);active.append(o)
 uv=me.uv_layers.new(name='UVMap')
 for p in me.polygons:
  for li in p.loop_indices:co=me.vertices[me.loops[li].vertex_index].co;uv.data[li].uv=(co.x/6,co.y/3.5)
 b=o.modifiers.new('Perimeter bevel','BEVEL');b.width=.018;b.segments=2;o.modifiers.new('Weighted normals','WEIGHTED_NORMAL');o.modifiers.new('Export tangent triangles','TRIANGULATE');return o

def vent(x0,x1,y0,y1,z):
 box('radiator-recess',(x0,y0,z),(x1,y1,z+.055),'black',.01)
 for k in range(7):
  yy=y0+.10+k*(y1-y0-.2)/7;box('deep-fin-'+str(k),(x0+.07,yy,z+.025),(x1-.07,yy+.04,z+.105),'steel',.008)
 for xx in [x0-.065,x1]:box('vent-frame',(xx,y0-.04,z),(xx+.065,y1+.04,z+.15),'pale',.015)
components=[];exports=[]
exportcol=bpy.data.collections.new('NATIVE-EXPORT-DERIVED');s.collection.children.link(exportcol)
slugs=['center-quiet','center-service','center-service-aft','center-service-fore','center-crossbreak','transition-port','transition-starboard','transition-break-port','transition-break-starboard','transition-service-port','transition-service-starboard','transition-service-aft-port','transition-service-aft-starboard','transition-service-fore-port','transition-service-fore-starboard','shoulder-plain','shoulder-vent','shoulder-vent-fore-datum','shoulder-red','shoulder-lamp','edge-long','edge-short','stern-strip','vestibule-name','pilot-roof','outer-roof-collar']
for slug in slugs:
 active=[];lights=[]
 if slug=='pilot-roof':
  xy=[(.625,0),(5.375,0),(5.375,1.625),(3.625,3.375),(2.375,3.375),(.625,1.625)]
  poly('sealed-structural-tray',xy,0,.13,'dark');inner=[(.86,.17),(5.14,.17),(5.14,1.52),(3.53,3.16),(2.47,3.16),(.86,1.52)]
  for i in range(6):j=(i+1)%6;poly('armor-course-'+str(i),[xy[i],xy[j],inner[j],inner[i]],.1,.29,'pale')
  box('bridge-service-panel',(1.65,.32,.13),(4.35,1.6,.23),'dark',.035)
  vent(1.00,1.52,.4,1.35,.13);vent(4.48,5,.4,1.35,.13)
  for xx in [1.25,4.25]:box('bow-emitter',(xx,1.6,.18),(xx+.5,1.68,.27),'cyan',.008)
 elif slug=='outer-roof-collar':
  xy=[(0,0),(.375,0),(0,.5)];o=poly('collar',xy,0,1,'pale')
  for v in o.data.vertices:
   yy=v.co.y;v.co.z=2.9375-1.375*yy/2+(.375*(1-yy/.5) if v.co.z>.5 else 0)
 elif slug=='vestibule-name':
  box('sealed-backing',(0,0,0),(2,2,.14),'dark');box('name-armor',(0.004,.004,.13),(1.996,1.996,.30),'pale',.045)
 elif slug.startswith('edge') or slug=='stern-strip':
  w,d=(.25,2) if slug=='edge-long' else (.25,.5) if slug=='edge-short' else (2,.5)
  box('edge-armor',(-w/2,-d/2,0),(w/2,d/2,.22),'pale',.025)
 elif slug.startswith('center') or slug.startswith('transition'):
  box('sealed-backing',(-1,-1,0),(1,1,.16),'dark',.008);box('quiet-plate',(-1,-1,.77),(1,1,.86),'dark',0)
  if slug.startswith('transition'):
   side=-1 if slug.endswith('port') else 1;lo,hi=(-1,-.5) if side==-1 else (.5,1)
   box('pale-longitudinal-armor',(lo,-.88 if ('service' in slug or 'break' in slug) else -.999,.14),(hi,.88 if ('service' in slug or 'break' in slug) else .999,.72),'dark' if 'break' in slug else 'pale',.04)
  if 'service' in slug:
   lo,hi=(-1,1) if slug.startswith('center') else ((-.48,1) if slug.endswith('port') else (-1,.48))
   box('raised-machinery-cowl',(lo,-1,.89),(hi,1,1.12),'dark',0)
   if slug.startswith('center'):
    vent(-.68,.68,-.985,.985,1.125)
   else:
    box('service-secondary-cover',(lo+.08,-1,1.12),(hi-.08,1,1.21),'dark',0)
    for yy in [.55] if 'fore' in slug else [-.57] if 'aft' in slug else [-.57,.55]:box('utility-witness',(lo+.15,yy,1.21),(lo+.33,yy+.025,1.235),'amber',.004)
  if 'break' in slug:
   box('transverse-channel',(-.99,-.30,.86),(.99,.0,.885),'black',.008)
   box('raised-cross-rib',(-.99,-.21,.885),(.99,-.07,1.01),'steel',.022)
   if slug.startswith('transition'):
    xx=-.45 if slug.endswith('port') else .1;box('crossbreak-light',(xx,-.26,.94),(xx+.35,-.03,1.07),'cyan',.018);lights=[{'position':[xx+.175,-.145,1.11],'direction':[.25 if slug.endswith('port') else -.25,.4,-.3],'color':[.05,.72,1.0],'intensity':.85,'range':1.8,'angle':1.5}]
 else:
  box('sealed-backing',(-1,-1,0),(1,1,.16),'dark',.012)
  if slug.startswith('shoulder-vent'):
   box('forward-armor',(-.98,.48,.12),(.98,.98,.48),'pale',.04);box('aft-armor',(-.98,-.98,.12),(.98,-.55,.48),'pale',.04);vent(-.76,.76,-.47,.39,.18)
  elif slug=='shoulder-red':
   box('hatch-surround',(-.98,-.98,.13),(.98,.98,.33),'pale',.035);box('hatch-gasket',(-.80,-.84,.3),(.80,.84,.41),'black');box('wine-service-lid',(-.73,-.77,.36),(.73,.77,.63),'red',.055)
   for yy in [-.57,.50]:box('latch',(-.69,yy,.63),(-.41,yy+.065,.675),'steel',.009)
  else:box('broad-shoulder',(-.98,-.994,.12),(.98,.994,.49),'pale',.045)
  if slug=='shoulder-lamp':
   box('fixture-plinth',(-.76,-.42,.49),(.76,.36,.70),'dark',.04)
   box('fixture-recess',(-.65,-.32,.68),(.65,.23,.79),'black');lens=box('light-lens',(-.53,-.24,.72),(.53,.04,.83),'cyan',.025);lens.rotation_euler.x=.65;lights=[{'position':[0,-.24,.93],'direction':[0,-.65,-.41],'color':[.05,.72,1.0],'intensity':1.0,'range':1.8,'angle':1.5}]
  if slug=='shoulder-plain':box('utility-amber',(.63,.70,.49),(.81,.77,.52),'amber',.004)
 if slug.startswith('shoulder-vent') or slug=='shoulder-red':
  for o in active:
   if not o.name.endswith('sealed-backing'):o.location.z+=.20
  box('grouped-appliance-plinth',(-.998,-1,.13),(.998,1,.36),'dark',0)
 if slug=='shoulder-vent-fore-datum':
  for o in active:o.location.z+=.125
 bpy.context.view_layer.update();verts=[o.matrix_world@Vector(v) for o in active for v in o.bound_box];bounds={'min':[min(v[i] for v in verts) for i in range(3)],'max':[max(v[i] for v in verts) for i in range(3)]}
 for o in active:o['roof_component']=slug
 sys.path.insert(0,str(R/'scripts'));from voxelize_blender import voxelize
 proxy_material=bpy.data.materials.get('MAT-closed-proxy') or bpy.data.materials.new('MAT-closed-proxy');proxy_material.use_nodes=True
 proxy_objects=[];omitted=[]
 for src in active:
  if min(src.dimensions)<.0625:omitted.append(src.name);continue
  po=src.copy();po.data=src.data.copy();s.collection.objects.link(po);po.data.materials.clear();po.data.materials.append(proxy_material)
  for face in po.data.polygons:face.material_index=0
  po.hide_render=False;proxy_objects.append(po)
 sampled=voxelize(proxy_objects,.0625);sampled['omitted_subcell_details']=omitted
 for po in proxy_objects:bpy.data.objects.remove(po,do_unlink=True)
 d=O/slug;d.mkdir(exist_ok=True);(d/'samples.json').write_text(json.dumps(sampled))
 bpy.ops.object.select_all(action='DESELECT')
 for o in active:
  ob=o.copy();ob.data=o.data.copy();exportcol.objects.link(ob);ob.select_set(True);bpy.context.view_layer.objects.active=ob
  for mod in list(ob.modifiers):
   if mod.type=='BEVEL' and mod.width==0:ob.modifiers.remove(mod)
   else:bpy.ops.object.modifier_apply(modifier=mod.name)
 bpy.ops.object.join();bpy.ops.object.transform_apply(location=True,rotation=True,scale=True);merged=bpy.context.object;merged.name='GEO-'+slug+'--surface';exports.append(merged)
 d=O/slug;d.mkdir(exist_ok=True);bpy.ops.export_scene.gltf(filepath=str(d/'model.glb'),use_selection=True,export_format='GLB',export_apply=True,export_tangents=True)
 components.append({'slug':slug,'node_prefix':'GEO-'+slug+'--surface','bounds':bounds,'lights':lights,'objects':[o.name for o in active]})
bpy.ops.object.select_all(action='DESELECT')
for o in exports:o.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(O/'kit.glb'),use_selection=True,export_format='GLB',export_apply=True,export_tangents=True)
for o in exports:o.hide_render=True
(O/'components.json').write_text(json.dumps(components,indent=2));bpy.ops.file.pack_all();bpy.ops.wm.save_as_mainfile(filepath=str(O/'roof-kit.blend'))
