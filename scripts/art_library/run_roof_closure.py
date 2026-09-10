"""Managed isolated native roof closure authoring; preserves prior attempts."""
from pathlib import Path
import argparse,subprocess,tomllib
root=Path(__file__).resolve().parents[2];p=argparse.ArgumentParser();p.add_argument('--attempt',type=int,required=True);a=p.parse_args()
out=root/'assets/art-library/designs/shipyard.structure.roof-closure/revisions/r000'/f'a{a.attempt:03}'
if out.exists():raise SystemExit('Preserve prior attempt; use a new number')
out.mkdir(parents=True)
config=tomllib.loads((root/'dev.toml').read_text());subprocess.run([config['art']['blender'],'--background','--threads','8','--python-exit-code','1','--python',str(root/'scripts/art_library/build_roof_closure.py'),'--',str(out)],cwd=root,check=True)
