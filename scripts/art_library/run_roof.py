"""Managed native roof authoring. Never publishes assets or database state."""
from pathlib import Path
import argparse, subprocess,tomllib
R=Path(__file__).resolve().parents[2]
p=argparse.ArgumentParser();p.add_argument('--revision',type=int,default=1);p.add_argument('--stage',choices=['build','prepare','render','diagnose','repair-origin','complete-board'],default='build');a=p.parse_args()
o=R/'.runtime/art-library/roof'/f'r{a.revision:03}';o.mkdir(parents=True,exist_ok=True)
if a.stage=='build' and (o/'roof-kit.blend').exists():raise ValueError('Preserve revision; choose next revision')
c=tomllib.loads((R/'dev.toml').read_text())
cmd=['python3',str(R/'scripts/art_library/prepare_roof_review.py'),str(o)] if a.stage=='prepare' else [c['art']['blender'],'--background','--threads','8','--python-exit-code','1','--python',str(R/'scripts/art_library'/('build_roof_review.py' if a.stage=='build' else 'render_roof_complete_board.py' if a.stage=='complete-board' else 'repair_roof_export_origin.py' if a.stage=='repair-origin' else 'diagnose_roof_normals.py' if a.stage=='diagnose' else 'render_roof_review.py')),'--',str(o)]
subprocess.run(cmd,cwd=R,check=True)
