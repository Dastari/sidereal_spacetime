"""Managed isolated native inlet authoring. Never installs or publishes."""
from pathlib import Path
import argparse, subprocess, tomllib
ROOT = Path(__file__).resolve().parents[2]
p = argparse.ArgumentParser()
p.add_argument('--attempt', type=int, required=True)
p.add_argument('--stage', choices=['build','attachment'], default='build')
a = p.parse_args()
out = ROOT / 'assets/art-library/designs/shipyard.structure.wayfarer-airlock-inlet/revisions/r000' / f'a{a.attempt:03}'
if a.stage=='build' and out.exists():
    raise SystemExit('Preserve existing attempt; choose a fresh attempt number')
out.mkdir(parents=True,exist_ok=True)
if a.stage=='attachment' and (out/'attachment-capture.json').exists():
    raise SystemExit('Preserve prior attachment evidence')
config = tomllib.loads((ROOT / 'dev.toml').read_text())
subprocess.run([config['art']['blender'], '--background', '--threads', '8', '--python-exit-code', '1', '--python', str(ROOT / 'scripts/art_library' / ('build_airlock_inlet.py' if a.stage=='build' else 'render_airlock_inlet_attachment.py')), '--', str(out)], cwd=ROOT, check=True)
