"""Managed native face/hair authoring; writes only a new review revision."""
from pathlib import Path
import sys
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'scripts'))
from dev import CFG, run
run([CFG['art']['blender'], '--background', '--threads', '8', '--factory-startup',
     '--python-exit-code', '1', '--python', str(Path(__file__).with_name('faces_study.py')),
     '--', *sys.argv[1:]])
