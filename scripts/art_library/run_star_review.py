"""Managed isolated review server, reads project service configuration."""
from pathlib import Path
import subprocess,tomllib
root=Path(__file__).resolve().parents[2]
config=tomllib.loads((root/'dev.toml').read_text())
subprocess.run([str(root/'node_modules/.bin/vite'),'--config','scripts/star-review/vite.config.ts','--port',str(config['star_review']['port'])],cwd=root,check=True)
