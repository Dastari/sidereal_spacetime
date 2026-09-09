import sys,json,urllib.request,urllib.parse
from pathlib import Path
admin=json.loads(Path('/root/dastari-keycloak/bootstrap-admin.json').read_text());review=json.loads(Path('/root/dastari-keycloak/sidereal-review.json').read_text());base='http://127.0.0.1:8080'
with urllib.request.urlopen(urllib.request.Request(base+'/realms/master/protocol/openid-connect/token',data=urllib.parse.urlencode({'client_id':'admin-cli','grant_type':'password',**admin}).encode())) as r:token=json.load(r)['access_token']
headers={'Authorization':'Bearer '+token,'Content-Type':'application/json'}
with urllib.request.urlopen(urllib.request.Request(base+'/admin/realms/dastari/roles/sidereal-construction-admin',headers=headers)) as r:role=json.load(r)
action=sys.argv[1]
assert action in ['grant','revoke']
req=urllib.request.Request(base+'/admin/realms/dastari/users/'+review['id']+'/role-mappings/realm',data=json.dumps([role]).encode(),headers=headers,method='POST' if action=='grant' else 'DELETE')
with urllib.request.urlopen(req) as r:assert r.status==204
print('Dedicated review account construction role '+action+' completed. No credentials exported.')
