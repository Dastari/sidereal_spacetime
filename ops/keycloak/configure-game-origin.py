"""Inside the owned provider CT: add exact public game URLs, preserving users."""
import json
import time
import urllib.parse
import urllib.request
from pathlib import Path

base = 'http://127.0.0.1:8080'
origin = 'https://sidereal.dastari.net'
admin = json.loads(Path('/root/dastari-keycloak/bootstrap-admin.json').read_text())
body = urllib.parse.urlencode({'client_id': 'admin-cli', 'grant_type': 'password', **admin}).encode()
with urllib.request.urlopen(urllib.request.Request(base + '/realms/master/protocol/openid-connect/token', data=body)) as response:
    token = json.load(response)['access_token']


def api(path, method='GET', value=None):
    request = urllib.request.Request(base + '/admin/realms/dastari/' + path, method=method,
        data=None if value is None else json.dumps(value).encode(),
        headers={'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json'})
    with urllib.request.urlopen(request) as response:
        raw = response.read()
        return json.loads(raw) if raw else None


clients = api('clients?clientId=sidereal-game')
if len(clients) != 1:
    raise RuntimeError('Expected exactly one existing game client')
client = api('clients/' + clients[0]['id'])
if not client['publicClient'] or client['attributes'].get('pkce.code.challenge.method') != 'S256':
    raise RuntimeError('Unexpected game client security configuration')
backup = Path('/root/dastari-keycloak') / ('game-client-before-public-' + str(time.time_ns()) + '.json')
backup.write_text(json.dumps(client, indent=2))
backup.chmod(0o600)
client['redirectUris'] = sorted(set(client['redirectUris']) | {origin + '/auth/callback'})
client['webOrigins'] = sorted(set(client['webOrigins']) | {origin})
logout = client['attributes'].get('post.logout.redirect.uris', '').split('##')
client['attributes']['post.logout.redirect.uris'] = '##'.join(sorted(set(filter(None, logout)) | {origin + '/'}))
if any('*' in value for value in client['redirectUris'] + client['webOrigins']):
    raise RuntimeError('Wildcard origin is not permitted')
api('clients/' + client['id'], 'PUT', client)
actual = api('clients/' + client['id'])
assert origin + '/auth/callback' in actual['redirectUris']
assert actual['publicClient'] and not actual['directAccessGrantsEnabled'] and not actual['implicitFlowEnabled']
print(json.dumps({'client': 'sidereal-game', 'publicCallback': origin + '/auth/callback', 'previousExactOriginsPreserved': True, 'usersChanged': False}))
