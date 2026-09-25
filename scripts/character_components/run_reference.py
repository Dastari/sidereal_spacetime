"""Managed isolated native character calibration; never publishes art or authority."""
from pathlib import Path
import sys
ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'scripts'))
from dev import run,CFG
script='reference_evidence.py' if '--evidence-source' in sys.argv else 'finish_reference.py' if '--finish-source' in sys.argv else 'reference_study.py'
run([CFG['art']['blender'],'--background','--threads','8','--factory-startup','--python-exit-code','1','--python',str(Path(__file__).with_name(script)),'--',*sys.argv[1:]])
