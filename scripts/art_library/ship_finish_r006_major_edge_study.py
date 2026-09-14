"""Isolated rounded-bevel study on native hull collections; no publication."""
from pathlib import Path
import json,hashlib,struct,sys,subprocess,tomllib
ROOT=Path(__file__).resolve().parents[2]
BASE=ROOT/'assets/art-library/shipyard-hull/material-studies/native-r006-polymer-02'
OUT=ROOT/'assets/art-library/shipyard-hull/material-studies/native-r006-polymer-04'
SOURCE=BASE/'candidate.blend'
def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()
if '--blender' not in sys.argv:
 if (OUT/'candidate.blend').exists():raise SystemExit('Preserve existing study revision')
 OUT.mkdir(parents=True,exist_ok=True)
 config=tomllib.loads((ROOT/'dev.toml').read_text());subprocess.run([config['art']['blender'],'--background','--threads','4','--python-exit-code','1','--python',__file__,'--','--blender'],check=True,cwd=ROOT)
 raise SystemExit()
import bpy
bpy.ops.wm.open_mainfile(filepath=str(SOURCE))
base=json.loads((BASE/'study.json').read_text());slugs=[e['slug'] for e in base['exports'] if not e['slug'].startswith('floor-')]
from mathutils import Vector
changed=[];protected=[];target=set()
major=('GEO-Replaceable pale armor','GEO-Pale structural rib','GEO-Low red service panel','GEO-Pale low vent surround','GEO-WAYFARER framed plate','GEO-Sloping pale shoulder cap','GEO-Flat aft cap section','GEO-Upper taper pale surround','GEO-Shoulder pale vertical rib','GEO-Shoulder taper top skin')
cores=('GEO-Forward impact structure','GEO-Exterior diagonal structural core')
for slug in slugs:
 for o in bpy.data.collections[slug].objects:
  if o.type!='MESH' or not o.name.startswith(major+cores):continue
  if any(m.type=='BEVEL' for m in o.modifiers):continue
  desired=Vector((0,0,1)) if ('cap' in o.name or 'top skin' in o.name) else Vector((1,.25,0)) if slug=='outer-shoulder-transition' else Vector((.55,.83,0)) if slug=='outer-diagonal-cheek' else Vector((0,1,0))
  normalMatrix=o.matrix_world.to_3x3().inverted().transposed()
  front=max((f for f in o.data.polygons if (normalMatrix@f.normal).normalized().dot(desired.normalized())>.25),key=lambda f:f.area)
  frontNormal=(normalMatrix@front.normal).normalized();points=[o.matrix_world@v.co for v in o.data.vertices];depth=max(v.dot(frontNormal) for v in points)-min(v.dot(frontNormal) for v in points)
  if depth<.021:raise RuntimeError(('Major plate too thin for20mm front bevel',o.name,depth))
  frontVerts=set(front.vertices);back=min(o.data.polygons,key=lambda f:(normalMatrix@f.normal).normalized().dot(frontNormal));rearPoints=[o.matrix_world@o.data.vertices[i].co for i in back.vertices]
  attr=o.data.attributes.get('bevel_weight_edge') or o.data.attributes.new('bevel_weight_edge','FLOAT','EDGE');weighted=[]
  for edge in o.data.edges:
   enabled=all(i in frontVerts for i in edge.vertices)
   if o.name.startswith(cores):
    tangent=(points[edge.vertices[1]]-points[edge.vertices[0]]).normalized();enabled=enabled and abs(tangent.z)<.15
   attr.data[edge.index].value=1.0 if enabled else 0.0
   if enabled:weighted.append(edge.index)
  if not weighted:raise RuntimeError(('No front perimeter edges',o.name))
  previous=o.evaluated_get(bpy.context.evaluated_depsgraph_get());beforeBounds=[o.matrix_world@Vector(v) for v in previous.bound_box]
  m=o.modifiers.new('Study04 manufactured front edge 20mm','BEVEL');m.limit_method='WEIGHT';m.width=.02;m.segments=3;m.profile=.5;m.use_clamp_overlap=True
  bpy.context.view_layer.update();evaluated=o.evaluated_get(bpy.context.evaluated_depsgraph_get());mesh=evaluated.to_mesh();afterPoints=[o.matrix_world@v.co for v in mesh.vertices]
  for axis in range(3):
   assert min(v[axis] for v in afterPoints)>=min(v[axis] for v in beforeBounds)-.00001,(o.name,'expanded min')
   assert max(v[axis] for v in afterPoints)<=max(v[axis] for v in beforeBounds)+.00001,(o.name,'expanded max')
  assert all(any((a-b).length<.00001 for b in afterPoints) for a in rearPoints),(o.name,'rear mating corner moved')
  evaluated.to_mesh_clear();target.add(o);changed.append({'mesh':o.name,'collection':slug,'modifier':m.name,'width':.02,'segments':3,'weightedFrontEdges':weighted,'frontFace':front.index,'thickness':depth,'rearMatingCornersUnchanged':True,'boundsContained':True})
