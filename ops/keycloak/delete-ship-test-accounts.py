"""Run inside managed CT116; delete only the three pinned ship-test logins.

Owner authorized deletion on 2026-09-12. Personal logins and other realms are
excluded. Default is read-only; credentials and tokens never leave this process.
"""
import argparse
import json
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

TARGETS = {
    '44a1d834-6cc3-448f-91ad-8503734f55cc': 'sidereal-native-public-review',
    '5882b0ce-e450-4e4e-aa5b-bff4ef021893': 'sidereal-review-7aaa4143',
    '2f480952-98fe-4375-8cf1-14d021d006ac': 'sidereal-shared-review',
}

def run(apply=False):
    base = 'http://127.0.0.1:8080'
    admin = json.loads(Path('/root/dastari-keycloak/bootstrap-admin.json').read_text())
    body = urllib.parse.urlencode(dict(grant_type='password', client_id='admin-cli', **admin)).encode()
    token = json.load(urllib.request.urlopen(base + '/realms/master/protocol/openid-connect/token', data=body))['access_token']
    def request(path, method='GET'):
        req = urllib.request.Request(base + '/admin/realms/dastari' + path,
                                     headers={'Authorization': 'Bearer ' + token}, method=method)
        with urllib.request.urlopen(req) as response:
            payload = response.read()
            return json.loads(payload) if payload else None
    users = request('/users?max=1000')
    protected = [u for u in users if u['id'] not in TARGETS]
    if not any(u.get('email') == 'toby.martin@me.com' and u['username'] == 'dastari' for u in protected):
        raise ValueError('Protected Dastari login missing')
    targets = [u for u in users if u['id'] in TARGETS]
    for u in targets:
        if u['username'] != TARGETS[u['id']] or u.get('email') != u['username'] + '@example.invalid':
            raise ValueError('Pinned test-account identity changed')
    print(json.dumps({'targets': [u['username'] for u in targets], 'apply': apply}), flush=True)
    if not apply:
        return
    for u in targets:
        request('/users/' + u['id'] + '/logout', 'POST')
        request('/users/' + u['id'], 'DELETE')
    after = request('/users?max=1000')
    if any(u['id'] in TARGETS for u in after):
        raise ValueError('Test login remains')
    # UserRepresentation timestamps and profile fields must remain unchanged.
    if sorted(after, key=lambda u: u['id']) != sorted(protected, key=lambda u: u['id']):
        raise ValueError('Unrelated provider account changed')
    print(json.dumps({'deleted': len(targets), 'remaining': [u['username'] for u in after], 'protectedAccountsUnchanged': True}))

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true')
    run(parser.parse_args().apply)
