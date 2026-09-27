"""Preserve shared review scenes, recipes and capture provenance without publishing."""
from pathlib import Path
import json,hashlib,shutil
ROOT=Path(__file__).resolve().parents[2];B=ROOT/'.runtime/art-library/cargo';D=ROOT/'assets/art-library/cargo-collection'
def copy(src,dst):
 if dst.exists():assert src.read_bytes()==dst.read_bytes(),'Immutable shared evidence: '+str(dst)
 else:dst.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(src,dst)
for rev in ['r001','r002','r003']:
 target=D/rev
 for name in ['collection-board.png','blender-common-scale.png','runtime-common-scale.png','runtime-common-scale-top.png','common-scale.blend','common-scale.glb','jobs.json','check.log','build-gate.log','art-check.log']:
  src=B/rev/name
  if src.exists():copy(src,target/name)
 # Capture scripts and logs carry exact asset paths and engine outputs.
 pw=ROOT/'output/playwright'/('cargo' if rev=='r001' else 'cargo-'+rev)
 for p in pw.rglob('*'):
  if p.is_file() and p.suffix in ['.js','.log']:copy(p,target/'capture-recipes'/p.relative_to(pw))
for mode in ['finishes','finishes-r003','extension','loose']:
 pw=ROOT/'output/playwright'/('cargo-'+mode)
 for p in pw.rglob('*'):
  if p.is_file() and p.suffix in ['.js','.log','.json']:copy(p,D/'capture-recipes'/mode/p.relative_to(pw))
for folder in ['current','reviews']:
 for p in (B/folder).rglob('*'):
  if p.is_file():copy(p,D/folder/p.relative_to(B/folder))
for ext in ['fluid-extension','loose-extension']:
 for p in (B/ext/'r001').glob('*'):
  if p.is_file() and p.suffix in ['.json','.md','.log']:copy(p,D/ext/'r001'/p.name)
 attempts=B/ext/'r001/attempts'
 for p in attempts.rglob('*'):
  if p.is_file():copy(p,D/ext/'r001/attempts'/p.relative_to(attempts))
for p in B.glob('final-*.log'):copy(p,D/'checks'/p.name)
for p in (ROOT/'scripts/art_library').glob('*cargo*.py'):
 copy(p,D/'recipes'/p.name)
manifest=[]
for p in D.rglob('*'):
 if p.is_file() and p.name!='manifest.json':manifest.append({'path':str(p.relative_to(D)),'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'bytes':p.stat().st_size})
(D/'manifest.json').write_text(json.dumps(manifest,indent=2))
print('Shared cargo evidence',len(manifest))
