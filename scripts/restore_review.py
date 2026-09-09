"""Isolated cold-backup restoration; never mutates the configured live database."""
from pathlib import Path, PurePosixPath
import hashlib
import json
import os
import shutil
import socket
import tarfile
import time

SERVICE = 'restore-review'
ROOTS = {'database', 'cli-config', 'dev.toml', 'public-client-release.json'}
REQUIRED = {'database/control-db/db', 'database/config.toml',
            'cli-config/id_ecdsa', 'cli-config/id_ecdsa.pub', 'dev.toml'}
RESERVE_BYTES = 8 * 1024 ** 3


def require_review_port(host, port):
    # A stopped HTTP server may leave TIME_WAIT connections. Match the server's
    # address reuse policy while still rejecting any active listener.
    with socket.socket() as probe:
        probe.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        probe.bind((host, port))


def safe_name(value):
    path = PurePosixPath(value)
    if (path.is_absolute() or not path.parts or '..' in path.parts or '\\' in value
            or path.parts[0] not in ROOTS or str(path) != value.rstrip('/')):
        raise RuntimeError('Unsafe recovery archive member')
    return path


def validate_members(members):
    names = set()
    regular = set()
    links = []
    total = 0
    for member in members:
        name = str(safe_name(member.name))
        if name in names:
            raise RuntimeError('Duplicate recovery archive member')
        names.add(name)
        if member.isfile():
            regular.add(name)
            total += member.size
        elif member.islnk():
            links.append(str(safe_name(member.linkname)))
        elif not member.isdir():
            raise RuntimeError('Recovery archive contains a symlink or special file')
    if not REQUIRED <= regular:
        raise RuntimeError('Recovery archive is missing database or signing keys')
    if any(target not in regular for target in links):
        raise RuntimeError('Recovery hard link must target an archived regular file')
    return total


def review_home(lifecycle):
    home = lifecycle.STATE / 'recovery-review'
    if home.is_symlink() or home.resolve().parent != lifecycle.STATE.resolve():
        raise RuntimeError('Recovery destination must remain inside private runtime')
    return home


def prepare(lifecycle, archive_path, expected_sha256):
    home = review_home(lifecycle)
    if home.exists():
        raise RuntimeError('Recovery review already exists; never overwrite it')
    if not expected_sha256 or len(expected_sha256) != 64:
        raise RuntimeError('An exact expected recovery SHA256 is required')
    archive_path = Path(archive_path).resolve()
    with archive_path.open('rb') as source:
        actual = hashlib.file_digest(source, 'sha256').hexdigest()
    if actual != expected_sha256:
        raise RuntimeError('Recovery archive SHA256 mismatch')
    started = time.monotonic()
    with tarfile.open(archive_path, 'r:*') as archive:
        members = archive.getmembers()
        total = validate_members(members)
        free = shutil.disk_usage(lifecycle.STATE).free
        if free < total + RESERVE_BYTES:
            raise RuntimeError('Insufficient disk space plus recovery safety reserve')
        home.mkdir(mode=0o700)
        # Extract only ordinary files/directories. Restore internal hard links in
        # a second pass after all validated regular targets exist; no symlinks.
        for member in members:
            destination = home.joinpath(*safe_name(member.name).parts)
            if member.isdir():
                destination.mkdir(parents=True, exist_ok=True, mode=0o700)
            elif member.isfile():
                destination.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
                descriptor = os.open(destination, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
                with os.fdopen(descriptor, 'wb') as target, archive.extractfile(member) as source:
                    shutil.copyfileobj(source, target, length=1024 * 1024)
        for member in members:
            if member.islnk():
                destination = home.joinpath(*safe_name(member.name).parts)
                destination.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
                os.link(home.joinpath(*safe_name(member.linkname).parts), destination)
    record = {'archive': str(archive_path), 'sha256': actual, 'members': len(members),
              'regularFileBytes': total, 'freeBytesBefore': free,
              'extractionSeconds': round(time.monotonic() - started, 3),
              'liveDatabaseChanged': False, 'prepared': True}
    (home / 'recovery.json').write_text(json.dumps(record, indent=2))
    (home / 'recovery.json').chmod(0o600)
    print(json.dumps(record))


def command(action, lifecycle, archive=None, expected_sha256=None):
    if action == 'prepare':
        if not archive:
            raise RuntimeError('Recovery archive path required')
        return prepare(lifecycle, archive, expected_sha256)
    if action == 'stop':
        return lifecycle.down(SERVICE)
    home = review_home(lifecycle)
    if not (home / 'recovery.json').is_file():
        raise RuntimeError('Prepare a validated isolated recovery first')
    settings = lifecycle.CFG['restore_review']
    if settings['host'] != '127.0.0.1' or settings['port'] == lifecycle.CFG['server']['port']:
        raise RuntimeError('Recovery server requires its own loopback-only port')
    if action == 'restart':
        lifecycle.down(SERVICE)
    existing = lifecycle.load().get(SERVICE)
    if not existing or not lifecycle.alive(existing):
        require_review_port(settings['host'], settings['port'])
    binary = lifecycle.TOOLS / 'bin' / lifecycle.CFG['project']['spacetime_version'] / 'spacetimedb-standalone'
    lifecycle.launch(SERVICE, [str(binary), 'start', '--listen-addr',
        f"127.0.0.1:{settings['port']}", '--data-dir', str(home / 'database'),
        '--jwt-pub-key-path', str(home / 'cli-config/id_ecdsa.pub'),
        '--jwt-priv-key-path', str(home / 'cli-config/id_ecdsa'),
        '--page_pool_max_size', str(512 * 1024 ** 2), '--non-interactive'])
    lifecycle.ready(f"http://127.0.0.1:{settings['port']}/v1/ping", SERVICE)
    print(json.dumps({'service': SERVICE, 'url': f"http://127.0.0.1:{settings['port']}",
                      'databaseDirectory': str(home / 'database'), 'modulePublished': False}))
