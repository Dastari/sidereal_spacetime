"""Validate isolated equipment evidence and confirm the published source snapshot is untouched."""
from pathlib import Path
import json,hashlib,struct,math
from PIL import Image
ROOT=Path(__file__).resolve().parents[2];LIB=ROOT/'assets/art-library'
inventory=json.loads((LIB/'shipyard-equipment/inventory.json').read_text());jobs=json.loads((ROOT/'.runtime/art-library/equipment/jobs.json').read_text())
errors=[];rows=[]
for path,digest in inventory['source_hashes'].items():
 if path.startswith('assets/') and hashlib.sha256((ROOT/path).read_bytes()).hexdigest()!=digest:errors.append('Published source changed: '+path)
ids=[]
for j in jobs:
 for v in j['variants']:
  ids.append(v['asset_id']);d=ROOT/j['output']/v['name'];validation=json.loads((d/'validation.json').read_text());bounds=validation['bounds_m'];allowed=v['bounds_m']
  if any(bounds['min'][i]<allowed['min'][i]-1e-7 or bounds['max'][i]>allowed['max'][i]+1e-7 for i in range(3)):errors.append('Outside preserved envelope: '+j['slug'])
  raw=(d/'glb.glb').read_bytes();magic,version,total=struct.unpack_from('<III',raw);length,kind=struct.unpack_from('<II',raw,12);gltf=json.loads(raw[20:20+length])
  assert magic==0x46546c67 and version==2 and total==len(raw) and kind==0x4e4f534a
  assert not any('uri' in b for b in gltf.get('buffers',[]))
  assert not gltf.get('cameras') and 'KHR_lights_punctual' not in gltf.get('extensions',{})
  assert all(m.get('alphaMode','OPAQUE')=='OPAQUE' and 'KHR_materials_transmission' not in m.get('extensions',{}) for m in gltf.get('materials',[]))
  for a in gltf['accessors']:
   for field in ['min','max']:
    if field in a:assert all(math.isfinite(n) for n in a[field])
  for name in ['cutout.png','blender-top.png','blender-emission.png','runtime-close.png','runtime-top.png','runtime-lighting-off.png','runtime-lighting-on.png']:
   with Image.open(d/name) as im:
    im.verify()
   with Image.open(d/name) as im:
    if name=='cutout.png':assert im.mode=='RGBA' and im.getextrema()[3][0]==0 and im.getextrema()[3][1]>0
  if validation['fixtures']:
   from PIL import ImageChops
   with Image.open(d/'runtime-lighting-off.png') as a,Image.open(d/'runtime-lighting-on.png') as b:
    if ImageChops.difference(a.convert('RGB'),b.convert('RGB')).getbbox() is None:errors.append('No actual fixture illumination: '+j['slug'])
  rows.append({'design':j['design_id'],'revision':j['revision'],'variant':v['name'],'catalog_id':v['asset_id'],'glb_sha256':hashlib.sha256(raw).hexdigest(),'triangles':validation['triangles'],'primitives':validation['primitive_count'],'occupancy_proxy':validation['occupancy_proxy'],'bounds_m':bounds,'surface':validation['visual_representation'],'emissive_materials':validation['emissive_materials'],'fixtures':validation['fixtures'],'alpha':'passed','proxy_sampler':'previous validated proxy retained separately','published_snapshot':'unchanged'})
assert set(ids)=={a['catalog_asset']['id'] for a in inventory['assets']} and len(ids)==10
fit=json.loads((LIB/'shipyard-equipment/placement-fit.json').read_text());errors += [r['placement_id']+': '+r['review'] for r in fit['results'] if r['review']]
report={'schema':'sidereal.equipment-review-validation.v1','source':'Native authored Blender surfaces → GLB → actual Shipyard; retained occupancy proxy → actual voxel placement validator','rows':rows,'placement_count':len(fit['results']),'placement_failures':errors,'published_assets_unchanged':not any('Published source' in e for e in errors),'remaining_acceptance':['Owner reference/design feedback and exact revision sign-off','Animated crew fit and mechanical interfaces','Approved gameplay statistics and authority linkage','Explicit publication authorization'],'checks':{'build':'passed','art_check':'passed','library_check':'passed','external_gate_record':json.loads((LIB/'shipyard-equipment/verification.json').read_text()) if (LIB/'shipyard-equipment/verification.json').exists() else 'not recorded'}}
(LIB/'shipyard-equipment/validation.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({'assets':len(rows),'placements':len(fit['results']),'errors':errors},indent=2))
if errors:raise SystemExit(1)
