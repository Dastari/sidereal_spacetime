"""Managed, tailnet-only HTTPS origins for the two independent Sidereal apps."""
import json
import subprocess

def command(action, config):
    status=json.loads(subprocess.check_output(['tailscale','serve','status','--json']))
    if action=='status':
        print(json.dumps(status,indent=2));return
    for app,key,port in [('client','client_origin',8444),('dashboard','dashboard_origin',8445)]:
        origin=config['auth'].get('client_review_origin',config['auth'][key]) if app=='client' else config['auth'][key]
        authority=origin.removeprefix('https://')
        expected=f"http://127.0.0.1:{config[app]['port']}"
        handlers=status.get('Web',{}).get(authority,{}).get('Handlers',{})
        if handlers and handlers != {'/':{'Proxy':expected}}:
            raise RuntimeError(f'Refusing to replace unrelated HTTPS handler on {authority}')
        if action=='setup':
            subprocess.run(['tailscale','serve','--bg',f'--https={port}',expected],check=True)
        elif action=='stop' and handlers:
            subprocess.run(['tailscale','serve',f'--https={port}','off'],check=True)
        print(f'{app}: {origin}')
