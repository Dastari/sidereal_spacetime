"""Managed, isolated side armor review. Never publishes."""
from pathlib import Path
import argparse,subprocess,tomllib
R=Path(__file__).resolve().parents[2];p=argparse.ArgumentParser();p.add_argument('--revision',type=int,required=True);p.add_argument('--stage',choices=['build','prepare','render'],default='build');a=p.parse_args();o=R/'.runtime/art-library/side-hull'/f'r{a.revision:03}';o.mkdir(parents=True,exist_ok=True)
if a.stage=='build' and (o/'side-hull-kit.blend').exists():raise ValueError('Preserve prior revision')
c=tomllib.loads((R/'dev.toml').read_text());cmd=['python3',str(R/'scripts/art_library/prepare_side_hull_review.py'),str(o)]if a.stage=='prepare'else[c['art']['blender'],'--background','--threads','8','--python-exit-code','1','--python',str(R/'scripts/art_library'/f'{a.stage}_side_hull_review.py'),'--',str(o)];subprocess.run(cmd,cwd=R,check=True)
