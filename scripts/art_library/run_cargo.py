"""Managed cargo authoring; isolated drafts only, dev.toml selects Blender."""
from pathlib import Path
import json,sys,subprocess,tomllib
root=Path(__file__).resolve().parents[2]
job=Path(sys.argv[1]).resolve() if len(sys.argv)>1 else root/'.runtime/art-library/cargo/r001/jobs.json'
if not job.is_relative_to(root/'.runtime/art-library/cargo'):raise ValueError('Cargo review path required')
for j in json.loads(job.read_text()):
 out=Path(j['output']).resolve()
 if not out.is_relative_to(root/'.runtime/art-library/cargo'):raise ValueError('Output escapes review')
 if (out/'blender-source.blend').exists():raise ValueError('Preserve existing source: '+str(out))
config=tomllib.loads((root/'dev.toml').read_text())
subprocess.run([config['art']['blender'],'--background','--threads','8','--python-exit-code','1','--python',str(root/'scripts/art_library'/('build_cargo_r003.py' if job.parent.name=='r003' else 'build_cargo_r002.py' if job.parent.name=='r002' else 'build_cargo.py')),'--',str(job)],cwd=root,check=True)
