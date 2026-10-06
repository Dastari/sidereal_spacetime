"""Owned provider only: immutable theme installation and guarded client-only activation."""
import argparse
import copy
import hashlib
import json
import os
import re
import shutil
import tarfile
import time
import urllib.parse
import urllib.request
from pathlib import Path

PRIVATE = Path('/root/dastari-keycloak/theme-backups')
THEMES = Path('/opt/keycloak/themes')
VERSION = Path('/opt/keycloak/version.txt')
DEFAULT = '__realm_default__'
CLIENT = 'sidereal-game'


def safe_revision(value):
    if not re.fullmatch(r'sidereal-[0-9a-f]{16}', value):
        raise ValueError('Expected an immutable Sidereal theme revision')
    return value


def safe_operation(value):
    if not re.fullmatch(r'[0-9a-f]{32}', value):
        raise ValueError('Expected a 32-character operation ID')
    return value


def save_private(path, value):
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    with path.open('x') as stream:
        os.chmod(path, 0o600)
        json.dump(value, stream, indent=2)


def verify_installed(destination, expected_sha):
    manifest = json.loads((destination / 'sidereal-manifest.json').read_text())
    actual = {str(path.relative_to(destination)): hashlib.sha256(path.read_bytes()).hexdigest()
        for path in destination.rglob('*') if path.is_file() and path.name != 'sidereal-manifest.json'}
    if manifest['archiveSha256'] != expected_sha or manifest['files'] != actual:
        raise RuntimeError('Installed immutable theme differs from the reviewed package')
    return manifest


def install_theme(archive, expected_sha, revision):
    safe_revision(revision)
    if hashlib.sha256(archive.read_bytes()).hexdigest() != expected_sha:
        raise RuntimeError('Theme archive digest mismatch')
    if VERSION.read_text().strip() != '26.7.3':
        raise RuntimeError('Theme is reviewed only against Keycloak 26.7.3')
    destination = THEMES / revision
    if destination.exists():
        verify_installed(destination, expected_sha)
        return
    temporary = THEMES / (revision + '.installing')
    if temporary.exists():
        raise RuntimeError('An incomplete installation requires operator inspection')
    temporary.mkdir(mode=0o750)
    try:
        with tarfile.open(archive, 'r:gz') as package:
            for member in package.getmembers():
                parts = Path(member.name).parts
                if not parts or member.name.startswith('/') or '..' in parts or not (member.isfile() or member.isdir()):
                    raise RuntimeError('Unsafe member in theme package')
                if parts[0] != 'login':
                    raise RuntimeError('Only the login theme may be installed')
            package.extractall(temporary, filter='data')
        if not (temporary / 'login/theme.properties').is_file():
            raise RuntimeError('Missing login theme properties')
        files = {str(path.relative_to(temporary)): hashlib.sha256(path.read_bytes()).hexdigest()
            for path in temporary.rglob('*') if path.is_file()}
        save_private(temporary / 'sidereal-manifest.json', {'revision': revision, 'archiveSha256': expected_sha, 'files': files})
        for path in [temporary, *temporary.rglob('*')]:
            shutil.chown(path, user='root', group='keycloak')
            path.chmod(0o750 if path.is_dir() else 0o640)
        temporary.rename(destination)
    except Exception:
        shutil.rmtree(temporary)
        raise


class AdminApi:
    def __init__(self):
        base = 'http://127.0.0.1:8080'
        admin = json.loads(Path('/root/dastari-keycloak/bootstrap-admin.json').read_text())
        body = urllib.parse.urlencode({'client_id': 'admin-cli', 'grant_type': 'password', **admin}).encode()
        request = urllib.request.Request(base + '/realms/master/protocol/openid-connect/token', data=body)
        with urllib.request.urlopen(request) as response:
            self.token = json.load(response)['access_token']
        self.base = base + '/admin/realms/dastari/'

    def __call__(self, path, method='GET', value=None):
        request = urllib.request.Request(self.base + path, method=method,
            data=None if value is None else json.dumps(value).encode(),
            headers={'Authorization': 'Bearer ' + self.token, 'Content-Type': 'application/json'})
        with urllib.request.urlopen(request) as response:
            raw = response.read()
            return json.loads(raw) if raw else None


def theme_of(client):
    return client.get('attributes', {}).get('login_theme') or DEFAULT


def without_theme(client):
    result = copy.deepcopy(client)
    result.get('attributes', {}).pop('login_theme', None)
    return result


def client_snapshot(api):
    clients = api('clients')
    return {client['id']: client for client in clients}


