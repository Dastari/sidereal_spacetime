"""Prepare-only by default. Execute only after root's explicit final review verdict.
Preserves late candidate history in append-only canonical family checkpoints.
"""
from pathlib import Path
import argparse,copy,hashlib,json,re,shutil,sys
ROOT=Path('/root/sidereal_spacetime');LIB=ROOT/'assets/art-library';OUT=ROOT/'output/playwright/planet-reference-20260914'
sys.path.insert(0,str(ROOT/'scripts'))
from art_catalog import locked,valid_revision_history,now
SPECS={'crystal':{'current':15,'pin':13,'min':{'1':6,'2':6}}}
def sha(path):
 h=hashlib.sha256()
 with path.open('rb') as f:
  for chunk in iter(lambda:f.read(1024*1024),b''):h.update(chunk)
 return h.hexdigest()
def discover(family,spec):
 sources=[]
 for p in sorted(OUT.iterdir()):
  m=re.fullmatch(re.escape(family)+r'-moon-([123])-r(\d{3})(.*)',p.name)
  if p.is_dir() and m and m[1] in spec['min'] and spec['min'][m[1]]<=int(m[2])<=10:
   sources.append({'source':str(p.relative_to(ROOT)),'reference_id':f'planets--{family}-moon-{m[1]}','source_revision':int(m[2]),'trial_suffix':m[3] or None,'working_gate':{6:'meaningful native failed iteration; preserve exact review',7:'meaningful native failed iteration; preserve exact review',8:'native-ready checkpoint; actual acceptance only in attached verdict',9:'root and independent morphology PASS; full visual gate OPEN for localized bright mineral edge exposure',10:'bounded working visual PASS: root plus independent Astra actual seed38 two angles and79/52px; owner, all-seed/LOD, hardware and publication gates remain open'}[int(m[2])],'files':sum(x.is_file()for x in p.rglob('*'))})
 assert sources,family
 # Associated worker/parity/ray evidence can live outside candidate directories.
 aliases=[family]
 if family=='gas-giant':aliases+=['gas-moon','gas-mineral']
 extras=[str(p.relative_to(ROOT))for p in sorted((ROOT/'scripts/art_library').glob('*crystal*'))if p.is_file() and 'moon' in p.name and any(r in p.name for r in ['r006','r007','r008','r009','r010'])]
 for p in sorted(OUT.iterdir()):
  if str(p.relative_to(ROOT)) in {s['source']for s in sources}:continue
  if any(p.name.startswith(a)for a in aliases) and ('moon' in p.name) and any(r in p.name for r in ['r006','r007','r008','r009','r010']) and (p.is_file()or any(k in p.name for k in ['audit','parity','composition'])):extras.append(str(p.relative_to(ROOT)))
 reports=[str(p.relative_to(ROOT))for p in sorted((OUT/'reviews').glob('*.md'))if 'crystal-moon' in p.name and any(r in p.name for r in ['r006','r007','r008','r009','r010'])]
 return {'family':family,'current_checkpoint':spec['current'],'next_checkpoint':spec['current']+1,'pinned_main_revision':spec['pin'],'sources':sources,'associated_evidence':extras,'review_reports':reports}
