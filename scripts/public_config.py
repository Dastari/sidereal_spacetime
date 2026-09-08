"""Return only public build/proxy configuration; never expose process secrets."""
from pathlib import Path
import json
import sys
import tomllib
root = Path(__file__).resolve().parents[1]
config = tomllib.loads((root/'dev.toml').read_text())
app = sys.argv[1]
if app not in ('client','dashboard'):
    raise SystemExit('Expected client or dashboard')
print(json.dumps({'database':config['project']['database'],'databaseUrl':f"http://{config['server']['host']}:{config['server']['port']}",'clientPort':config['client']['port'],'dashboardPort':config['dashboard']['port'],'allowedHosts':config[app].get('allowed_hosts',[])}))
