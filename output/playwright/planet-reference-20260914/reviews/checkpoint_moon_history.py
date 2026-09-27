"""Explicit bounded parent-authorized preservation checkpoint; no global views/publication."""
from pathlib import Path
import sys,json,hashlib,shutil,re,copy
ROOT=Path('/root/sidereal_spacetime');LIB=ROOT/'assets/art-library';OUT=ROOT/'output/playwright/planet-reference-20260914';sys.path.insert(0,str(ROOT/'scripts'))
from art_catalog import locked,valid_revision_history,now
families={'rocky':10,'temperate':3,'desert':14,'ice':26,'volcanic':23,'gas-giant':5,'ocean':7,'toxic':7,'crystal':13}
passes={'rocky-moon-1':2,'rocky-moon-2':1,'temperate-moon-1':2,'temperate-moon-2':2,'desert-moon-1':1,'desert-moon-2':1,'gas-giant-moon-2':1,'ocean-moon-1':1,'ocean-moon-2':2,'toxic-moon-1':1,'toxic-moon-2':1}
reports={'rocky':['crystal-r013-rocky-moon-r002-volcanic-smoke.md','six-solid-moon-variants-r001.md'],'temperate':['toxic-r007-four-hybrid-moons.md','hybrid-moons-r002-working-passes.md'],'desert':['six-solid-moon-variants-r001.md'],'ice':['ice-volcanic-moons-r001-gas-mineral-r002.md'],'volcanic':['ice-volcanic-moons-r001-gas-mineral-r002.md','volcanic-moons-r002-ice26-shadow.md'],'gas-giant':['six-solid-moon-variants-r001.md','gas-moons-parent-light-diagnostic.md','ice-volcanic-moons-r001-gas-mineral-r002.md','exotic-moons-r001-gas-reflection.md'],'ocean':['toxic-r007-four-hybrid-moons.md','hybrid-moons-r002-working-passes.md'],'toxic':['exotic-moons-r001-gas-reflection.md'],'crystal':['exotic-moons-r001-gas-reflection.md','crystal-moons-r002.md']}
suffixes={'.blend','.glb','.json','.png','.jpg','.jpeg','.webp','.ktx2','.basis','.py','.ts','.md','.txt','.log'}
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
summary=[]
with locked():
 for family,main in families.items():
  path=LIB/'designs'/('environment.planet.'+family)/'design.json';original=path.read_bytes();d=json.loads(original);prior=copy.deepcopy(d)
  assert d['current_revision']==main and d['owner_final_signoff']is None,(family,d['current_revision'])
  refs=[x for x in d['reference_ids']if'-moon-'in x];number=main+1;folder=path.parent/'revisions'/f'r{number:03}';assert not folder.exists(),folder
  sources=[]
  for p in sorted(OUT.iterdir()):
   if not p.is_dir():continue
   match=re.fullmatch(re.escape(family)+r'-moon-([123])-r(\d{3})',p.name)
   if family=='rocky'and re.fullmatch(r'rocky-moon-r\d{3}',p.name):match=re.fullmatch(r'(rocky)-moon-r(\d{3})',p.name);moon='rocky-moon-1'
   elif match:moon=f'{family}-moon-{match[1]}'
   else:continue
   revision=int(match[2]);assert 'planets--'+moon in refs;sources.append((p,moon,revision))
  assert {'planets--'+m for p,m,r in sources}==set(refs)
  folder.mkdir(parents=True);(folder/'pre-checkpoint-design.json').write_bytes(original)
  evidence=[];manifest={'schema':'sidereal.planet-moon-preservation.v1','recorded_at':now(),'design_id':d['id'],'canonical_checkpoint_revision':number,'pinned_main_revision':main,'pre_checkpoint_ledger_sha256':sha(folder/'pre-checkpoint-design.json'),'scope':'Retrospective moon candidate preservation; no main-world replacement, owner approval, production publication or hardware/LOD acceptance. Original source-art revision numbering retained separately.','variants':[],'review_reports':[]}
  def add(source,dest,role='validation'):
   dest.parent.mkdir(parents=True,exist_ok=True);before=sha(source);shutil.copy2(source,dest);assert sha(dest)==before and sha(source)==before
   item={'role':role,'path':str(dest.relative_to(LIB)),'sha256':before,'bytes':dest.stat().st_size,'notes':'Preserved isolated candidate artifact; filenames and manifest distinguish native source, failed trial, optical diagnostic and actual browser capture. No hardware timing acceptance.','recorded_at':now()};evidence.append(item);return item
  for source,moon,revision in sources:
   files=[]
   for p in sorted(source.iterdir()):
    if not p.is_file()or p.suffix.lower()not in suffixes:continue
    role='native-source'if p.suffix=='.blend'else'glb'if p.suffix=='.glb'else'recipe'if p.suffix in{'.py','.ts'}else'capture-record'if p.suffix=='.json'else'validation'
    # Do not label every PNG runtime; all original context lives alongside it.
    item=add(p,folder/moon/f'source-r{revision:03}'/p.name,role);files.append({'filename':p.name,'sha256':item['sha256'],'bytes':item['bytes']})
   gate='bounded agent working visual pass; no owner sign-off'if passes.get(moon)==revision else'open or historical trial; use attached dated independent review, never infer acceptance from source presence'
   manifest['variants'].append({'reference_id':'planets--'+moon,'source_revision':revision,'original_output_directory':str(source.relative_to(ROOT)),'artifact_directory':str((folder/moon/f'source-r{revision:03}').relative_to(LIB)),'working_gate':gate,'source_timestamp_note':'Original files copied with metadata; capture JSON retains actual timestamps/context where present. Checkpoint time is not authoring time.','files':files})
  for name in reports[family]:
   p=OUT/'reviews'/name;assert p.is_file();e=add(p,folder/'reviews'/name);manifest['review_reports'].append({'path':e['path'],'sha256':e['sha256']})
  mp=folder/'manifest.json';mp.write_text(json.dumps(manifest,indent=2)+'\n');evidence.append({'role':'validation','path':str(mp.relative_to(LIB)),'sha256':sha(mp),'bytes':mp.stat().st_size,'notes':'Exact source revision, per-moon gate, source path, hashes and pinned main-world provenance.','recorded_at':now()})
  d['revisions'].append({'revision':number,'created_at':now(),'stage':'in-progress','change':'Preserve independently authored moon variants and failed/diagnostic history; main world remains pinned to r'+f'{main:03}.','hypothesis':'Explicit per-reference source-revision evidence preserves variant identity while remaining visual, optical and hardware/LOD gates are completed independently.','covered_reference_ids':refs,'evidence':evidence,'review':None})
  d['current_revision']=number;d['state']='in-progress';d['assigned_to']='root/planet-reference-20260914'
  d['feedback'].append({'revision':number,'author':'agent','text':f'Moon preservation checkpoint only. Main-world deliverable remains r{main:03}; prior feedback/approval state unchanged. Per-moon gates and original source revisions are in manifest.json and attached independent reviews. Remaining candidates, runtime integration and hardware Flight/Map LOD acceptance remain in progress.','message_reference':'output/playwright/planet-reference-20260914/reviews/moon-canonical-checkpoint-proposal.md','recorded_at':now(),'resolved_by_revision':None})
  assert d['revisions'][:-1]==prior['revisions'];assert d['feedback'][:-1]==prior['feedback'];assert d['approvals']==prior['approvals'];assert d['owner_final_signoff']==prior['owner_final_signoff'];assert d['reference_ids']==prior['reference_ids'];assert valid_revision_history(d)
  path.write_text(json.dumps(d,indent=2)+'\n')
  # Only scoped DESIGN view; preserve all prior revision records and links.
  lines=[f'# {d["id"]}','',f'Current family checkpoint r{number:03}; main-world candidate pinned to r{main:03}. In progress; no owner final sign-off.','','[Canonical ledger](design.json)','']
  for rev in d['revisions']:
   lines += [f'## r{rev["revision"]:03} — {rev["stage"]}','',rev['change'],'']
   for e in rev['evidence']:lines.append(f'- [{e["role"]}]({Path(e["path"]).relative_to(path.parent.relative_to(LIB))}) — {e["sha256"]}')
   lines.append('')
  (path.parent/'DESIGN.md').write_text('\n'.join(lines))
  summary.append({'family':family,'revision':number,'main_revision':main,'source_revisions':len(sources),'evidence_files':len(evidence),'bytes':sum(e['bytes']for e in evidence)})
  print(summary[-1],flush=True)
(OUT/'reviews/moon-checkpoint-result.json').write_text(json.dumps(summary,indent=2)+'\n')
