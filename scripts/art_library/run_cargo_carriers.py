"""Managed, isolated CPU-only native carrier review; dev.toml owns Blender."""
from pathlib import Path
import os
import argparse
import subprocess
import tomllib
ROOT = Path(__file__).resolve().parents[2]
config = tomllib.loads((ROOT/'dev.toml').read_text())
parser=argparse.ArgumentParser();parser.add_argument('--attempt',default='a002');args=parser.parse_args()
if len(args.attempt)!=4 or args.attempt[0]!='a' or not args.attempt[1:].isdigit():raise SystemExit('Named attempt required')
out = ROOT/'assets/art-library/designs/cargo.carrier.grid-support/revisions/r000'/args.attempt
if (out/'blender-source.blend').exists():
    raise SystemExit('Preserve prior iteration; select a new attempt directory')
out.mkdir(parents=True, exist_ok=True)
env = dict(os.environ, OMP_NUM_THREADS='2', OPENBLAS_NUM_THREADS='2')
subprocess.run([config['art']['blender'], '--background', '--threads', '2', '--python-exit-code', '1',
                '--python', str(ROOT/'scripts/art_library/build_cargo_carriers.py'), '--', str(out)], cwd=ROOT, env=env, check=True)
