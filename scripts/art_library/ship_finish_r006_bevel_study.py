"""Isolated rounded-bevel study on native hull collections; no publication."""
from pathlib import Path
import json,hashlib,struct,sys,subprocess,tomllib
ROOT=Path(__file__).resolve().parents[2]
BASE=ROOT/'assets/art-library/shipyard-hull/material-studies/native-r006-polymer-01'
OUT=ROOT/'assets/art-library/shipyard-hull/material-studies/native-r006-polymer-03'
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
changed=[];protected=[];target=set(o for slug in slugs for o in bpy.data.collections[slug].objects)
for o in bpy.data.objects:
 if o.type!='MESH':continue
 record=(o.name,[tuple(v.co) for v in o.data.vertices],[tuple(p.vertices) for p in o.data.polygons],[tuple(r) for r in o.matrix_world])
 if o not in target:protected.append(record)
 for m in o.modifiers:
  if o in target and m.type=='BEVEL' and m.segments==1 and m.width>=.01199:
   changed.append({'mesh':o.name,'modifier':m.name,'width':m.width,'before':1,'after':3});m.segments=3
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
(OUT/'study.json').write_text(json.dumps({'status':'staged; requires actual game comparison','publication':False,'approval':None,'source':str(SOURCE.relative_to(ROOT)),'sourceSha256':sha(SOURCE),'baselineSource':base['source'],'baselineSourceSha256':base['sourceSha256'],'change':'Hull-only existing bevel widths>=12mm segment count1 to3; same widths, mesh control points, transforms, proxy and equipment data','changedModifiers':changed,'protectedMeshDigest':protected_digest,'trianglesBefore':a,'trianglesAfter':b,'exports':exports},indent=2))
print(json.dumps({'changedModifiers':len(changed),'exports':len(exports),'trianglesBefore':a,'trianglesAfter':b}))
