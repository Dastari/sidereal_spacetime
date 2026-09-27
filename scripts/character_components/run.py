"""Managed Blender component authoring; never changes the original crew source."""
from pathlib import Path
import sys
ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'scripts'))
from dev import run,CFG
run([CFG['art']['blender'],'--background','--threads','8','--factory-startup','--python-exit-code','1','--python',str(Path(__file__).with_name('build.py')),'--',*sys.argv[1:]])
