"""Author a preserved native stair attempt. No asset installation or publication."""
from pathlib import Path
import argparse
import subprocess
import tomllib

ROOT = Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser()
parser.add_argument('--attempt', required=True)
args = parser.parse_args()
if not args.attempt.isalnum():
    raise ValueError('Use an alphanumeric preserved attempt identity')
revision = ROOT / 'assets/art-library/designs/shipyard.structure.stair-dogleg/revisions/r000'
output = revision / args.attempt
if output.exists():
    raise ValueError('Preserve prior attempts; choose a new attempt identity')
config = tomllib.loads((ROOT / 'dev.toml').read_text())
subprocess.run([
    config['art']['blender'], '--background', '--factory-startup', '--threads', '8',
    '--python-exit-code', '1', '--python', str(revision / 'author.py'), '--', str(output),
], cwd=ROOT, check=True)
