"""Managed native star authoring; never publishes assets or world state."""
import argparse, pathlib, subprocess, tomllib
root=pathlib.Path(__file__).resolve().parents[2]
p=argparse.ArgumentParser();p.add_argument('--revision',type=int,default=1);args=p.parse_args()
assert args.revision>0
out=root/'assets/art-library/designs/star.yellow-main-sequence/revisions'/f'r{args.revision:03}'
if out.exists():raise SystemExit('Preserve existing revisions; choose a new revision')
out.mkdir(parents=True)
config=tomllib.loads((root/'dev.toml').read_text())
subprocess.run([config['art']['blender'],'--background','--threads','4','--python-exit-code','1','--python',str(root/'scripts/art_library/build_yellow_star.py'),'--',str(out)],cwd=root,check=True)
