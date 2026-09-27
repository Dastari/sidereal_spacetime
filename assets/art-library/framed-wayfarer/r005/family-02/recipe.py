"""Managed immutable Blender r005 block kit authoring, export and solid checks."""
from __future__ import annotations
import hashlib,importlib.util,json,math,sys
from pathlib import Path
ROOT=next(p for p in Path(__file__).resolve().parents if (p/'dev.toml').is_file() and (p/'AGENTS.md').is_file())
FROZEN=ROOT/'assets/art-library/framed-wayfarer/r004/hull/final-03/recipe.py'
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()

def build(out,full):
 import bpy,bmesh
 from mathutils import Vector
 planner_path=Path(__file__).with_name('armor_block_kit_plan.py')
 spec=importlib.util.spec_from_file_location('r005_frozen_planner',planner_path);plan=importlib.util.module_from_spec(spec);spec.loader.exec_module(plan)
 spec=importlib.util.spec_from_file_location('frozen_r004_material_recipe',FROZEN);old=importlib.util.module_from_spec(spec);spec.loader.exec_module(old)
 old.TEXELS_PER_METRE=64
 mats=old.materials(out)
 bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
 manifest=plan.make_plan(full)
 class Module:
  def __init__(self,record):
   self.record=record;self.ident=record['modelId'];self.objects=[];self.backing=[]
   self.root=bpy.data.objects.new('ASSET-'+self.ident,None);bpy.context.collection.objects.link(self.root)
   self.root['native_part_id']=self.ident;self.root['geometry_parameters']=json.dumps(record['parameters'],sort_keys=True)
   self.root['source_revision']='r005';self.root['placement_scale']='1,1,1'
  def mesh(self,name,verts,faces,group,region='rail',bevel=0,material='enamel'):
   data=bpy.data.meshes.new('MESH-'+self.ident+'-'+name);data.from_pydata(verts,[],faces);data.update()
   bm=bmesh.new();bm.from_mesh(data);bmesh.ops.recalc_face_normals(bm,faces=bm.faces);bm.to_mesh(data);bm.free()
   obj=bpy.data.objects.new('GEO-'+self.ident+'--'+group+'--'+name,data);bpy.context.collection.objects.link(obj);obj.parent=self.root
   obj['render_group']=group;obj['native_part_id']=self.ident;obj['semantic_surface']=name
   data.materials.append(mats[material]);uv=data.uv_layers.new(name='MetricAtlas16m')
   ru,rv,rw,rh,_=old.REGIONS[region]
   origin=[min(v[i] for v in verts) for i in range(3)]
   for face in data.polygons:
    axis=max(range(3),key=lambda i:abs(face.normal[i]))
    for li in face.loop_indices:
     p=data.vertices[data.loops[li].vertex_index].co
     a,b=(p.x-origin[0],p.z) if axis==1 else (p.y-origin[1],p.z) if axis==0 else (p.x-origin[0],p.y-origin[1])
     # Physical metric projection; long surfaces repeat region at fixed scale.
     a=min(max(a,0),rw-.0001) if region in ('plain','service','identity') else a%rw
     b=min(max(b,0),rh-.0001)
     uv.data[li].uv=((ru+a)/16,(rv+b)/16)
   if bevel:
    mod=obj.modifiers.new('Authored 12mm face chamfer','BEVEL');mod.width=bevel;mod.segments=1
    mod=obj.modifiers.new('Weighted broad face normals','WEIGHTED_NORMAL')
   self.objects.append(obj);return obj
  def prism(self,name,poly,z0,z1,group='BACKING',region='rail',bevel=0):
   poly=plan.clean(poly);n=len(poly)
   if n<3 or abs(plan.area(poly))<1e-10 or z1-z0<1e-8:return None
   obj=self.mesh(name,[(x,y,z0) for x,y in poly]+[(x,y,z1) for x,y in poly], [tuple(reversed(range(n))),tuple(range(n,2*n))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)],group,region,bevel)
   if group=='BACKING':self.backing.append({'object':obj.name,'footprint':poly,'z0':z0,'z1':z1,'expectedVolumeM3':plan.area(poly)*(z1-z0)})
   return obj
  def box(self,name,x0,x1,d0,d1,z0,z1,group='FINISH',region='connector',bevel=.009,material='enamel'):
   obj=self.prism(name,[[x0,-d1],[x1,-d1],[x1,-d0],[x0,-d0]],z0,z1,group,region,bevel)
   if material!='enamel' and obj:obj.data.materials[0]=mats[material]
   return obj
  def rail(self,name,x0,x1,cross,region='rail'):
   n=len(cross);verts=[(x0,-d,z) for d,z in cross]+[(x1,-d,z) for d,z in cross]
   return self.mesh(name,verts,[tuple(range(n)),tuple(reversed(range(n,2*n)))]+[(i,i+n,(i+1)%n+n,(i+1)%n) for i in range(n)],'FINISH',region)
  def socket(self,name,pos,normal):
   o=bpy.data.objects.new('SOCKET-'+self.ident+'--'+name,None);bpy.context.collection.objects.link(o);o.parent=self.root;o.location=pos;o['normal']=normal;o['socket_name']=name
   return {'position':list(pos),'normal':list(normal)}
 modules=[]
 for record in manifest['models']:
  m=Module(record);p=record['parameters'];contacts={};depth=p['backingDepthM'];outer=depth+.25
  if p['kind']=='span':
   L,H=p['lengthM'],p['heightM'];band=.1875 if H==.75 else .3125;rib=min(.1875,L/4)
   m.box('closed-solid-body',rib,L-rib,0,depth,0,H,'BACKING','rail',0)
   m.box('closed-incoming-wrapped-body',0,rib,0,depth,0,H,'BACKING','connector',0)
   m.box('closed-outgoing-wrapped-body',L-rib,L,0,depth,0,H,'BACKING','connector',0)
   # End connectors are square on named mating planes: their two halves form one wrapped post.
   for label,x0,x1 in [('incoming',0,rib),('outgoing',L-rib,L)]:
    m.rail('pale-wrapped-connector-'+label,x0,x1,[(depth,0),(outer-.03125,0),(outer,.0625),(outer,H-.0625),(outer-.03125,H),(depth,H)],'connector')
   x0,x1=rib,L-rib
   lower=[(depth,0),(outer-.0625,0),(outer,.0625),(outer,band-.0625),(outer-.0625,band),(depth,band)]
   if L>.85 and band>.1875:
    a,b=L/2-.25,L/2+.25
    m.rail('lower-impact-rail-left',x0,a,lower)
    m.rail('lower-impact-rail-right',b,x1,lower)
    pocket=lower[:3]+[(outer,.070),(outer-.025,.070),(outer-.025,.140),(outer,.140)]+lower[3:]
    m.rail('lower-impact-rail-cut-pocket',a,b,pocket)
   else:m.rail('lower-impact-rail',x0,x1,lower)
   top=[(depth,H-band),(outer-.125,H-band),(outer,H-band+.125)]
   if band>.1875:top.append((outer,H-.0625))
   top.extend([(outer-.0625,H),(depth,H)])
   m.rail('upper-stepped-shoulder',x0,x1,top)
   panel0,panel1=x0+.035,x1-.035;z0,z1=band+.045,H-band-.045
   if panel1-panel0>.075 and z1-z0>.05:
    variant=p['finish'];region='service' if variant=='red-service' else variant if variant in ('plain','identity') else 'plain'
    m.box('recess-shadow-seat',x0,x1,depth,depth+.025,band,H-band,region='black',bevel=0)
    m.box('interchangeable-'+variant+'-face',panel0,panel1,depth+.025,depth+.085,z0,z1,region=region,bevel=.01)
    if variant=='vent':
     xa,xb=panel0+.08,panel1-.08
     m.box('vent-dark-well',xa,xb,depth+.085,depth+.1,z0+.06,z1-.06,region='black',bevel=0)
     for i in range(max(0,int((z1-z0-.2)/.23))):
      zz=z0+.1+i*.23
      m.rail('deep-vent-louver-'+str(i),xa+.025,xb-.025,[(depth+.1,zz),(outer-.025,zz+.035),(outer-.025,zz+.105),(depth+.1,zz+.145)],'metal')
    if variant=='utility' and z1-z0>.7 and panel1-panel0>.5:
     mid=(panel0+panel1)/2
     m.box('utility-removable-box',mid-.2,mid+.2,depth+.085,outer-.055,z0+.2,z1-.2,region='metal',bevel=.022)
     m.box('utility-status-lens',mid-.035,mid+.035,outer-.055,outer-.05,z0+.32,z0+.52,material='cyan',bevel=0)
    # Shared shallow emissive insert remains inside the 1m finish envelope.
    if L>.85 and band>.1875:
     mid=L/2
     m.box('cyan-flush-status-lens',mid-.23,mid+.23,outer-.009,outer-.004,.078125,.125,region='black',bevel=0,material='cyan')
   contacts={'incoming':m.socket('incoming',(0,-depth/2,H/2),(-1,0,0)), 'outgoing':m.socket('outgoing',(L,-depth/2,H/2),(1,0,0)), 'lower':m.socket('lower',(L/2,-depth/2,0),(0,0,-1)), 'upper':m.socket('upper',(L/2,-depth/2,H),(0,0,1))}
   contacts['outwardSurface']=m.socket('outwardSurface',(L/2,-outer,H/2),(0,-1,0))
   record['nominalEndpointVectorLocalM']=[[0,0],[L,0]]
  else:
   turn,cut=p['turnRadians'],p['cutbackM'];hin,hout=p['incomingHeightM'],p['outgoingHeightM'];lo,hi=min(hin,hout),max(hin,hout)
   backing=plan.corner_band(turn,cut,0,depth);finish=plan.corner_band(turn,cut,depth,outer)
   m.prism('closed-junction-wedge',backing,0,lo)
   band=.1875 if lo==.75 else .3125
   m.prism('junction-lower-navy-shoe',finish,0,band,'FINISH','rail')
   m.prism('junction-wrapped-pale-connector',finish,band,lo-band,'FINISH','connector')
   m.prism('junction-upper-navy-shoulder',finish,lo-band,lo,'FINISH','rail')
   if hi>lo:
    divider=[1+math.cos(turn),math.sin(turn)];positive=hout>hin
    m.prism('closed-height-transition-body',plan.clip(backing,divider,keep_positive=positive),lo,hi)
    m.prism('height-transition-pale-end-return',plan.clip(finish,divider,keep_positive=positive),lo,hi,'FINISH','connector')
   t=[math.cos(turn),math.sin(turn)];n=[t[1],-t[0]]
   contacts={'incoming':m.socket('incoming',(-cut,-depth/2,hin/2),(-1,0,0)), 'outgoing':m.socket('outgoing',(t[0]*cut+n[0]*depth/2,t[1]*cut+n[1]*depth/2,hout/2),(t[0],t[1],0))}
   record['contactPlaneEndpointsLocalM']={'incoming':[-cut,0],'outgoing':[cut*t[0],cut*t[1]]}
  record['contacts']=contacts;record['backingSolids']=m.backing
  for obj in m.objects:
   obj.data.calc_loop_triangles()
  modules.append(m)
  modeldir=out/'models'/m.ident;modeldir.mkdir(parents=True)
  bpy.ops.object.select_all(action='DESELECT')
  for obj in [m.root]+list(m.root.children):obj.select_set(True)
  bpy.context.view_layer.objects.active=m.root
  dest=modeldir/'model.glb'
  bpy.ops.export_scene.gltf(filepath=str(dest),export_format='GLB',use_selection=True,export_apply=True,export_yup=True,export_extras=True,export_cameras=False,export_lights=False)
  record['glb']=str(dest.relative_to(out));record['sha256']=sha(dest)
  verts=[obj.matrix_world@v.co for obj in m.objects for v in obj.data.vertices]
  record['bounds']={'min':[min(v[i] for v in verts) for i in range(3)],'max':[max(v[i] for v in verts) for i in range(3)]}
  record['meshGroups']=['BACKING','FINISH'];record['backingVolumeM3']=sum(s['expectedVolumeM3'] for s in m.backing)
 # Strict independent mesh-volume and topology checks against analytic ownership polygons.
 checked=[]
 for m in modules:
  solids=[]
  for s in m.backing:
   obj=bpy.data.objects[s['object']];bm=bmesh.new();bm.from_mesh(obj.data)
   nonmanifold=sum(not e.is_manifold for e in bm.edges);volume=bm.calc_volume(signed=True);bm.free()
   assert nonmanifold==0,(obj.name,'OPEN_BACKING',nonmanifold)
   assert abs(volume-s['expectedVolumeM3'])<1e-5,(obj.name,'BACKING_VOLUME',volume,s['expectedVolumeM3'])
   solids.append({'object':obj.name,'nonManifoldEdges':nonmanifold,'measuredVolumeM3':volume,'expectedVolumeM3':s['expectedVolumeM3']})
  zero=[]
  for obj in m.objects:
   evaluated=obj.evaluated_get(bpy.context.evaluated_depsgraph_get());mesh=evaluated.to_mesh();mesh.calc_loop_triangles()
   for tri in mesh.loop_triangles:
    if tri.area<=1e-12:zero.append([obj.name,tri.index])
   assert all(math.isfinite(c) for v in mesh.vertices for c in v.co)
   evaluated.to_mesh_clear()
  assert not zero,(m.ident,'ZERO_AREA_TRIANGLES',zero[:5])
  checked.append({'modelId':m.ident,'closedBackingSolids':solids,'zeroAreaTriangles':0,'finiteGeometry':True})
 # Save editable source, with only first module exposed in the authoring viewport.
 for i,m in enumerate(modules):
  for obj in [m.root]+list(m.root.children):obj.hide_render=i!=0;obj.hide_set(i!=0)
 scene=bpy.context.scene;scene.unit_settings.system='METRIC';scene.unit_settings.scale_length=1
 scene['contract']='1m exterior reservation: .75m actual closed backing + .25m separate finish; source Z-up; no runtime authority'
 bpy.ops.wm.save_as_mainfile(filepath=str(out/'source.blend'))
 manifest.update({'source':'source.blend','sourceSha256':sha(out/'source.blend'),'recipeSha256':sha(out/'recipe.py'),'plannerSha256':sha(out/'armor_block_kit_plan.py'),'sourceDependencies':[{'path':str(FROZEN.relative_to(ROOT)),'sha256':sha(FROZEN),'usage':'Frozen r004 atlas materials only; geometry is new r005. Atlas sampled at 64 texels/m.'}],'maps':[{'path':str(f.relative_to(out)),'sha256':sha(f)} for f in sorted((out/'textures').glob('*.png'))],'textureTexelsPerMetre':64})
 (out/'models.json').write_text(json.dumps(manifest,indent=2)+'\n')
 (out/'native-validation.json').write_text(json.dumps({'schema':'sidereal.native-block-validation.v1','status':'pass','models':checked,'modelCount':len(checked),'sourceSha256':manifest['sourceSha256'],'limits':['Native topology/volume validated here. Assembly intersections and imported GLB parity checked by companion validator.']},indent=2)+'\n')
 print(json.dumps({'output':str(out),'models':len(modules),'assemblies':list(manifest['assemblies'])}))

if __name__=='__main__':
 if '--' in sys.argv:
  args=sys.argv[sys.argv.index('--')+1:];build(Path(args[0]),'--full' in args)
 else:
  import argparse,shutil,subprocess,tomllib
  ap=argparse.ArgumentParser(description=__doc__);ap.add_argument('--out',required=True);ap.add_argument('--full',action='store_true');a=ap.parse_args();out=Path(a.out).resolve();out.mkdir(parents=True,exist_ok=False)
  shutil.copyfile(__file__,out/'recipe.py');shutil.copyfile(Path(__file__).with_name('armor_block_kit_plan.py'),out/'armor_block_kit_plan.py')
  cfg=tomllib.loads((ROOT/'dev.toml').read_text());cmd=[cfg['art']['blender'],'--background','--factory-startup','--threads','4','--python-exit-code','1','--python',str(Path(__file__).resolve()),'--',str(out)]
  if a.full:cmd.append('--full')
  with (out/'build.log').open('w') as log:r=subprocess.run(cmd,cwd=ROOT,stdout=log,stderr=subprocess.STDOUT)
  print((out/'build.log').read_text()[-5000:]);raise SystemExit(r.returncode)
