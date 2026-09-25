from pathlib import Path
import subprocess,tomllib,sys
root=Path(__file__).resolve().parents[2];config=tomllib.loads((root/'dev.toml').read_text());job=Path(sys.argv[1]).resolve() if len(sys.argv)>1 else root/'.runtime/art-library/cargo/r002/jobs.json'
subprocess.run([config['art']['blender'],'--background','--threads','8','--python-exit-code','1','--python',str(root/'scripts/art_library/cargo_fit_evidence.py'),'--',str(job)]+sys.argv[2:],cwd=root,check=True)
