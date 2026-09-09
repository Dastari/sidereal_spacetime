"""Run only inside the dedicated CT through managed keycloak-authoring command.
Creates a distinct game-resource client for Shipyard; never broadens dashboard-only tokens.
No administrator role is assigned to any user by this configuration.
"""
import json,urllib.request,urllib.parse
from pathlib import Path
base='http://127.0.0.1:8080'
admin=json.loads(Path('/root/dastari-keycloak/bootstrap-admin.json').read_text())
data=urllib.parse.urlencode({'client_id':'admin-cli','grant_type':'password',**admin}).encode()
with urllib.request.urlopen(urllib.request.Request(base+'/realms/master/protocol/openid-connect/token',data=data)) as r:token=json.load(r)['access_token']
def api(path,method='GET',value=None):
 req=urllib.request.Request(base+'/admin/realms/dastari/'+path,method=method,data=None if value is None else json.dumps(value).encode(),headers={'Authorization':'Bearer '+token,'Content-Type':'application/json'})
 with urllib.request.urlopen(req) as r:
  raw=r.read();return json.loads(raw) if raw else None
role='sidereal-construction-admin'
if not any(r['name']==role for r in api('roles')):api('roles','POST',{'name':role,'description':'Explicit Sidereal construction workspace grant administrator; never granted automatically.'})
origin='https://sidereal.tail7a58a6.ts.net:8445';clientid='sidereal-shipyard'
client={'clientId':clientid,'name':'Sidereal Shipyard world authoring','enabled':True,'protocol':'openid-connect','publicClient':True,'standardFlowEnabled':True,'implicitFlowEnabled':False,'directAccessGrantsEnabled':False,'serviceAccountsEnabled':False,'redirectUris':[origin+'/shipyard/auth/callback'],'webOrigins':[origin],'attributes':{'pkce.code.challenge.method':'S256','post.logout.redirect.uris':origin+'/'},'defaultClientScopes':['web-origins','profile','email','roles'],'protocolMappers':[{'name':'explicit-world-resource-audience','protocol':'openid-connect','protocolMapper':'oidc-audience-mapper','config':{'included.client.audience':'sidereal-game','id.token.claim':'true','access.token.claim':'true'}},{'name':'construction-realm-roles','protocol':'openid-connect','protocolMapper':'oidc-usermodel-realm-role-mapper','config':{'multivalued':'true','claim.name':'realm_access.roles','jsonType.label':'String','id.token.claim':'true','access.token.claim':'true','userinfo.token.claim':'false'}}]}
existing=api('clients?clientId='+clientid)
if existing:
 current=api('clients/'+existing[0]['id']);current.update(client);api('clients/'+current['id'],'PUT',current)
else:api('clients','POST',client)
actual=api('clients?clientId='+clientid)[0]
assert actual['redirectUris']==client['redirectUris'] and actual['publicClient'] and not actual['directAccessGrantsEnabled']
print(json.dumps({'client':clientid,'callback':client['redirectUris'][0],'game_resource_audience':'sidereal-game','provider_role_created':role,'user_role_assignments':'none','dashboard_client_changed':False}))
