"""v1.0.0: CT116 managed review identity, retained until owner go-live decision.

Called only through scripts/dev.py. Credentials never go to stdout. Existing
accounts/passwords are never replaced, reset or silently adopted.
"""
import json
import os
from pathlib import Path
import secrets
import sys
import stat
import tempfile
import urllib.parse
import urllib.request

USERNAME = 'sidereal-development-review'
OWNER = 'sidereal-development-review-v1'
ROOT = Path('/root/dastari-keycloak')
CREDENTIAL = ROOT / 'sidereal-development-review.json'
BASE = 'http://127.0.0.1:8080'


def read_record(path):
    if stat.S_IMODE(path.stat().st_mode) != 0o600:
        raise RuntimeError('Managed review credential must be mode0600')
    account = json.loads(path.read_text())
    if (account.get('username') != USERNAME or account.get('managedBy') != OWNER
            or not isinstance(account.get('password'), str) or len(account['password']) < 32):
        raise RuntimeError('Managed review identity does not match; refusing changes')
    return account


def store_record(path, account):
    fd, temporary = tempfile.mkstemp(prefix=path.name + '-', dir=path.parent)
    try:
        with os.fdopen(fd, 'w') as stream:
            json.dump(account, stream)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
    finally:
        Path(temporary).unlink(missing_ok=True)


def verify_account(actual, account):
    if (actual.get('id') != account.get('id') or actual.get('username') != USERNAME
            or not actual.get('enabled')):
        raise RuntimeError('Managed review account is disabled or mismatched')
    # Keycloak user-profile policy may omit undeclared custom attributes. Exact
    # ID in the root-only credential is ownership; reject a contradictory marker.
    marker = actual.get('attributes', {}).get('sidereal_review_owner')
    if marker is not None and marker != [OWNER]:
        raise RuntimeError('Provider review ownership marker changed')


def ensure_account(request, credential, action='ensure'):
    if credential.exists():
        account = read_record(credential)
        _, _, actual = request('/admin/realms/dastari/users/' + account['id'])
        verify_account(actual, account)
        return account, False
    if action != 'ensure':
        raise RuntimeError('Provision the managed review identity first')
    pending = credential.with_suffix('.pending.json')
    account = read_record(pending) if pending.exists() else None
    _, _, found = request('/admin/realms/dastari/users?' + urllib.parse.urlencode({'username': USERNAME, 'exact': 'true'}))
    if found:
        if len(found) != 1 or not account:
            raise RuntimeError('Review username exists without managed credentials; refusing adoption/reset')
        actual = found[0]
        if not account.get('id'):
            if actual.get('attributes', {}).get('sidereal_review_owner') != [OWNER]:
                raise RuntimeError('Creation response was interrupted and provider omitted ownership marker; retain pending credentials and verify provider ID manually. No account/password changed.')
            account['id'] = actual['id']
        verify_account(actual, account)
        store_record(pending, account)
        os.replace(pending, credential)
        return account, False
    if account and account.get('id'):
        raise RuntimeError('Pending managed account was deleted; refusing recreation')
    if not account:
        account = {'username': USERNAME, 'password': secrets.token_urlsafe(36), 'managedBy': OWNER,
                   'retention': 'Retain until explicit owner go-live retirement decision'}
        store_record(pending, account)
    status, response_headers, _ = request('/admin/realms/dastari/users', {
        'username': USERNAME, 'enabled': True, 'emailVerified': False,
        'firstName': 'Development', 'lastName': 'Review',
        'email': USERNAME + '@example.invalid', 'requiredActions': [],
        'attributes': {'sidereal_review_owner': [OWNER]},
        'credentials': [{'type': 'password', 'value': account['password'], 'temporary': False}],
    }, 'POST')
    if status != 201:
        raise RuntimeError('Review account creation did not complete')
    account['id'] = response_headers['Location'].rsplit('/', 1)[1]
    store_record(pending, account)
    os.replace(pending, credential)
    return account, True


def main(action):
    if action not in ('ensure', 'grant', 'revoke'):
        raise ValueError('Unsupported review action')
    admin = json.loads((ROOT / 'bootstrap-admin.json').read_text())
    with urllib.request.urlopen(urllib.request.Request(
        BASE + '/realms/master/protocol/openid-connect/token',
        data=urllib.parse.urlencode({'client_id': 'admin-cli', 'grant_type': 'password', **admin}).encode(),
    ), timeout=20) as response:
        token = json.load(response)['access_token']
    headers = {'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json'}

    def request(path, data=None, method=None):
        with urllib.request.urlopen(urllib.request.Request(
            BASE + path, headers=headers, method=method,
            data=json.dumps(data).encode() if data is not None else None,
        ), timeout=20) as response:
            body = response.read()
            return response.status, response.headers, json.loads(body) if body else None

    account, created = ensure_account(request, CREDENTIAL, action)
    if action in ('grant', 'revoke'):
        _, _, role = request('/admin/realms/dastari/roles/sidereal-construction-admin')
        status, _, _ = request('/admin/realms/dastari/users/' + account['id'] + '/role-mappings/realm',
                               [role], 'POST' if action == 'grant' else 'DELETE')
        if status != 204:
            raise RuntimeError('Review role change did not complete')
    _, _, roles = request('/admin/realms/dastari/users/' + account['id'] + '/role-mappings/realm')
    print(json.dumps({'username': USERNAME, 'id': account['id'], 'created': created,
                      'retained': True, 'constructionAdmin': any(r['name'] == 'sidereal-construction-admin' for r in roles),
                      'action': action}))


if __name__ == '__main__':
    main(sys.argv[1])
