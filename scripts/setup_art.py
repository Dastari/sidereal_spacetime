from pathlib import Path
import subprocess,venv
root=Path(__file__).resolve().parents[1];target=root/'.tools/art'
venv.EnvBuilder(with_pip=True).create(target)
lock=root/'assets/art_requirements.lock'
requirements=['-r',str(lock)] if lock.exists() else ['https://github.com/ahujasid/blender-mcp/archive/c5f35d9cc54451d785ac4c00c48bf9e98a2e8db9.zip']
subprocess.run([str(target/'bin/python'),'-m','pip','install','--disable-pip-version-check',*requirements],check=True)
(root/'assets/art_requirements.lock').write_text(subprocess.check_output([str(target/'bin/python'),'-m','pip','freeze'],text=True))
