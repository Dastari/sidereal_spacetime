"""Managed Blender review build, never writes published art or starts services."""
from pathlib import Path
import subprocess,sys,tomllib
root=Path(__file__).resolve().parents[2]
out=Path(sys.argv[1]).resolve() if len(sys.argv)>1 else (root/'.runtime/art-library/hull/r001').resolve()
if not out.is_relative_to(root/'.runtime/art-library/hull'):raise ValueError('Review output must remain isolated')
if (out/'pilot-kit.blend').exists():raise ValueError('Preserve revision: editable source already exists')
config=tomllib.loads((root/'dev.toml').read_text())
subprocess.run([str(root/'.tools/art/bin/python'),str(root/'scripts/art_library/hull_maps.py'),str(out/'maps')],cwd=root,check=True)
subprocess.run([config['art']['blender'],'--background','--threads','8','--python-exit-code','1','--python',str(root/'scripts/art_library/build_hull_review.py'),'--',str(out)],cwd=root,check=True)

for recipe in ['render_hull_review.py','finalize_hull_source.py']:
 subprocess.run([config['art']['blender'],'--background','--threads','8','--python-exit-code','1','--python',str(root/'scripts/art_library'/recipe),'--',str(out)],cwd=root,check=True)
