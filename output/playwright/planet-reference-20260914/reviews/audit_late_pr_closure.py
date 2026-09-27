"""Read-only source/PR comparison. Writes proposal evidence here only."""
from pathlib import Path
import json,hashlib,re,subprocess,datetime
ROOT=Path('/root/sidereal_spacetime');PR=Path('/root/sidereal-planet-reference-review');E='output/playwright/planet-reference-20260914/';OUT=ROOT/E/'reviews'
manifest_path=PR/E/'pr-preparation/final-allowlist-manifest.json';raw=manifest_path.read_bytes();manifest=json.loads(raw);known={r['path']:r for r in manifest['files']};tracked=set(subprocess.check_output(['git','-C',str(PR),'ls-tree','-r','--name-only','HEAD'],text=True).splitlines())
folders=['gas-giant-moon-1-r005','gas-giant-moon-3-r005','volcanic-moon-1-r003','volcanic-moon-2-r003','volcanic-moon-2-r004','ice-moon-2-r003','crystal-moon-1-r004','crystal-moon-2-r004','gas-giant-moon-1-r005-emission-only-diagnostic','volcanic-moon-1-r003-linear-roof-diagnostic','volcanic-moon-2-r003-linear-roof-diagnostic','gas-moons-r005-attribute-audit','volcanic-moons-r003-attribute-audit','volcanic-moon2-r004-attribute-audit']
roots=['build_gas_moon_luminous_trial_r005.py','gas_moon_luminous_trial_r005.test.ts','gas_moon_luminous_trial_r005.vitest.config.ts','gas_moon_luminous_trial_r005.tsconfig.json','build_volcanic_moon_native_variants_r003.py','volcanic_moon_reference_composition_r003.ts','volcanic_moon_reference_composition_r003.test.ts','volcanic_moon_reference_r003.vitest.config.ts','volcanic_moon_reference_r003.tsconfig.json','build_volcanic_moon2_hot_edges_r004.py','preview_volcanic_moon2_edge_r004.py','volcanic_moon_reference_composition_r004.ts','volcanic_moon_reference_composition_r004.test.ts','volcanic_moon_reference_r004.vitest.config.ts','volcanic_moon_reference_r004.tsconfig.json','ice_moon_reference_composition_r004.ts','ice_moon_blue_cut_r003.test.ts','ice_moon_blue_cut_r003.vitest.config.ts','build_crystal_moon_native_variants_r004.py','crystal_moon_reference_composition_r003.ts','crystal_moon_reference_composition_r004.test.ts','crystal_moon_reference_r004.vitest.config.ts','crystal_moon_reference_r004.tsconfig.json','planet_reference_worker.ts','planet_reference_worker_lifetime.ts','capture_planet_reference.py','preserve_native_kit_ior.py']
selected={};counts={}
for folder in folders:
 files=[p for p in (ROOT/E/folder).rglob('*')if p.is_file()];counts[folder]={'files':len(files),'omitted':sum(str(p.relative_to(ROOT))not in known for p in files)}
 for p in files:selected[str(p.relative_to(ROOT))]='exact latest candidate or preserved meaningful diagnostic'
for name in ['volcanic-moons-r003-exposed-fracture-rays.json','volcanic-moons-r004-exposed-fracture-rays.json']:
 if(ROOT/E/name).exists():selected[E+name]='final native surface exposure evidence'
for name in ['gas-moons-r005-luminous-trial.md','crystal-moons-r004-runtime.md','volcanic-moons-r003-ice-moon2-r003.md']:
 selected[E+'reviews/'+name]='independent latest review and limitations'
# Dynamic fixture/source reads are not imports: r005 builder and tests read the
# prior r004 output kit/generator/textures even though canonical copies exist.
for moon in [1,3]:
 folder=ROOT/E/f'gas-giant-moon-{moon}-r004'
 for p in [folder/'kit.json',folder/'generator.py',*sorted(folder.glob('rocky-*.png'))]:selected[str(p.relative_to(ROOT))]='exact dynamic authoring/test prerequisite; canonical history alone does not satisfy this path'
queue=['scripts/art_library/'+name for name in roots];visited=set();unresolved=[]
while queue:
 path=queue.pop()
 if path in visited:continue
 visited.add(path);p=ROOT/path
 if not p.exists():unresolved.append(path);continue
 if path not in tracked or path in known:selected[path]='authoring/test/import closure or changed shared entry'
 if p.suffix not in ['.ts','.py','.json']:continue
 text=p.read_text()
 for rel in re.findall(r"(?:from\s*|import\s*\()\s*['\"](\.[^'\"]+)['\"]",text):
  base=p.parent/rel;options=[base,Path(str(base)+'.ts'),base/'index.ts'];resolved=next((q for q in options if q.is_file()),None)
  if resolved and resolved.resolve().is_relative_to(ROOT):queue.append(str(resolved.resolve().relative_to(ROOT)))
  elif not resolved:unresolved.append(path+' -> '+rel)
records=[];unchanged=0
for path,reason in sorted(selected.items()):
 p=ROOT/path
 if not p.exists():unresolved.append(path);continue
 data=p.read_bytes();sha=hashlib.sha256(data).hexdigest();old=known.get(path)
 if old and old['sha256']==sha:unchanged+=1;continue
 pr=PR/path;records.append({'path':path,'action':'refresh-existing-manifest-record'if old else'add-explicit-record','reason':reason,'bytes':len(data),'sha256':sha,'previousManifestSHA256':old['sha256']if old else None,'prFileExists':pr.is_file(),'prBytesAlreadyMatchSource':pr.is_file()and hashlib.sha256(pr.read_bytes()).hexdigest()==sha,'lfs':p.suffix.lower()in ['.blend','.glb','.png','.jpg','.jpeg','.hdr']})
summary={'generatedAtUTC':datetime.datetime.now(datetime.timezone.utc).isoformat(),'scope':'Proposal only; no PR/canonical edits, no staging or acceptance authorization inferred','auditedManifest':str(manifest_path),'auditedManifestSHA256':hashlib.sha256(raw).hexdigest(),'folderCoverage':counts,'records':records,'counts':{'add':sum(r['action']=='add-explicit-record'for r in records),'refresh':sum(r['action']=='refresh-existing-manifest-record'for r in records),'bytes':sum(r['bytes']for r in records),'alreadyCorrect':unchanged},'unresolved':sorted(set(unresolved)),'pending':'Live captures may add evidence after this snapshot; regenerate explicit hashes before commit. Canonical checkpoints require separate authorized append operation.'}
(OUT/'late-pr-closure-additions-proposal.json').write_text(json.dumps(summary,indent=2)+'\n');print(json.dumps({'counts':summary['counts'],'unresolved':summary['unresolved'],'scriptRecords':[r['path']for r in records if r['path'].startswith('scripts/')]},indent=2))
