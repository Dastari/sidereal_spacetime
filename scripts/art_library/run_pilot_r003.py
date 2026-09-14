from pathlib import Path
import subprocess,tomllib,shutil
root=Path(__file__).resolve().parents[2];out=root/'.runtime/art-library/hull/r003'
if (out/'pilot-kit.blend').exists():raise ValueError('Preserve meaningful revision first')
out.mkdir(parents=True,exist_ok=True)
shutil.copytree(root/'.runtime/art-library/hull/r001/maps',out/'maps',dirs_exist_ok=True)
config=tomllib.loads((root/'dev.toml').read_text())
subprocess.run([config['art']['blender'],'--background','--threads','8','--python-exit-code','1','--python',str(root/'scripts/art_library/build_pilot_r003.py'),'--',str(out)],cwd=root,check=True)
