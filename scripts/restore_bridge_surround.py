"""Apply the owner's clarified bridge choice without touching equipment."""
from pathlib import Path
import json,copy
ROOT=Path(__file__).resolve().parents[1];r=ROOT/'assets/runtime/assembly'
read=lambda p:json.loads(p.read_text());write=lambda p,d:p.write_text(json.dumps(d,indent=2)+'\n')
h=read(r/'hull-manifest.json');draft=read(r/'wayfarer.json');old=read(ROOT/'assets/source/archive/pre-bridge-bed-fix/hull-manifest.json')
ids={'pilot-r004-rear-partition-23','pilot-r004-rear-partition-24'}
previous=copy.deepcopy(draft)
for original in old['entries']:
 placements=[p for p in original['placements'] if p['id'] in ids]
 if not placements:continue
 entry=next(e for e in h['entries'] if e['asset']['id']==original['asset']['id'])
 for p in placements:
  if not any(x['id']==p['id'] for x in entry['placements']):entry['placements'].append(p)
  if not any(x['id']==p['id'] for x in draft['parts']):draft['parts'].append(p)
if previous!=draft:h.setdefault('previous_defaults',[]).append(previous)
h['retired_placements']=[p for p in h['retired_placements'] if p['id'] not in ids]
region={'layer':'partitions','min':[-3.5,8.375,-100],'max':[3.5,9.25,100]}
if region not in h.setdefault('retired_visual_regions',[]):h['retired_visual_regions'].append(region)
h['bridge_duplicate_visual_fix']={'owner_quote':'Keep the tall doorway surround; remove the duplicate lower wall','scope':'Tall native Blender rear panels and doorway retained; duplicate lower legacy visual wall removed. Collision and all equipment unchanged.','region':region}
write(r/'hull-manifest.json',h);write(r/'wayfarer.json',draft)
release=ROOT/'docs/releases/bridge-bed-fix';receipt=read(release/'publication.json');receipt['bridge']=h['bridge_duplicate_visual_fix'];write(release/'publication.json',receipt)
print('Restored tall surround; retired duplicate lower visual wall; equipment untouched.')
