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
print(json.dumps({'database':config['project']['database'],'databaseUrl':f"http://{config['server']['host']}:{config['server']['port']}",'clientPort':config['client']['port'],'publicClientUrl':config['auth']['client_origin'],'dashboardPort':config['dashboard']['port'],'allowedHosts':config[app].get('allowed_hosts',[]),'authoringClientId':config['auth'].get('authoring_client_id','sidereal-shipyard'),'authIssuer':config['auth']['issuer'],'authClientId':config['auth']['client_id' if app == 'client' else 'dashboard_client_id'],'authOrigin':config['auth']['client_origin' if app == 'client' else 'dashboard_origin']}))
