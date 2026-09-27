from pathlib import Path
import subprocess,tomllib
root=Path(__file__).resolve().parents[2];out=root/'.runtime/art-library/hull/r005'
if (out/'pilot-kit.blend').exists():raise ValueError('Preserve meaningful revision before rebuilding')
out.mkdir(parents=True,exist_ok=True);c=tomllib.loads((root/'dev.toml').read_text())
subprocess.run([c['art']['blender'],'--background','--threads','8','--python-exit-code','1','--python',str(root/'scripts/art_library/build_pilot_r005.py'),'--',str(out)],cwd=root,check=True)
