"""Managed Blender floor authoring/baking and isolated review preparation."""
from pathlib import Path
import argparse
import subprocess
import tomllib

ROOT = Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--revision', type=int, default=1)
parser.add_argument('--stage', choices=['build', 'refine', 'render', 'prepare'], default='build')
args = parser.parse_args()
if args.revision < 1:
    raise ValueError('Revision must be positive')
out = ROOT / '.runtime/art-library/floor' / f'r{args.revision:03}'
if args.stage in ['build','refine'] and (out / 'floor-kit.blend').exists():
    raise ValueError('Preserve the existing revision; use a new revision directory')
out.mkdir(parents=True, exist_ok=True)
config = tomllib.loads((ROOT / 'dev.toml').read_text())
if args.stage == 'prepare':
    command = ['python3', str(ROOT / 'scripts/art_library/prepare_floor_review.py'), str(out)]
else:
    recipe = {'build':'build_floor_review.py','refine':'refine_floor_review.py','render':'render_floor_review.py'}[args.stage]
    command = [config['art']['blender'], '--background', '--threads', '8',
               '--python-exit-code', '1', '--python', str(ROOT / 'scripts/art_library' / recipe),
               '--', str(out)]
subprocess.run(command, cwd=ROOT, check=True)
