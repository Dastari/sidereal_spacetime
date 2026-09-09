"""Publish the owner's scoped bridge duplicate and bunk z-fighting correction."""
from pathlib import Path
import json,shutil,hashlib
ROOT=Path(__file__).resolve().parents[1];r=ROOT/'assets/runtime/assembly';stage=ROOT/'.runtime/art-library/bridge-bed-fix'
read=lambda p:json.loads(p.read_text());write=lambda p,d:p.write_text(json.dumps(d,indent=2)+'\n')
quote='The frontend redesign added wall infront of the bridge area which is conflciting.. Can you remove it? Also the double bed model has z-fighting with the bed posts.. can you fix that too. Publish both once done'
aid='part-c41467ac46f6b350df24';manifest=read(r/'equipment-manifest.json');entry=next(e for e in manifest['entries'] if e['asset']['id']==aid)
archive=ROOT/'assets/source/archive/pre-bridge-bed-fix';archive.mkdir(exist_ok=True)
for n in ['catalog.json','wayfarer.json','hull-manifest.json','equipment-manifest.json']:
 if not (archive/n).exists():shutil.copy2(r/n,archive/n)
for name,path in [('bunk.blend',ROOT/entry['source']),('bunk.glb',ROOT/'assets/runtime'/entry['asset']['visual']['url'].removeprefix('/assets/'))]:
 if not (archive/name).exists():shutil.copy2(path,archive/name)
target=r/'equipment'/aid/'r006';target.mkdir(exist_ok=True)
for n in ['glb.glb','cutout.png']:shutil.copy2(stage/n,target/n)
source=ROOT/'assets/source/approved-equipment'/f'{aid}-r006.blend';shutil.copy2(stage/'blender-source.blend',source)
a=entry['asset'];report=read(stage/'validation.json');a['visual'].update(url=f'/assets/assembly/equipment/{aid}/r006/glb.glb',revision=6,sha256=report['glb_sha256'],bounds=report['bounds_m']);a['thumbnail']=f'/assets/assembly/equipment/{aid}/r006/cutout.png';entry['source']=str(source.relative_to(ROOT))
entry['maintenance_publication']={'base_signed_revision':5,'revision':6,'owner_quote':quote,'message_reference':'Current owner bridge-wall/bunk-post bug report with explicit publication request','scope':'Four post depths .14 to .18 m only; correction publication authorized, no new final design sign-off claimed','glb_sha256':report['glb_sha256'],'source_sha256':hashlib.sha256(source.read_bytes()).hexdigest()}
c=read(r/'catalog.json');c['assets']=[a if x['id']==aid else x for x in c['assets']];write(r/'catalog.json',c);write(r/'equipment-manifest.json',manifest)
import subprocess
subprocess.run(['python3',str(ROOT/'scripts/restore_bridge_surround.py')],check=True,cwd=ROOT)
