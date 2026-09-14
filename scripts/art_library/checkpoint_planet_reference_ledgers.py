"""Checkpoint preserved 2026-09-14 candidates; never approve or publish art.
Only the explicit six planet ledgers are touched; unrelated library views are not regenerated.
"""
import argparse,hashlib,json,shutil,sys
from pathlib import Path
from datetime import datetime,timezone
ROOT=Path(__file__).resolve().parents[2];LIB=ROOT/'assets/art-library';EVIDENCE=ROOT/'output/playwright/planet-reference-20260914'
sys.path.insert(0,str(ROOT/'scripts'))
from art_catalog import locked,valid_revision_history
from art_library.gallery import render_design_pages
families={'ocean':('ocean',7),'gas-giant':('gas',5),'volcanic':('volcanic',23),'crystal':('crystal',13),'toxic':('toxic',7),'ice':('ice',26)}
notes={
'ocean':{4:'Preserve water and native island foundation while separating regional shore/grove scale.',5:'Broaden asymmetric native shores and native groves; preserve radial relief.',6:'Water, reef and grove appearance working subgates; island finish remains open.',7:'Island-only finish over the preserved water/reef/grove source.'},
'gas':{1:'Native banded body, rings and debris first composition.',2:'Reference-led generated body albedo; body working subgate.',3:'Correct glTF double-sided lighting and granular ring material.',4:'Native dust alpha from generated density input; preserve RGB provenance.',5:'Broaden ring radial UV support while preserving native geometry and PBR texture bytes.'},
'volcanic':{19:'Native connected volcanic regional geology.',20:'Whole-body finish trial; smooth banks remain too dominant.',21:'Correct linear-to-sRGB export and native flake detail.',22:'Integrated native flow materials; replace detached cream bars.',23:'Native branching tributaries divide banks; existing intended smoke restored in isolated renderer.'},
'crystal':{2:'Native crystal source and complete material-channel review.',3:'Preserve GLB binary geometry while adding missing authored IOR metadata.',4:'Bounded local illumination and distribution trial.',5:'Hero crystal/crust refinement; source color encoding needs correction.',6:'Correct source color encoding; intermediate geology remains open.',7:'Rejected corner-expanded JSON topology as native source; preserve failed attempt.',8:'Rejected GLB optical seams as closed native authoring topology.',9:'Append original editable Blender geology; preserve closed native surfaces.',10:'Intermediate bridge distribution; interrupted capture excluded and retry retained.',11:'Farthest-point bridge placement; central angular coverage gap remains.',12:'Resolve crystal feet against final overlapping terrain.',13:'Twenty-four intermediate clusters close global angular gaps; tip visibility verified across seeds.'},
'ice':{16:'Preserve deep shaft native diagnostic before global composition.',17:'Connected glacial cut, shaft and grouped columns.',18:'Local morphology working pass; whole-body coverage remains open.',19:'Whole-planet native snow/ice composition trial.',20:'Source color encoding and broad blank ground remain open.',21:'Correct source linear-to-sRGB texture encoding.',22:'Cluster native ice cliffs between stepped banks.',23:'Regional relief trial; picking identifies blank ground placement.',24:'Add native ground relief with preserved radial envelope.',25:'Lower blue base with unequal thick snow districts; morphology working pass, shadow hatching open.',26:'Owner-requested selected tall-shard PBR transmission; preserve Ice25 geometry, opaque snow caps and original maps. Runtime and native optical captures retained; hardware transition gate remains open.'},
'toxic':{3:'Correct exposed recessed floors and optical source parity.',4:'Irregular chemical basin edges and first native fog comparison.',5:'Broader connected chemical terrain and final-terrain fog clearance.',6:'Interrupted drainage rims; broad dark ground still needs medium fractured relief.',7:'Native medium cracked terrain reaches picked blank ground while preserving basins, chimneys and existing fog.'}}
parser=argparse.ArgumentParser();parser.add_argument('--family',action='append',choices=tuple(families));args=parser.parse_args()
if args.family:families={name:families[name] for name in args.family}
now=datetime.now(timezone.utc).isoformat();selected=[]
with locked():
 for family,(prefix,last)in families.items():
  path=LIB/'designs'/f'environment.planet.{family}'/'design.json';d=json.loads(path.read_text())
  assert d['owner_final_signoff'] is None,'Never rewrite signed work'
  if d['current_revision']>=last:continue
  for number in range(d['current_revision']+1,last+1):
   source=EVIDENCE/f'{prefix}-r{number:03}';assert source.is_dir(),source
   folder=path.parent/'revisions'/f'r{number:03}';folder.mkdir(parents=True,exist_ok=False)
   artifacts=folder/'artifacts';artifacts.mkdir()
   evidence=[]
   # Preserve native source, maps, exports, composition, actual captures and notes.
   for original in sorted(source.iterdir()):
    if not original.is_file() or original.suffix.lower() not in {'.blend','.glb','.png','.json','.md','.py','.ts','.log'}:continue
    dest=artifacts/original.name;shutil.copy2(original,dest)
    role='native-source'if original.suffix=='.blend'else'glb'if original.suffix=='.glb'else'recipe'if original.suffix in {'.py','.ts'}else'capture-record'if original.suffix=='.json'else'validation'
    if original.suffix=='.png'and any(x in original.name for x in ['seed38','planet-seed','single-region']):role='runtime-top'if 'angle2'in original.name else'runtime-close'
    evidence.append(dict(role=role,path=str(dest.relative_to(LIB)),sha256=hashlib.sha256(dest.read_bytes()).hexdigest(),bytes=dest.stat().st_size,notes='Preserved isolated revision artifact; filename distinguishes diagnostic from complete body.',capture_context='Isolated Babylon/SwiftShader appearance only for runtime captures; no Flight/Map or hardware timing acceptance.'if role.startswith('runtime')else None,recorded_at=now))
   if d['revisions'][-1]['stage']=='in-progress':d['revisions'][-1]['stage']='changes-requested'
   d['revisions'].append(dict(revision=number,created_at=now,stage='in-progress'if number==last else'changes-requested',change=notes[prefix][number],hypothesis='Close the exact main-world reference gap while preserving native surfaces, identity and retained LOD behavior; see immutable revision notes and dated independent reviews.',covered_reference_ids=['planets--ringed-gas-giant'if family=='gas-giant'else f'planets--{family}-world'],evidence=evidence,review=None))
   d['current_revision']=number
  d['state']='in-progress';d['assigned_to']='root/planet-reference-20260914'
  text='Current isolated candidate checkpoint. Working visual passes are scoped in docs/planet_reference_iteration_20260914.md and independent review reports; this is not full readiness, owner sign-off or publication. Moon variants, full runtime integration, hardware Flight/Map transitions and any listed optical gaps remain separate.'
  if not any(f.get('text')==text and f.get('revision')==last for f in d['feedback']):d['feedback'].append(dict(revision=last,author='agent',text=text,message_reference='docs/planet_reference_iteration_20260914.md',recorded_at=now,resolved_by_revision=None))
  assert valid_revision_history(d),d['id']
  path.write_text(json.dumps(d,indent=2)+'\n');selected.append(d)
  lines=[f"# {d['id']}",'',f"Current revision r{last:03}; in progress. No owner final sign-off.",'','[Canonical ledger](design.json) · [Workflow](../../WORKFLOW.md) · [Current iteration log](../../../../docs/planet_reference_iteration_20260914.md)','']
  for revision in d['revisions']:
   lines += [f"## r{revision['revision']:03} — {revision['stage']}",'',revision['change'],'']
   for e in revision['evidence']:lines.append(f"- [{e['role']}]({Path(e['path']).relative_to(path.parent.relative_to(LIB))}) — {e['sha256']}")
   lines.append('')
  (path.parent/'DESIGN.md').write_text('\n'.join(lines))
  print(d['id'],last,flush=True)
 render_design_pages(LIB,json.loads((LIB/'catalog.json').read_text()),selected)
