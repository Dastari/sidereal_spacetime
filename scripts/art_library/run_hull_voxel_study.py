"""Managed, offline hull technology study. Never publishes assets or world data."""
from pathlib import Path
import argparse
import subprocess
import tomllib
import shutil

ROOT = Path(__file__).resolve().parents[2]
p = argparse.ArgumentParser(description=__doc__)
p.add_argument('--revision', type=int, default=1)
p.add_argument('--stage', choices=('build', 'render'), default='build')
p.add_argument('--specimen', help='Render just one immutable specimen slug')
a = p.parse_args()
if a.revision < 1:
    raise ValueError('Revision must be positive')
out = ROOT / 'assets/art-library/hull-voxel-study' / f'review-r{a.revision:03}'
out.mkdir(parents=True, exist_ok=True)
if a.stage == 'build' and (out / 'study.blend').exists():
    raise ValueError('Preserve the existing source revision')
cfg = tomllib.loads((ROOT / 'dev.toml').read_text())
if a.stage == 'build':
    recipe = out / 'recipe'
    recipe.mkdir(exist_ok=True)
    for name in ('run_hull_voxel_study.py', 'hull_voxel_study_scene.py',
                 'hull_voxel_study_panels.py', 'hull_voxel_study_damage.py',
                 'hull_voxel_study_height.py'):
        shutil.copyfile(ROOT / 'scripts/art_library' / name, recipe / name)
command = [cfg['art']['blender'], '--background', '--threads', '8',
           '--python-exit-code', '1', '--python',
           str(ROOT / 'scripts/art_library/hull_voxel_study_scene.py'),
           '--', str(out), a.stage]
if a.specimen:
    command.append(a.specimen)
subprocess.run(command, cwd=ROOT, check=True)
