"""Owner-authorized hull publication; old R001 path retained for recovery."""
import sys
if '--revision' in sys.argv and sys.argv[sys.argv.index('--revision')+1]=='6':
 from install_release_candidate import install_hull
 install_hull()
 raise SystemExit(0)
from pathlib import Path
import json,zipfile,hashlib,shutil
ROOT=Path(__file__).resolve().parents[1];runtime=ROOT/'assets/runtime/assembly';review=ROOT/'assets/art-library/designs/shipyard.hull.pilot-section/revisions/r001';archive=ROOT/'assets/source/archive/pre-pilot-hull-r001';archive.mkdir(parents=True,exist_ok=True)
quote="I think thats a lot better than what we have, and you should make it live."
for name in ['catalog.json','catalog.voxels.json','wayfarer.json']:
 if not (archive/name).exists():shutil.copy2(runtime/name,archive/name)
source=ROOT/'assets/source/published-hull';source.mkdir(exist_ok=True);shutil.copy2(review/'blender-source.blend',source/'pilot-kit-r001.blend')
with zipfile.ZipFile(review/'recipe.zip') as z:
 components=json.loads(z.read('components.json'));draft=json.loads(z.read('wayfarer.json'));proxy=json.loads(z.read('catalog.voxels.json'));staged=json.loads(z.read('catalog.json'))
 entries=[]
 for c in components:
  asset=next(a for a in staged['assets'] if a['id']==c['id']);target=runtime/'hull'/asset['id'];target.mkdir(parents=True,exist_ok=True)
  for f in ['clean.glb','worn.glb','damaged.glb','cutout.png']:(target/f).write_bytes(z.read(c['slug']+'/'+f))
  asset['visual']['url']=f"/assets/assembly/hull/{asset['id']}/clean.glb";asset['thumbnail']=f"/assets/assembly/hull/{asset['id']}/cutout.png"
  (runtime/'thumbnails'/(asset['id']+'.svg')).write_text('<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect x="8" y="20" width="64" height="40" fill="#8d9ba9"/></svg>')
  placements=[{**p,'position':[p['position'][0],p['position'][1]+4,p['position'][2]]} for p in draft['parts'] if p['assetId']==asset['id'] and c['slug']!='hull-diagonal2to1']
  entries.append({'asset':asset,'placements':placements,'volume':proxy['volumes'][asset['id']]})
base=json.loads((archive/'wayfarer.json').read_text());catalog=json.loads((archive/'catalog.json').read_text());lookup={a['id']:a for a in catalog['assets']}
retired=[p for p in base['parts'] if lookup[p['assetId']]['category'] in ['floor','wall','roof','superstructure','decoration'] and p['position'][1]>=(8.75 if lookup[p['assetId']]['category']=='wall' else 9)]
manifest={'schema':'sidereal.installed-hull.v1','design_id':'shipyard.hull.pilot-section','revision':1,'original_default':base,'publication_authorization':{'quote':quote,'message_reference':'Current conversation: owner publication request with three cockpit/top-down/deck-plan attachments','scope':'Publish exact reviewed r001 as an interim improvement; explicitly not final reference-fidelity approval'},'entries':entries,'retired_placements':retired,'legacy_visual_cutoff_m':{'deck':9,'walls':9,'cutaway-port':9,'cutaway-starboard':9,'cutaway-bow':8.75,'partitions':9,'roof':9,'markings':9,'armor':9},'integration':'Corrected bridge attachment: rear Y9, nose Y13. Retain main hull and engines; relocate four pilot fixtures +4Y with matching server station upgrade. Native proxy asset volumes remain unchanged; placed transforms change explicitly.', 'integration_revision':2,'placement_offset':[0,4,0]}
pilot_ids={'equipment-control-seat','equipment-control-console','equipment-bridge-bank--1.3','equipment-bridge-bank-1.3'}
overrides=[{**p,'position':[p['position'][0],p['position'][1]+4,p['position'][2]]} for p in base['parts'] if p['id'] in pilot_ids]
assert len(overrides)==4
manifest['equipment_placement_overrides']=overrides
manifest['previous_defaults']=[base,json.loads((ROOT/'assets/source/archive/pilot-hull-r001-misplaced/wayfarer.json').read_text())]
manifest['legacy_front_opening']={'layers':['walls'],'minY':8.75,'minX':-5,'maxX':5}
manifest['placement_correction_authorization']='Owner current conversation: Also just FYI the position the frontend of the ship you made is wrong, with actual game screenshot. Correct the attachment and align stations, preserving identities.'
eq=json.loads((runtime/'equipment-manifest.json').read_text())
for e in eq['entries']:
 e['placements']=[next((o for o in overrides if o['id']==p['id']),p) for p in e['placements']]
eq['placement_correction']={'manifest':'hull-manifest.json','integration_revision':2,'scope':'Four pilot fixture transforms +4Y; exact approved GLB designs unchanged'}
(runtime/'equipment-manifest.json').write_text(json.dumps(eq,indent=2)+'\n')
(runtime/'hull-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
print('Staged published r001 assets; regeneration applies manifest to default assembly.')