def main():
 parser=argparse.ArgumentParser();parser.add_argument('--execute',action='store_true');parser.add_argument('--verdict',help='Root review-verdict file, required for execution');args=parser.parse_args()
 proposal={'schema':'sidereal.crystal-r010-checkpoint-proposal.v1','prepared_at':now(),'status':'PREPARATION ONLY; no canonical writes until explicit root verdict','families':[discover(f,s)for f,s in SPECS.items()]}
 if not args.execute:
  (OUT/'reviews/crystal-r010-checkpoint-proposal.json').write_text(json.dumps(proposal,indent=2)+'\n');print('Prepared proposal only; no canonical files touched');return
 assert args.verdict,'Explicit root final visual-review verdict is required'
 verdict=Path(args.verdict).resolve();assert verdict.is_file()
 assert verdict.stat().st_size>0, 'Do not substitute an empty placeholder for the real root review verdict'
 with locked():
  ledgers={}
  # Fail before any mutation if any family revision has advanced unexpectedly.
  for f,s in SPECS.items():
   path=LIB/'designs'/('environment.planet.'+f)/'design.json';raw=path.read_bytes();d=json.loads(raw)
   assert d['current_revision']==s['current'],(f,d['current_revision'])
   assert not(path.parent/'revisions'/f"r{s['current']+1:03}").exists()
   ledgers[f]=(path,raw,d)
  result=[]
  for family in proposal['families']:
   f=family['family'];path,raw,d=ledgers[f];prior=copy.deepcopy(d);n=family['next_checkpoint'];pin=family['pinned_main_revision'];folder=path.parent/'revisions'/f'r{n:03}'
   folder.mkdir();(folder/'pre-checkpoint-design.json').write_bytes(raw)
   design_view=path.parent/'DESIGN.md';old_view=design_view.read_bytes();(folder/'pre-checkpoint-DESIGN.md').write_bytes(old_view)
   evidence=[];manifest={**family,'schema':'sidereal.late-moon-preservation.v1','recorded_at':now(),'scope':'Candidate/history checkpoint only; no main-world pin change, owner approval or hardware LOD acceptance. Gates are recorded in exact attached root/independent reviews.','prior_ledger_sha256':sha(folder/'pre-checkpoint-design.json'),'files':[]}
   def add(source,dest):
    assert source.is_file()and not source.is_symlink(),source
    before=sha(source);dest.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(source,dest);assert sha(dest)==before and sha(source)==before,source
    role='native-source'if source.suffix=='.blend'else'glb'if source.suffix=='.glb'else'recipe'if source.suffix in{'.py','.ts'}else'capture-record'if source.suffix=='.json'else'validation'
    entry={'role':role,'path':str(dest.relative_to(LIB)),'sha256':before,'bytes':dest.stat().st_size,'notes':'Exact preserved candidate/source/diagnostic artifact. Source filename and manifest retain failed-attempt status; see explicit attached reviews for gates.','recorded_at':now()};evidence.append(entry)
    manifest['files'].append({'original_path':str(source.relative_to(ROOT)),'path':entry['path'],'sha256':before,'bytes':entry['bytes']})
   for s in family['sources']:
    source=ROOT/s['source']
    for p in sorted(source.rglob('*')):
     if p.is_file():add(p,folder/'sources'/source.name/p.relative_to(source))
   for name in family['associated_evidence']+family['review_reports']:
    source=ROOT/name
    if source.is_dir():
     for p in sorted(source.rglob('*')):
      if p.is_file():add(p,folder/'associated-evidence'/source.name/p.relative_to(source))
    else:add(source,folder/'reviews' /source.name if source.parent.name=='reviews'else folder/'associated-evidence'/source.name)
   add(verdict,folder/'reviews'/'root-final-review-verdict.md')
   add(Path(__file__),folder/'checkpoint_late_moon_history.py')
   mp=folder/'manifest.json';mp.write_text(json.dumps(manifest,indent=2)+'\n');evidence.append({'role':'validation','path':str(mp.relative_to(LIB)),'sha256':sha(mp),'bytes':mp.stat().st_size,'notes':'Complete recursive artifact/hash manifest including meaningful failed native attempts and preserved main-world pin.','recorded_at':now()})
   refs=sorted({s['reference_id']for s in family['sources']});assert set(refs)<=set(d['reference_ids'])
   d['revisions'].append({'revision':n,'created_at':now(),'stage':'in-progress','change':f'Preserve Crystal moon native r006–r010 history and both r010 bounded visual PASS verdicts after exact material-only finish; main-world candidate remains pinned to r{pin:03}.','hypothesis':'Exact sources, PBR exports, captures and dated review verdicts preserve per-reference identity and remaining acceptance boundaries.','covered_reference_ids':refs,'evidence':evidence,'review':None})
   d['current_revision']=n;d['state']='in-progress';d['assigned_to']='root/planet-reference-20260914'
   d['feedback'].append({'revision':n,'author':'agent','text':f'Both Crystal moons r010 bounded working visual PASS (root plus independent actual two-angle and79/52px review); preservation checkpoint only. Main-world pin remains r{pin:03}; prior approvals/mappings are exact. Attached review verdict states current visual gates; no owner sign-off or hardware transition acceptance inferred.','message_reference':'output/playwright/planet-reference-20260914/reviews/crystal-r010-checkpoint-proposal.json','recorded_at':now(),'resolved_by_revision':None})
   for key,value in prior.items():
    if key=='revisions':assert d[key][:-1]==value
    elif key=='feedback':assert d[key][:-1]==value
    elif key not in {'current_revision','state','assigned_to'}:assert d[key]==value,key
   assert valid_revision_history(d)
   path.write_text(json.dumps(d,indent=2)+'\n')
   append=f'\n\n## r{n:03} — Crystal moon r006–r010 preservation checkpoint\n\nCurrent family checkpoint r{n:03}; main-world pin r{pin:03}. Prior entries above are preserved unchanged. No owner final sign-off inferred.\n\n[Complete source and review manifest](revisions/r{n:03}/manifest.json) · [Root review verdict](revisions/r{n:03}/reviews/root-final-review-verdict.md)\n'
   design_view.write_bytes(old_view+append.encode())
   result.append({'family':f,'checkpoint':n,'pinned_main_revision':pin,'files':len(evidence),'bytes':sum(e['bytes']for e in evidence)})
   print(result[-1],flush=True)
  (OUT/'reviews/crystal-r010-checkpoint-result.json').write_text(json.dumps(result,indent=2)+'\n')
if __name__=='__main__':main()
