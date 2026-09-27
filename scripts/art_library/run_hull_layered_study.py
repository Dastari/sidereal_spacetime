"""Managed layered panel study; never publishes a catalog or database."""
import argparse
from pathlib import Path
import shutil
import subprocess
import tomllib

ROOT = Path(__file__).resolve().parents[2]
p = argparse.ArgumentParser(description=__doc__)
p.add_argument('--revision', type=int, default=3)
p.add_argument('--stage', choices=('build', 'render'), default='build')
p.add_argument('--specimen')
a = p.parse_args()
if a.revision < 3:
    raise ValueError('Earlier studies are immutable')
out = ROOT / 'assets/art-library/hull-voxel-study' / f'review-r{a.revision:03}'
out.mkdir(parents=True, exist_ok=True)
if a.stage == 'build':
    if (out / 'study.blend').exists():
        raise ValueError('Use a fresh revision; retain the existing source')
    recipe = out / 'recipe'
    recipe.mkdir(exist_ok=True)
    for pattern in ('*hull_layered*.py', 'hull_voxel_study_damage.py', 'hull_voxel_study_panels.py'):
        for path in (ROOT / 'scripts/art_library').glob(pattern):
            shutil.copyfile(path, recipe / path.name)
cfg = tomllib.loads((ROOT / 'dev.toml').read_text())
command = [cfg['art']['blender'], '--background', '--threads', '8',
           '--python-exit-code', '1', '--python',
           str(ROOT / 'scripts/art_library/hull_layered_scene.py'), '--', str(out), a.stage]
if a.specimen:
    command.append(a.specimen)
subprocess.run(command, cwd=ROOT, check=True)
