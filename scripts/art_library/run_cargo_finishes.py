from pathlib import Path
import subprocess,tomllib,json,sys
root=Path(__file__).resolve().parents[2];config=tomllib.loads((root/'dev.toml').read_text());job=Path(sys.argv[1]).resolve() if len(sys.argv)>1 else root/'.runtime/art-library/cargo/r002/finishes/jobs.json'
for j in json.loads(job.read_text()):
 if (Path(j['output'])/'blender-source.blend').exists():raise ValueError('Preserve existing finish evidence')
subprocess.run([config['art']['blender'],'--background','--threads','8','--python-exit-code','1','--python',str(root/'scripts/art_library/build_cargo_finishes.py'),'--',str(job)],cwd=root,check=True)
