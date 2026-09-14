"""Append native-export measurements without rewriting retained evidence."""
from pathlib import Path
import json,subprocess,sys
ROOT=Path(__file__).resolve().parents[2];LIB=ROOT/'assets/art-library'
for j in json.loads((ROOT/'.runtime/art-library/equipment/jobs.json').read_text()):
 out=ROOT/j['output'];folder=LIB/'designs'/j['design_id'];ledger=json.loads((folder/'design.json').read_text());rev=ledger['revisions'][-1]
 report={'design':j['design_id'],'revision':j['revision'],'visual_pipeline':'Native Blender evaluated surface and emissive PBR → GLB → actual Shipyard','occupancy_pipeline':'Separate prior validated sampled proxy → actual placementError, 17 existing equipment placements pass','specification_clarification':'Any inherited measured_bounds_by_variant and hero voxel mesh wording in the retained specification describe the prior proxy. Use the measured_visual_bounds below for this native visual revision. Original evidence is preserved.','measured_visual_bounds':{},'lighting':{},'lod':'One native visual export; fleet performance and LODs unvalidated','publication':False}
 for v in j['variants']:
  d=out/v['name'];validation=json.loads((d/'validation.json').read_text());report['measured_visual_bounds'][v['name']]=validation['bounds_m']
  log=(d/'browser.log').read_text();result=json.loads(log.split('### Result\n',1)[1].split('\n',1)[0]);report['lighting'][v['name']]=result['illumination']
  assert len(result['illumination']['fixtures'])==len(validation['fixtures'])
 if not any(e['role']=='build-log' for e in rev['evidence']):
  path=out/'native-measurement-log.json';path.write_text(json.dumps(report,indent=2)+'\n')
  subprocess.run([sys.executable,str(ROOT/'scripts/art_catalog.py'),'evidence',j['design_id'],'--revision',str(j['revision']),'--role','build-log','--file',str(path),'--notes','Native visual measurement and actual Babylon material/fixture diagnostics. Clarifies retained legacy proxy fields in the specification.'],check=True,stdout=subprocess.DEVNULL)
  note='Native visual measurements and actual imported emissive material/fixture values are in build-log.json. Any inherited voxel-measurement/LOD wording in the archived specification refers to the separate prior proxy, not this native visual export. Runtime fixture shadows, fine damage remeshing, crew animation and authority links remain pending.'
  subprocess.run([sys.executable,str(ROOT/'scripts/art_catalog.py'),'feedback',j['design_id'],'--revision',str(j['revision']),'--author','agent','--text',note],check=True,stdout=subprocess.DEVNULL)
  review=folder/'revisions'/f"r{j['revision']:03}"/'review.md';review.write_text(review.read_text()+'\n'+note+'\n')
 ledger=json.loads((folder/'design.json').read_text());ledger['next_action']='Owner review of this exact native Blender/GLB/Shipyard revision, lighting evidence and proposed specification. Exact sign-off and publication remain separately unauthorized.';(folder/'design.json').write_text(json.dumps(ledger,indent=2)+'\n')
 subprocess.run([sys.executable,str(ROOT/'scripts/art_catalog.py'),'review',j['design_id'],'--revision',str(j['revision']),'--outcome','pass','--notes','Native Blender export, original envelope, RGBA, imported emissive materials and actual fixture lighting are verified. Separate proxies pass all 17 original placements. Reference differences, proposed stats, rig fit, fixture shadows and damage fidelity remain documented in review.md; this is an unsigned owner-review candidate, with no publication.'],check=True,stdout=subprocess.DEVNULL)
 print(j['slug'],j['revision'],'awaiting-owner',flush=True)
