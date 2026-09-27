"""Register a preserved focused candidate against the affected component IDs only.
This records agent review; it cannot publish assets or approve for the owner.
"""
from pathlib import Path
import argparse,json,hashlib,datetime,subprocess
ROOT=Path(__file__).resolve().parents[2];LIB=ROOT/'assets/art-library/character-components';FAMILY=ROOT/'assets/art-library/designs/crew.base-and-outfits'
p=argparse.ArgumentParser();p.add_argument('--revision',type=int,required=True);p.add_argument('--outcome',choices=['pass','fail'],required=True);p.add_argument('--review',required=True);p.add_argument('--notes',required=True);a=p.parse_args()
folder=FAMILY/'revisions'/f'r{a.revision:03}'/'candidate';manifest=json.loads((folder/'manifest.json').read_text());ledger=json.loads((LIB/'ledger.json').read_text());now=datetime.datetime.now(datetime.timezone.utc).isoformat()
ids=['base-male','base-female','hair-swept','hair-crest','hair-ponytail']+['medic-'+s for s in ['helmet','visor','chest','shoulders','gloves','belt','legs','boots','back']]+['medic-open-comms']
byid={c['id']:c for c in ledger['components']};components={c['id']:c for c in manifest['components']}
for id in ids:
 if id not in byid:
  assert id=='medic-open-comms'
  c=components[id];entry={'id':id,'name':'Medic open comms (staged design)','slot':'helmet','collection':c['collection'],'inventoryDefinition':'none — staged design, not inventory-issued','stats':{'status':'proposal only','massKg':.25,'grid':[2,1],'boundsMeters':c['boundsMeters']},'ownerFinalSignoff':None,'revisions':[]};ledger['components'].append(entry);byid[id]=entry
for id in ids:
 entry=byid[id]
 if any(r['revision']==a.revision for r in entry['revisions']):raise SystemExit(f'Already recorded {id} r{a.revision}; never overwrite')
 evidence=[]
 def add(role,file):
  assert file.exists(),file
  evidence.append({'role':role,'path':str(file.relative_to(ROOT)),'sha256':hashlib.sha256(file.read_bytes()).hexdigest(),'bytes':file.stat().st_size})
 for role,file in [('blender-source',folder/'blender-source.blend'),('model',folder/(id+'.glb')),('image',folder/(id+'.png')),('validation',folder/'focused-validation.json'),('agent-review',ROOT/a.review)]:add(role,file)
 if (folder/'runtime-fit-validation.json').exists():add('runtime-fit-validation',folder/'runtime-fit-validation.json')
 if (folder/'runtime').exists():
  suffix=('male-base-swept.png' if id=='base-male' else 'female-base-ponytail.png' if id=='base-female' else 'female-base-'+id.removeprefix('hair-')+'.png' if id.startswith('hair-') else 'male-sealed.png' if id in ['medic-helmet','medic-visor'] else 'female-open.png')
  candidates=sorted((folder/'runtime').glob('*'+suffix))
  if not candidates and a.outcome=='fail':candidates=sorted((folder/'runtime').glob('*female-open.png'))
  if candidates:add('runtime',candidates[0])
 if a.outcome=='pass' and not {'runtime','runtime-fit-validation'}<={e['role'] for e in evidence}:raise SystemExit('Passing revision requires actual runtime image and fit audit')
 if id in components:
  entry.setdefault('stats',{})['boundsMeters']=components[id]['boundsMeters']
  if id!='medic-open-comms':entry['stats']['status']='Existing lab mass/grid unchanged; no new defense or role effects'
 entry['revisions'].append({'revision':a.revision,'state':'awaiting-owner' if a.outcome=='pass' else 'changes-requested','change':a.notes,'feedback':[{'author':'agent','review':a.outcome,'text':a.notes,'reviewDocument':a.review,'recordedAt':now}],'evidence':evidence,'geometryScope':'r003 base/hair/medic rebuild; r004 armor and hair correction; r005 onward hair surface correction, other focused shapes retained and assembly revalidated.'})
 entry['ownerFinalSignoff']=None
ledger['calibration']={'currentRevision':a.revision,'installedRevision':ledger['integrationRevision'],'scope':ids,'status':'awaiting-owner' if a.outcome=='pass' else 'changes-requested','review':a.review,'published':False,'ownerFinalSignoff':None}
ledger['updatedAt']=now;(LIB/'ledger.json').write_text(json.dumps(ledger,indent=2)+'\n')
subprocess.run(['python3','scripts/character_components/catalog.py','index'],cwd=ROOT,check=True)
print(f'Recorded focused r{a.revision:03}: 14 existing components + 1 staged design. Installed integration unchanged.')