for o in bpy.data.objects:
 if o.type=='MESH' and o not in target:protected.append((o.name,[tuple(v.co) for v in o.data.vertices],[tuple(p.vertices) for p in o.data.polygons],[tuple(r) for r in o.matrix_world]))
protected_digest=hashlib.sha256(repr(protected).encode()).hexdigest()
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'candidate.blend'))
exports=[]
for slug in slugs:
 col=bpy.data.collections[slug];bpy.ops.object.select_all(action='DESELECT')
 for o in col.objects:o.hide_set(False);o.select_set(True)
 bpy.context.view_layer.objects.active=next(iter(col.objects))
 dst=OUT/slug/'clean.glb';dst.parent.mkdir(exist_ok=True)
 bpy.ops.export_scene.gltf(filepath=str(dst),export_format='GLB',use_selection=True,export_apply=True,export_yup=True,export_materials='EXPORT',export_extras=True)
 raw=dst.read_bytes();n=struct.unpack_from('<I',raw,12)[0];doc=json.loads(raw[20:20+n]);tail=raw[20+n:]
 # Keep material records exactly equal to study01, including original packed maps.
 # Geometry export may renumber images/textures, so only restore scalar/extension values;
 # texture links remain the Blender-authored equivalents.
 for m in doc.get('materials',[]):
  if m['name'] in ('clean hull paint','clean nameplate','Graphite seals','Service red','Outer service paint / palette 15 sRGB 8e345b'):
   m.setdefault('extensions',{})['KHR_materials_ior']={'ior':1.46}
 if 'KHR_materials_ior' not in doc.setdefault('extensionsUsed',[]):doc['extensionsUsed'].append('KHR_materials_ior')
 chunk=json.dumps(doc,separators=(',',':')).encode();chunk+=b' '*((-len(chunk))%4);dst.write_bytes(struct.pack('<4sII',b'glTF',2,20+len(chunk)+len(tail))+struct.pack('<I4s',len(chunk),b'JSON')+chunk+tail)
 def count(d):return sum(d['accessors'][p['indices']]['count']//3 for m in d['meshes'] for p in m['primitives'])
 before=BASE/slug/'clean.glb';br=before.read_bytes();bn=struct.unpack_from('<I',br,12)[0];bd=json.loads(br[20:20+bn]);prior=next(e for e in base['exports'] if e['slug']==slug)
 exports.append({'slug':slug,'sourceSha256':prior['sourceSha256'],'materialStudySha256':sha(before),'candidate':str(dst.relative_to(ROOT)),'sha256':sha(dst),'trianglesBefore':count(bd),'trianglesAfter':count(doc),'primitiveCountBefore':sum(len(m['primitives']) for m in bd['meshes']),'primitiveCountAfter':sum(len(m['primitives']) for m in doc['meshes'])})
a=sum(e['trianglesBefore'] for e in exports);b=sum(e['trianglesAfter'] for e in exports)
assert b<=a*3,('Triangle budget exceeded',a,b)
(OUT/'study.json').write_text(json.dumps({'status':'staged; requires actual game comparison','publication':False,'approval':None,'source':str(SOURCE.relative_to(ROOT)),'sourceSha256':sha(SOURCE),'baselineSource':base['source'],'baselineSourceSha256':base['sourceSha256'],'change':'Add20mm3segment weighted front-perimeter bevels to previously sharp major hull armor/body faces; rear mating corners/bounds/proxies/equipment preserved','changedModifiers':changed,'protectedMeshDigest':protected_digest,'trianglesBefore':a,'trianglesAfter':b,'exports':exports},indent=2))
print(json.dumps({'changedModifiers':len(changed),'exports':len(exports),'trianglesBefore':a,'trianglesAfter':b}))
