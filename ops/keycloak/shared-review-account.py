"""CT116-only managed secondary ordinary test account. Never resets existing users."""
import json
import os
import secrets
import urllib.request
import urllib.parse
from pathlib import Path

base = 'http://127.0.0.1:8080'
root = Path('/root/dastari-keycloak')
admin = json.loads((root / 'bootstrap-admin.json').read_text())
primary = json.loads((root / 'sidereal-review.json').read_text())
with urllib.request.urlopen(urllib.request.Request(
    base + '/realms/master/protocol/openid-connect/token',
    data=urllib.parse.urlencode({'client_id': 'admin-cli', 'grant_type': 'password', **admin}).encode(),
), timeout=20) as response:
    token = json.load(response)['access_token']
headers = {'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json'}

def request(path, data=None, method=None):
    with urllib.request.urlopen(urllib.request.Request(base + path,
        data=json.dumps(data).encode() if data is not None else None,
        headers=headers, method=method), timeout=20) as response:
        body = response.read()
        return response.status, response.headers, json.loads(body) if body else None

path = root / 'sidereal-shared-review.json'
created = False
if path.exists():
    account = json.loads(path.read_text())
    _, _, actual = request('/admin/realms/dastari/users/' + account['id'])
    assert actual['username'] == account['username'] and actual['enabled']
    # Keycloak's managed user-profile policy may omit undeclared attributes.
    # Ownership is the existing root-only credential file and exact account ID.
    assert account['username'] == 'sidereal-shared-review'
    assert account.get('managedBy', 'shared-world-acceptance-r001') == 'shared-world-acceptance-r001'
    if not actual.get('email'):
        request('/admin/realms/dastari/users/' + account['id'], {'email': 'sidereal-shared-review@example.invalid', 'emailVerified': False}, 'PUT')
else:
    username = 'sidereal-shared-review'
    _, _, found = request('/admin/realms/dastari/users?' + urllib.parse.urlencode({'username': username, 'exact': 'true'}))
    if found:
        raise RuntimeError('Review username already exists without its managed credentials; refusing to reset it')
    password = secrets.token_urlsafe(36)
    status, response_headers, _ = request('/admin/realms/dastari/users', {
        'username': username, 'enabled': True, 'emailVerified': False,
        'firstName': 'Shared', 'lastName': 'Review',
        'email': 'sidereal-shared-review@example.invalid',
        'attributes': {'sidereal_review_owner': ['shared-world-acceptance-r001']},
        'requiredActions': [],
        'credentials': [{'type': 'password', 'value': password, 'temporary': False}],
    }, 'POST')
    assert status == 201
    account = {'id': response_headers['Location'].rsplit('/', 1)[1], 'username': username, 'password': password, 'managedBy': 'shared-world-acceptance-r001'}
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, 'w') as stream:
        json.dump(account, stream)
    created = True
assert account['id'] != primary['id']
_, _, roles = request('/admin/realms/dastari/users/' + account['id'] + '/role-mappings/realm')
assert not any(role['name'] in ['sidereal-construction-admin', 'admin', 'realm-admin'] for role in roles)
path.chmod(0o600)
print(json.dumps({'secondaryReviewAccountCreated': created, 'distinctFromPrimary': True,
    'privilegedRolesAssigned': False, 'credentialPath': str(path)}))
