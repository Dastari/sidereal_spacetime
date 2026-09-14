"""Managed, isolated Blender authoring. Reads the same dev.toml; never publishes."""
import subprocess, tomllib, sys
from pathlib import Path
root=Path(__file__).resolve().parents[2]
config=tomllib.loads((root/'dev.toml').read_text())
out=root/'assets/art-library/designs/crew.animation.aim/revisions/r002'
subprocess.run([config['art']['blender'],'--background','--threads','2','--python',str(root/'scripts/art_library/stage_equipment_poses.py'),'--',str(out)],cwd=root,check=True)
