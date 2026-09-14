"""Managed review-only Blender build/cook launcher; configuration is dev.toml."""
from pathlib import Path
import subprocess,sys,tomllib,json
root=Path(__file__).resolve().parents[2]
job=Path(sys.argv[1]).resolve();review=root/'.runtime/art-library/equipment'
if not job.is_relative_to(review):raise ValueError('Job must be inside isolated equipment review')
for entry in json.loads(job.read_text()):
 if not (root/entry['output']).resolve().is_relative_to(review):raise ValueError('Review output escapes isolated directory')
config=tomllib.loads((root/'dev.toml').read_text())
recipe='refine_equipment_surfaces.py' if '--native-detail' in sys.argv else 'cook_equipment_review.py' if '--cook' in sys.argv else 'build_equipment_review.py'
subprocess.run([config['art']['blender'],'--background','--threads','8','--python-exit-code','1','--python',str(root/'scripts/art_library'/recipe),'--',str(job)],cwd=root,check=True)
