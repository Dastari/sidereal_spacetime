"""Managed Blender launcher; job paths must stay in isolated review output."""
from pathlib import Path
import subprocess
import sys
import tomllib

root=Path(__file__).resolve().parents[2]
job=Path(sys.argv[1]).resolve()
if not job.is_relative_to(root/".runtime/art-library"):
    raise ValueError("Job manifest must be in .runtime/art-library")
config=tomllib.loads((root/"dev.toml").read_text())
recipe="render_voxel_review.py" if "--voxel" in sys.argv[2:] else "build_construction.py"
subprocess.run([config["art"]["blender"],"--background","--threads","8","--python",str(root/"scripts/art_library"/recipe),"--",str(job)],cwd=root,check=True)
