"""Verify approved native art, identity/transform compatibility and retired visual layers."""
from pathlib import Path
import json,hashlib,struct,zipfile
ROOT=Path(__file__).resolve().parents[1];runtime=ROOT/'assets/runtime';lib=ROOT/'assets/art-library'
read=lambda p:json.loads(p.read_text())
manifest=read(runtime/'assembly/equipment-manifest.json');catalog=read(runtime/'assembly/catalog.json');assembly=read(runtime/'assembly/wayfarer.json');baseline=read(lib/'shipyard-equipment/inventory.json')
assert len(manifest['entries'])==10
expected={a['catalog_asset']['id'] for a in baseline['assets']};assert expected=={e['asset']['id'] for e in manifest['entries']}
hull=(runtime/'assembly/hull-manifest.json').exists()
for path in ['assets/runtime/assembly/wayfarer.json','assets/runtime/assembly/catalog.voxels.json']:
 checked=ROOT/'assets/source/archive/pre-pilot-hull-r001'/Path(path).name if hull else ROOT/path
 assert hashlib.sha256(checked.read_bytes()).hexdigest()==baseline['source_hashes'][path],path+' baseline changed'
if hull:
 old_volumes=read(ROOT/'assets/source/archive/pre-pilot-hull-r001/catalog.voxels.json')['volumes']
 current_volumes=read(runtime/'assembly/catalog.voxels.json')['volumes']
 for entry in manifest['entries']:
  key=entry['asset']['id'];assert current_volumes[key]==old_volumes[key], 'Equipment occupancy changed: '+key
rows=[]
for entry in manifest['entries']:
 a=entry['asset'];actual=next(c for c in catalog['assets'] if c['id']==a['id']);assert actual==a
 d=read(lib/'designs'/a['visual']['designId']/'design.json')
 maintenance=entry.get('maintenance_publication')
 if maintenance:
  assert maintenance['revision']==a['visual']['revision']
  assert d['owner_final_signoff']['revision']==maintenance['base_signed_revision']
  assert maintenance['owner_quote'] and maintenance['message_reference']
  assert maintenance['glb_sha256']==a['visual']['sha256']
  assert hashlib.sha256((ROOT/entry['source']).read_bytes()).hexdigest()==maintenance['source_sha256']
 else:assert d['owner_final_signoff']['revision']==a['visual']['revision']
 for e in d['revisions'][a['visual']['revision']]['evidence']:assert hashlib.sha256((lib/e['path']).read_bytes()).hexdigest()==e['sha256']
 glb=runtime/a['visual']['url'].removeprefix('/assets/');raw=glb.read_bytes();assert hashlib.sha256(raw).hexdigest()==a['visual']['sha256']
 n=struct.unpack_from('<I',raw,12)[0];gltf=json.loads(raw[20:20+n]);assert all(node in {n.get('name') for n in gltf['nodes']} for node in a['nodes'])
 approved=lib/'designs'/a['visual']['designId']/'revisions'/f"r{a['visual']['revision']:03}"
 source_bytes=(ROOT/entry['source']).read_bytes()
 if raw==(approved/'glb.glb').read_bytes():assert source_bytes==(approved/'blender-source.blend').read_bytes()
 else:
  with zipfile.ZipFile(approved/'recipe.zip') as z:
   candidates=[n for n in z.namelist() if n.startswith('variants/') and n.endswith('/glb.glb') and z.read(n)==raw]
   assert len(candidates)==1, 'GLB differs from signed evidence'
   assert z.read(candidates[0].replace('/glb.glb','/blender-source.blend'))==source_bytes
 original=next(b for b in baseline['assets'] if b['catalog_asset']['id']==a['id'])
 overrides={p['id']:p for p in read(runtime/'assembly/hull-manifest.json').get('equipment_placement_overrides',[])} if hull else {}
 expected_placements=[overrides.get(p['id'],p) for p in original['placements']]
 for p in original['placements']:
  if p['id'] in overrides:
   delta=4.25 if p['id']=='equipment-control-seat' and read(runtime/'assembly/hull-manifest.json').get('fixture_authority_migration',{}).get('pilot_layout_revision')==2 else 4
   assert overrides[p['id']]=={**p,'position':[p['position'][0],p['position'][1]+delta,p['position'][2]]}, 'Only authorized pilot layout offset allowed'
 assert entry['placements']==expected_placements;assert all(p in assembly['parts'] for p in entry['placements'])
 rows.append({'id':a['id'],'revision':a['visual']['revision'],'sha256':a['visual']['sha256'],'placements':len(entry['placements']),'triangles':sum(gltf['accessors'][p['indices']]['count']//3 for m in gltf['meshes'] for p in m['primitives'])})
raw=(runtime/'voxels/wayfarer.glb').read_bytes();n=struct.unpack_from('<I',raw,12)[0];ship=json.loads(raw[20:20+n]);retired={'GEO-'+p['id'] for e in manifest['entries'] for p in e['placements']};assert not retired&{m.get('name') for m in ship['nodes']}
report={'status':'passed','native_assets':len(rows),'placements':sum(r['placements'] for r in rows),'rows':rows,'identity_and_occupancy':'unchanged','legacy_equipment_visual_generation':'retired','approval':'Owner-signed designs or explicitly authorized scoped maintenance publications','scope':'Installed visual art; no authority/stat changes'}
(lib/'shipyard-equipment/installation-validation.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2))
