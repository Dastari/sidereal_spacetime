"""Configured Blender authoring only. Never prepares apps or installs assets."""
import argparse
from pathlib import Path
import subprocess
import tomllib

root = Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser()
parser.add_argument('--attempt', type=int, required=True)
args = parser.parse_args()
out = root/'assets/art-library/designs/shipyard.structure.usable-boundary-wall/revisions/r000'/f'a{args.attempt:03}'
if out.exists():
    raise SystemExit('Preserve prior attempt; use a new attempt number')
out.mkdir(parents=True)
config = tomllib.loads((root/'dev.toml').read_text())
subprocess.run([config['art']['blender'], '--background', '--threads', '2', '--python-exit-code', '1',
                '--python', str(root/'scripts/art_library/build_usable_boundary_wall.py'), '--', str(out)],
               cwd=root, check=True)
