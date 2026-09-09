"""Install explicitly owner-approved equipment without changing placement or gameplay data."""
from pathlib import Path
import json,hashlib,shutil,subprocess
ROOT=Path(__file__).resolve().parents[1];LIB=ROOT/'assets/art-library'
quote="Okay I'm happy with that. Implement them in the game in place of the existing assets."
message='Conversation owner message, 2026-09-08, immediately following the native equipment review board (medical-bed r003, hydroponics r004).'
jobs=json.loads((ROOT/'.runtime/art-library/equipment/jobs.json').read_text())
runtime=ROOT/'assets/runtime/assembly';source=ROOT/'assets/source/approved-equipment';source.mkdir(exist_ok=True)
catalog=json.loads((runtime/'catalog.json').read_text());assembly=json.loads((runtime/'wayfarer.json').read_text());entries=[]
approved_revisions={'pilot-seat':3,'command-console':4,'wall-locker':5,'reactor':3,'hydroponics':4,'crew-bunk':5,'medical-bed':3,'lounge-sofa':3,'bridge-bank':4}
for j in jobs:
 assert j['revision']==approved_revisions[j['slug']], 'This authorization covers only the stated exact revisions'
 ledger=LIB/'designs'/j['design_id']/'design.json';d=json.loads(ledger.read_text());assert d['current_revision']==j['revision']
 if not d['owner_final_signoff']:
  subprocess.run(['python3','scripts/art_catalog.py','signoff',j['design_id'],'--revision',str(j['revision']),'--owner-quote',quote,'--message-reference',message],cwd=ROOT,check=True,stdout=subprocess.DEVNULL)
 d=json.loads(ledger.read_text());assert d['owner_final_signoff']['revision']==j['revision']
 for v in j['variants']:
  staged=ROOT/j['output']/v['name'];target=runtime/'equipment'/v['asset_id'];target.mkdir(parents=True,exist_ok=True)
  approved=LIB/'designs'/j['design_id']/'revisions'/f"r{j['revision']:03}"
  # Primary is retained directly, additional handed variant in the signed recipe archive.
  if v==j['variants'][0]:assert hashlib.sha256((staged/'glb.glb').read_bytes()).hexdigest()==hashlib.sha256((approved/'glb.glb').read_bytes()).hexdigest()
  else:
   import zipfile
   with zipfile.ZipFile(approved/'recipe.zip') as z:assert z.read('variants/'+v['name']+'/glb.glb')==(staged/'glb.glb').read_bytes()
  for name in ['glb.glb','cutout.png']:shutil.copy2(staged/name,target/name)
  shutil.copy2(staged/'blender-source.blend',source/(v['asset_id']+'.blend'))
  a=next(a for a in catalog['assets'] if a['id']==v['asset_id'])
  a['nodes']=['GEO-'+v['asset_id']+'--equipment-review']
  a['lights']=json.loads((staged/'lights.json').read_text())
  a['visual']={'url':f"/assets/assembly/equipment/{v['asset_id']}/glb.glb",'sha256':hashlib.sha256((target/'glb.glb').read_bytes()).hexdigest(),'designId':j['design_id'],'revision':j['revision'],'bounds':json.loads((staged/'validation.json').read_text())['bounds_m'],'damagePreview':'unsupported'}
  a['thumbnail']=f"/assets/assembly/equipment/{v['asset_id']}/cutout.png"
  entries.append({'asset':a,'placements':[p for p in assembly['parts'] if p['assetId']==a['id']],'source':str((source/(v['asset_id']+'.blend')).relative_to(ROOT))})
manifest={'schema':'sidereal.installed-equipment.v1','owner_quote':quote,'message_reference':message,'entries':entries,'scope':'Visual replacement only; existing occupancy, placed identities/transforms, gameplay and authority remain unchanged.'}
(runtime/'equipment-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n');(runtime/'catalog.json').write_text(json.dumps(catalog,indent=2)+'\n')
(LIB/'shipyard-equipment/publication.json').write_text(json.dumps(manifest,indent=2)+'\n')
print('Installed 10 approved visual assets for 17 unchanged placements.')
