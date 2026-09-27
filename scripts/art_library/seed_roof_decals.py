"""Attach example ship identity to independent placements in an isolated review."""
from pathlib import Path
import json,sys,copy
p=Path(sys.argv[1]);path=p/'ship-wayfarer.json';d=json.loads(path.read_text());original=copy.deepcopy(d)
for part in d['parts']:
 if part['id']=='roof-0-0':
  part['decals']=[{'id':'frontier-emblem','kind':'frontier-planet','face':'top','position':[0,.3,.86],'size':[3,1.5],'rotation':0,'color':'#d6d9e5'},{'id':'frontier-registration','kind':'text','text':'WF-01','face':'top','position':[0,-1.35,.86],'size':[2.2,1.1],'rotation':0,'color':'#d6d9e5'}]
 if part['id']=='pilot-context-vestibule-roof-1':part['decals']=[{'id':'frontier-ship-name','kind':'text','text':'WAYFARER','face':'top','position':[1,1.5,.30],'size':[5.3,1.35],'rotation':0,'color':'#292d3b'}]
assert sum(len(p.get('decals',[])) for p in d['parts'])==3
path.write_text(json.dumps(d,indent=2)+'\n');(p/'decal-placement-review.json').write_text(json.dumps({'publication':False,'geometry_transforms_unchanged':all({k:v for k,v in a.items() if k!='decals'}=={k:v for k,v in b.items() if k!='decals'} for a,b in zip(d['parts'],original['parts'])),'placements':[p for p in d['parts'] if p.get('decals')]},indent=2)+'\n')