def change_theme(api, revision, expected, operation, rollback=False, private=PRIVATE):
    safe_operation(operation)
    if revision != DEFAULT:
        safe_revision(revision)
    backup_path = private / (operation + '.json')
    before_clients = client_snapshot(api)
    selected = [client for client in before_clients.values() if client['clientId'] == CLIENT]
    if len(selected) != 1:
        raise RuntimeError('Expected exactly one Sidereal game client')
    client = api('clients/' + selected[0]['id'])
    if not client.get('publicClient') or not client.get('standardFlowEnabled') or client.get('implicitFlowEnabled') or client.get('directAccessGrantsEnabled') or client.get('attributes', {}).get('pkce.code.challenge.method') != 'S256':
        raise RuntimeError('Unexpected game client security configuration')
    if not rollback and theme_of(client) == revision and backup_path.is_file():
        backup = json.loads(backup_path.read_text())
        if backup['clientId'] == CLIENT and backup['clientUuid'] == client['id'] and backup['installedTheme'] == revision and backup['previousTheme'] == expected:
            return {'client': CLIENT, 'theme': revision, 'operationId': operation, 'alreadyActivated': True,
                'rollbackReceipt': str(backup_path), 'usersChanged': False}
    if theme_of(client) != expected:
        raise RuntimeError('Client theme changed since review; no mutation performed')
    before_realm = api('')
    if rollback:
        backup = json.loads(backup_path.read_text())
        if backup['clientId'] != CLIENT or backup['clientUuid'] != client['id'] or backup['installedTheme'] != expected:
            raise RuntimeError('Rollback receipt does not match the active client revision')
        revision = backup['previousTheme']
    else:
        if backup_path.exists():
            backup = json.loads(backup_path.read_text())
            if backup['installedTheme'] != revision or backup['clientUuid'] != client['id'] or backup['previousTheme'] != expected:
                raise RuntimeError('Operation ID already belongs to a different theme change')
        else:
            save_private(backup_path, {'operationId': operation, 'clientId': CLIENT, 'clientUuid': client['id'],
                'previousTheme': theme_of(client), 'installedTheme': revision, 'createdNs': time.time_ns()})
    previous_attributes = dict(client.get('attributes', {}))
    attributes = dict(previous_attributes)
    if revision == DEFAULT:
        attributes.pop('login_theme', None)
    else:
        attributes['login_theme'] = revision
    api('clients/' + client['id'], 'PUT', {'attributes': attributes})
    try:
        after = api('clients/' + client['id'])
        if theme_of(after) != revision or without_theme(after) != without_theme(client):
            raise RuntimeError('Provider changed fields beyond the requested theme')
        if api('') != before_realm:
            raise RuntimeError('Realm configuration changed during activation')
        after_clients = client_snapshot(api)
        if set(after_clients) != set(before_clients):
            raise RuntimeError('Client membership changed during activation')
        for identity, other in before_clients.items():
            if identity != client['id'] and after_clients.get(identity) != other:
                raise RuntimeError('An unrelated client changed during activation')
    except Exception:
        api('clients/' + client['id'], 'PUT', {'attributes': previous_attributes})
        raise
    return {'client': CLIENT, 'theme': revision, 'operationId': operation,
        'realmUnchanged': True, 'otherClientsUnchanged': True, 'usersChanged': False,
        'rollbackReceipt': str(backup_path)}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('action', choices=['status', 'install', 'activate', 'rollback'])
    parser.add_argument('--revision')
    parser.add_argument('--archive')
    parser.add_argument('--archive-sha256')
    parser.add_argument('--expected-theme')
    parser.add_argument('--operation-id')
    args = parser.parse_args()
    if args.action == 'status':
        api = AdminApi()
        realm = api('')
        print(json.dumps({'version': VERSION.read_text().strip(), 'realmTheme': realm.get('loginTheme') or DEFAULT,
            'siderealClients': {client['clientId']: theme_of(client) for client in api('clients')
                if client['clientId'] in ('sidereal-game', 'sidereal-dashboard', 'sidereal-shipyard')},
            'registrationAllowed': realm.get('registrationAllowed'), 'rememberMe': realm.get('rememberMe'),
            'resetPasswordAllowed': realm.get('resetPasswordAllowed'),
            'installedThemes': sorted(path.name for path in THEMES.glob('sidereal-*') if path.is_dir())}))
        return
    if not args.revision:
        parser.error('An immutable theme revision is required')
    safe_revision(args.revision)
    if args.action == 'install':
        if not args.archive or not args.archive_sha256:
            parser.error('Installation requires a pinned archive and digest')
        install_theme(Path(args.archive), args.archive_sha256, args.revision)
        print(json.dumps({'theme': args.revision, 'archiveSha256': args.archive_sha256, 'activated': False}))
    else:
        if not args.expected_theme or not args.operation_id:
            parser.error('Theme mutation requires expected theme and operation ID')
        if not (THEMES / args.revision / 'login/theme.properties').is_file():
            raise RuntimeError('Requested immutable theme is not installed')
        if not args.archive_sha256:
            raise RuntimeError('Reviewed theme package digest does not match the installed revision')
        verify_installed(THEMES / args.revision, args.archive_sha256)
        print(json.dumps(change_theme(AdminApi(), args.revision, args.expected_theme, args.operation_id, rollback=args.action == 'rollback')))


if __name__ == '__main__':
    main()
