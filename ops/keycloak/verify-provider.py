"""Read-only post-install verification inside provider CT; no credentials/tokens output."""
import json,urllib.request,urllib.parse
from pathlib import Path
base='http://127.0.0.1:8080';admin=json.loads(Path('/root/dastari-keycloak/bootstrap-admin.json').read_text())
body=urllib.parse.urlencode({'grant_type':'password','client_id':'admin-cli','username':admin['username'],'password':admin['password']}).encode()
reply=json.load(urllib.request.urlopen(urllib.request.Request(base+'/realms/master/protocol/openid-connect/token',data=body)))
def get(path):return json.load(urllib.request.urlopen(urllib.request.Request(base+'/admin/realms/dastari'+path,headers={'Authorization':'Bearer '+reply['access_token']})))
realm=get('');clients=get('/clients');result=[]
for cid in ['sidereal-game','sidereal-dashboard']:
 c=next(x for x in clients if x['clientId']==cid)
 assert c['publicClient'] and c['standardFlowEnabled'] and not c['directAccessGrantsEnabled'] and not c['implicitFlowEnabled']
 assert c['attributes']['pkce.code.challenge.method']=='S256'
 assert all('*' not in r for r in c['redirectUris'])
 result.append({k:c[k] for k in ['clientId','publicClient','redirectUris','webOrigins','attributes']})
print(json.dumps({'realm':realm['realm'],'registrationAllowed':realm['registrationAllowed'],'verifyEmail':realm['verifyEmail'],'clients':result,'validation':'actual admin API read; no user mutations'}))
