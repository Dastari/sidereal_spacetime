"""Explicit operator-only player-ship migration; preserves the database and character IDs."""
import argparse, json, subprocess
from pathlib import Path
from dev import CLI, ROOT
TARGET = '56e485c9a9d49b5aa0c5e44a47f88916296896717df386b7240baf408e28ae44'
LEGACY = '362f37217f63a44a470676f104c8368bd0973ca03f5e29eab190bc4d6df71340'
def sql(server, database, query):
    r = subprocess.run(CLI + ['sql', database, '--server', server, '--format', 'json', query], cwd=ROOT, check=True, capture_output=True, text=True)
    result = json.loads(r.stdout)[0]
    fields = [c['name']['some'] for c in result['schema']['elements']]
    return [dict(zip(fields, row)) for row in result['rows']]
def run(server, database, audit, apply):
    if not database.startswith('sidereal-spacetime-dev') or not server.startswith('http://127.0.0.1:'):
        raise ValueError('Explicit managed local database required')
    path = Path(audit)
    if path.exists():
        record = json.loads(path.read_text())
        if record['server'] != server or record['database'] != database or record['target'] != TARGET:
            raise ValueError('Audit target mismatch')
    else:
        actors = sql(server,database,'SELECT id, shipId FROM character')
        ships = {s['id']:s for s in sql(server,database,'SELECT id, revision FROM ship')}
        instances = {s['id']:s for s in sql(server,database,'SELECT id, blueprintSha256 FROM construction_instance')}
        requests=[]
        for a in actors:
            sha=instances.get(a['shipId'],{}).get('blueprintSha256')
            if sha == TARGET: continue
            if sha not in [None,LEGACY]: raise ValueError('Unknown player ship template; refusing broad reset')
            requests.append({'characterId':a['id'],'expectedShipId':a['shipId'],'expectedShipRevision':ships[a['shipId']]['revision']})
        if len(requests)>128: raise ValueError('Migration batch budget exceeded')
        record={'server':server,'database':database,'target':TARGET,'requests':requests,'completed':[]}
        path.parent.mkdir(parents=True,exist_ok=True)
        path.write_text(json.dumps(record,indent=2)+'\n');path.chmod(0o600)
    print(json.dumps({'planned':len(record['requests']),'apply':apply,'database':database}),flush=True)
    if not apply:return
    for request in record['requests']:
        # The server stores an exact request receipt; interrupted/repeated runs cannot grant another ship.
        args=[json.dumps(request['characterId']),json.dumps(request['expectedShipId']),str(request['expectedShipRevision'])]
        subprocess.run(CLI+['call',database,'replace_legacy_player_wayfarer',*args,'--server',server,'--yes','--no-config'],cwd=ROOT,check=True,capture_output=True,text=True)
        if request['characterId'] not in record['completed']:record['completed'].append(request['characterId'])
        path.write_text(json.dumps(record,indent=2)+'\n')
        print('Replaced',len(record['completed']),'of',len(record['requests']),flush=True)
    actors = sql(server,database,'SELECT id, shipId FROM character')
    instances={s['id']:s for s in sql(server,database,'SELECT id, blueprintSha256 FROM construction_instance')}
    for request in record['requests']:
        actor=next(a for a in actors if a['id']==request['characterId'])
        if actor['shipId']==request['expectedShipId'] or instances.get(actor['shipId'],{}).get('blueprintSha256')!=TARGET:
            raise ValueError('Postmigration source/identity verification failed')
    record['verified']=True
    path.write_text(json.dumps(record,indent=2)+'\n')
    print('Verified every replaced character on the rebuilt source')
if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--server',required=True);p.add_argument('--database',required=True)
    p.add_argument('--audit',required=True);p.add_argument('--apply',action='store_true')
    a=p.parse_args()
    try:run(a.server,a.database,a.audit,a.apply)
    except subprocess.CalledProcessError as e:
        # CLI reducer failures contain no bearer token, but suppress arbitrary provider output.
        raise SystemExit('Managed database command rejected; audit retained. '+(e.stderr or '')[-1800:])
