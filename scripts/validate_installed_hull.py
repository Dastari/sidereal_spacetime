"""Validate interim publication against exact reviewed evidence and retained identities."""
from pathlib import Path
import json,hashlib,zipfile
root=Path(__file__).resolve().parents[1];runtime=root/'assets/runtime/assembly';lib=root/'assets/art-library';read=lambda p:json.loads(p.read_text())
m=read(runtime/'hull-manifest.json')
if m['revision']==6:
 from validate_native_release import validate
 validate()
 raise SystemExit(0)
assert m['revision']==1
r=lib/'designs/shipyard.hull.pilot-section/revisions/r001';d=read(lib/'designs/shipyard.hull.pilot-section/design.json')
for e in d['revisions'][1]['evidence']:assert hashlib.sha256((lib/e['path']).read_bytes()).hexdigest()==e['sha256']
assert (root/'assets/source/published-hull/pilot-kit-r001.blend').read_bytes()==(r/'blender-source.blend').read_bytes()
current=read(runtime/'wayfarer.json');catalog=read(runtime/'catalog.json');volumes=read(runtime/'catalog.voxels.json')['volumes'];old=m['original_default'];retired={p['id'] for p in m['retired_placements']}
overrides={p['id']:p for p in m.get('equipment_placement_overrides',[])}
expected=[overrides.get(p['id'],p) for p in old['parts'] if p['id'] not in retired]+[p for e in m['entries'] for p in e['placements']]
assert current['parts']==expected,'Publication altered unrelated placements'
oldvol=read(root/'assets/source/archive/pre-pilot-hull-r001/catalog.voxels.json')['volumes']
assert all(volumes[k]==v for k,v in oldvol.items()),'Old immutable asset proxy changed'
with zipfile.ZipFile(r/'recipe.zip') as z:
 components=json.loads(z.read('components.json'))
 for e in m['entries']:
  a=e['asset'];slug=next(c['slug'] for c in components if c['id']==a['id']);assert a in catalog['assets'];assert volumes[a['id']]==e['volume']
  for state in ['clean','worn','damaged']:
   assert (runtime/'hull'/a['id']/(state+'.glb')).read_bytes()==z.read(slug+'/'+state+'.glb')
print(json.dumps({'status':'passed','published_revision':1,'hull_placements':sum(len(e['placements']) for e in m['entries']),'unrelated_placement_identities':'preserved','old_asset_proxies':'preserved','owner_publication_authorized':True,'final_design_approved':False}))
