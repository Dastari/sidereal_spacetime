"""Managed final two loose-container forms; isolated drafts, no runtime publication."""
from pathlib import Path
import argparse,json,sys,subprocess,tomllib,hashlib
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'.runtime/art-library/cargo/loose-extension/r001'
config=tomllib.loads((ROOT/'dev.toml').read_text());OUT.mkdir(parents=True,exist_ok=True)
parser=argparse.ArgumentParser();parser.add_argument('--repair',action='store_true');parser.add_argument('--audit',action='store_true');args=parser.parse_args()
if args.audit:
    import shutil
    review=ROOT/'.runtime/art-library/cargo/reviews/loose_r001_independent.py';previous=review.with_suffix('.json');archive=OUT/'attempts/001-independent-lid-and-framing-review'
    if previous.exists() and not (archive/'original-physical-audit.json').exists():shutil.copyfile(previous,archive/'original-physical-audit.json')
    subprocess.run([config['art']['blender'],'--background','--threads','4','--python-exit-code','1','--python',str(review)],cwd=ROOT,check=True)
    sys.exit(0)
if args.repair:
    import shutil
    archive=OUT/'attempts/001-independent-lid-and-framing-review'
    if archive.exists():raise ValueError('Preserve existing loose repair archive')
    archive.mkdir(parents=True)
    for name in ['narrow-blue','narrow-red','tiny-magenta']:shutil.move(str(OUT/name),str(archive/name))
    for name in ['jobs.json','variant-jobs.json','authoring-jobs.json','stable-hashes.json']:
        if (OUT/name).exists():shutil.copyfile(OUT/name,archive/name)
    (archive/'review.md').write_text('Independent physical/visual findings: centered hinge blocks collide with lid/leaves; tiny pin support gap; rigid tongue/catch collision; tiny rear support inner face coplanar; stale hidden packing gauge inherited between jobs; open renders crop lid. All three previous source/render generations retained. Repair uses pin-end support ears, recessed keeper and released spring latch, full object purge, and bounds-derived open camera.\n')
jobs=[]
for slug,kind,finish,ref in [('narrow-blue','narrow','blue','storage-narrow-blue-crate'),('narrow-red','narrow','red','storage-red-canister'),('tiny-magenta','tiny','magenta','storage-tiny-magenta-crate')]:
    out=OUT/slug
    if (out/'blender-source.blend').exists():raise ValueError('Preserve existing source '+str(out))
    out.mkdir(exist_ok=True)
    jobs.append({'slug':slug,'kind':kind,'finish':finish,'design_id':'cargo.standard.'+kind,'output':str(out),'reference_ids':['modular-spaceship-design-2--'+ref],'asset_id':'part-'+hashlib.sha256(('cargo.standard.'+slug).encode()).hexdigest()[:20]})
manifest=OUT/'jobs.json';manifest.write_text(json.dumps(jobs,indent=2)+'\n')
subprocess.run([config['art']['blender'],'--background','--threads','8','--python-exit-code','1','--python',str(Path(__file__).with_name('cargo_fluid_extension_loose_build.py')),'--',str(manifest)],cwd=ROOT,check=True)
authored=json.loads(manifest.read_text())
(OUT/'authoring-jobs.json').write_text(json.dumps(authored,indent=2)+'\n')
primary=[j for j in authored if j['finish']!='red'];variants=[j for j in authored if j['finish']=='red']
for j in variants:
    j['id']=j['design_id']+'.appearance-red';j['base']=str(OUT/'narrow-blue');j['family']='standard-narrow'
    j['geometry_note']='Same narrow case geometry as blue primary; exact red enamel appearance preset.'
    j['bounds_m']=json.loads((Path(j['output'])/'validation-blender.json').read_text())['bounds_m']
    j['materials']=json.loads((Path(j['output'])/'materials.json').read_text());j['preset']=str(Path(j['output'])/'preset.json')
manifest.write_text(json.dumps(primary,indent=2)+'\n');(OUT/'variant-jobs.json').write_text(json.dumps(variants,indent=2)+'\n')
if args.repair:
    print('Repaired three loose appearances; preserved earlier attempts and canonical memberships.');sys.exit(0)
sys.path.insert(0,str(ROOT/'scripts'));import art_catalog as ac
refresh=ac.refresh;ac.refresh=lambda:None
try:
    with ac.locked():
        for kind in ['narrow','tiny']:
            refs=[ref for j in jobs if j['kind']==kind for ref in j['reference_ids']];design='cargo.standard.'+kind
            ac.split_design(argparse.Namespace(design='pale-studless.crate.standard',new_design=design,references=refs,reason='Inspected distinct '+kind+' silhouette; exact cropped appearances share one native Blender geometry, explicit color presets. Proposed dimensions, no thumbnail scale inference.'))
            ac.mutate(argparse.Namespace(command='start',design=design,covers=refs,agent='cargo-loose-extension',change='Native hollow '+kind+' case, supported frame and hinged lid, explicitly measured handling clearances.',hypothesis='Tall narrow and tiny squat forms preserve distinct source silhouettes while using realistic small-container hardware rather than claiming a full-size glove grip on the tiny case.'))
        ac.refresh=refresh;ac.refresh()
finally:ac.refresh=refresh
print('Two loose canonical geometries / three appearances built; no publication or approval.')
