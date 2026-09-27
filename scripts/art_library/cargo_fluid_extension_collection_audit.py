"""Final bounded cargo coverage/evidence audit after root completes capture registration."""
from pathlib import Path
import hashlib,json
from PIL import Image

ROOT=Path(__file__).resolve().parents[2];B=ROOT/'.runtime/art-library/cargo';LIB=ROOT/'assets/art-library'
def read(path):return json.loads(path.read_text())
def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()

base=read(B/'r003/current-main-jobs.json')
finishes={j['slug']:j for j in read(B/'r002/finishes/jobs.json')}
finishes.update({j['slug']:j for j in read(B/'r003/finishes/jobs.json')})
for ext in ['fluid-extension','loose-extension']:
    path=B/ext/'r001';base+=read(path/'jobs.json')
    for j in read(path/'variant-jobs.json'):finishes[j.get('slug',j.get('id'))]=j
rows=base+list(finishes.values())
assert len(base)==26 and len(finishes)==47 and len(rows)==73
assert len({j['design_id'] for j in base})==26
assert len({j['asset_id'] for j in rows})==73
families=['standard-cargo-crate','reinforced-cargo-crate','refrigerated-pod','vacuum-pod','salvage-pod','medical-supply-container','high-value-tech-crate','liquid-tank','cryo-tank','fuel-barrel','chemical-drum','gas-bundle','water-container']
expected={f'cargo-pods-ore-etc--{family}{suffix}' for family in families for suffix in ['','-variant-1','-variant-2','-variant-3','-variant-4']}
expected|={'modular-spaceship-design-2--'+n for n in ['storage-small-crate','storage-medium-crate','storage-large-crate','storage-pale-loose-crate','storage-orange-loose-crate','storage-large-gold-loose-crate','storage-blue-loose-crate','storage-red-loose-crate','storage-narrow-blue-crate','storage-tiny-magenta-crate','storage-red-canister','medical-supply-case']}
reuses={'modular-spaceship-design-2--storage-pale-loose-crate':'cargo.standard.medium','modular-spaceship-design-2--storage-orange-loose-crate':'cargo.standard.large','modular-spaceship-design-2--storage-large-gold-loose-crate':'cargo.standard.large'}
designs={j['design_id']:read(LIB/'designs'/j['design_id']/'design.json') for j in base}
errors=[];covered=set(reuses);artifacts=[]
for ref,target in reuses.items():
    d=designs[target];r=next(r for r in d['revisions'] if r['revision']==d['current_revision'])
    if ref not in d['reference_ids'] or ref not in r['covered_reference_ids']:errors.append('Base reuse lacks explicit current coverage: '+ref)
for j in rows:
    out=Path(j['output']);spec=read(out/'specification.json');d=designs[j['design_id']];r=next(r for r in d['revisions'] if r['revision']==d['current_revision'])
    if d.get('owner_final_signoff'):errors.append('Unexpected owner final signoff: '+d['id'])
    if spec.get('publication') is not False:errors.append('Publication flag not explicitly false: '+str(out))
    for ref in spec['reference_ids']:
        covered.add(ref);meta=read(LIB/'assets'/ref/'reference.json')
        if meta['design_id']!=d['id'] or ref not in d['reference_ids'] or ref not in r['covered_reference_ids']:errors.append('Canonical/current coverage mismatch: '+ref)
        if sha(LIB/meta['crop_path'])!=meta['crop_sha256']:errors.append('Exact crop hash mismatch: '+ref)
    evidence=[]
    for role,filename in [('blender-source','blender-source.blend'),('glb','glb.glb'),('cutout','cutout.png'),('blender-close','blender-close.png'),('blender-top','blender-top.png'),('runtime-close','runtime-close.png'),('runtime-top','runtime-top.png')]:
        p=out/filename
        if not p.exists():errors.append('Missing final '+role+': '+str(p));continue
        h=sha(p);matches=[e for e in r['evidence'] if e['role']==role and e['sha256']==h]
        if not matches:errors.append('Final '+role+' hash absent from current ledger: '+str(p));continue
        match=matches[0]
        if not (LIB/match['path']).exists() or sha(LIB/match['path'])!=h:errors.append('Registered evidence differs: '+match['path'])
        if role.startswith('runtime') and not match.get('capture_context'):errors.append('Runtime capture context absent: '+match['path'])
        evidence.append({'role':role,'sha256':h,'registered_path':match['path']})
    if (out/'cutout.png').exists():
        with Image.open(out/'cutout.png') as im:
            if im.mode!='RGBA' or im.getchannel('A').getextrema()[0]!=0:errors.append('Cutout alpha invalid: '+str(out))
    artifacts.append({'appearance':j.get('slug',j.get('id')),'design_id':d['id'],'current_revision':d['current_revision'],'reference_ids':spec['reference_ids'],'output':str(out),'evidence':evidence})
if covered!=expected:errors.append({'coverage_difference':{'missing':sorted(expected-covered),'unexpected':sorted(covered-expected)}})
result={'schema':'sidereal.final-cargo-coverage-audit.v1','outcome':'pass' if not errors else 'needs-correction','canonical_designs':26,'additional_appearance_assets':47,'total_assets':73,'explicit_source_appearances':len(expected),'verified_covered_source_appearances':len(covered),'errors':errors,'artifacts':artifacts,'explicit_base_reuses':reuses,'remaining_distinct_container_geometry':[],'compositions':['Storage-crate tile, cargo-rack and tractor examples preserve complete source crops and reuse canonical container designs; they do not require duplicate cargo-container geometry.'],'separate_queues':['Pallet/stack compositions, resource/ore objects and UI icons remain separate. Six newly registered unrelated source images have their own pending crop workflow and do not change this two-sheet cargo coverage audit.'],'limits':'Coverage, exact hashes, preserved crops and registered real-render evidence audit. Independent visual/physical reviewers own quality acceptance; only owner can approve final designs. No publication.','owner_approval':False,'publication':False}
(B/'reviews/final-cargo-coverage-audit.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({'outcome':result['outcome'],'canonical_designs':26,'additional_appearances':47,'source_appearances':len(covered),'errors':errors},indent=2))
