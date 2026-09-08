"""Verify independent artifacts and managed lifetimes; never touches the old project."""
from pathlib import Path
import hashlib
import json
import subprocess
import urllib.request
import tomllib

ROOT = Path(__file__).resolve().parents[1]
CONFIG = tomllib.loads((ROOT/'dev.toml').read_text())

def fingerprint(path):
    files = sorted(item for item in path.rglob('*') if item.is_file())
    if not files:
        raise RuntimeError(f'Build first: {path}')
    digest = hashlib.sha256()
    for file in files:
        digest.update(str(file.relative_to(path)).encode())
        digest.update(file.read_bytes())
    return digest.hexdigest()

def run(*arguments):
    with (ROOT/'.runtime/isolation-build.log').open('a') as output:
        subprocess.run(arguments, cwd=ROOT, stdout=output, stderr=output, check=True)

def processes():
    return json.loads((ROOT/'.runtime/processes.json').read_text())

def health(app):
    url = f"http://127.0.0.1:{CONFIG[app]['port']}"
    assert urllib.request.urlopen(url, timeout=3).status == 200

world = fingerprint(ROOT/'packages/world/dist')
dashboard = fingerprint(ROOT/'apps/dashboard/dist')
run('npm', 'run', 'build:client')
assert fingerprint(ROOT/'apps/dashboard/dist') == dashboard, 'Client build changed dashboard'
assert fingerprint(ROOT/'packages/world/dist') == world, 'Client build changed world artifact'
client = fingerprint(ROOT/'apps/client/dist')
run('npm', 'run', 'build:dashboard')
assert fingerprint(ROOT/'apps/client/dist') == client, 'Dashboard build changed client'
assert fingerprint(ROOT/'packages/world/dist') == world, 'Dashboard build changed world artifact'

for target, sibling in [('dashboard', 'client'), ('client', 'dashboard')]:
    before = processes()
    run('python3', 'scripts/dev.py', 'stop-'+target)
    try:
        after = processes()
        assert after[sibling] == before[sibling] and after['database'] == before['database']
        health(sibling)
        assert urllib.request.urlopen(f"http://127.0.0.1:{CONFIG['server']['port']}/v1/ping", timeout=3).status == 200
    finally:
        run('python3', 'scripts/dev.py', 'up-'+target)
    health(target)

report = {'independent_build_outputs':True,'app_builds_do_not_rebuild_world':True,'independent_app_lifetimes':True,'database_kept_running':True}
(ROOT/'.runtime/isolation-results.json').write_text(json.dumps(report, indent=2)+'\n')
print(json.dumps(report, indent=2))
