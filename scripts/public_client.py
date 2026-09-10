"""Managed immutable public game build, independent of both development apps."""
from pathlib import Path
import hashlib
import json
import os
import shutil
import shlex
import time
import fcntl

ROOT = Path(__file__).resolve().parents[1]


def validate_build(folder):
    folder = Path(folder)
    if not (folder / 'index.html').is_file():
        raise RuntimeError('Build has no index.html')
    for name in ('docs', 'reference', 'PIVOT.md'):
        if (folder / name).exists():
            raise RuntimeError('Build exposes internal files: ' + name)
    digest = hashlib.sha256()
    for file in sorted(folder.rglob('*')):
        if file.is_symlink():
            raise RuntimeError('Public build must contain files, not symlinks')
        if file.is_file():
            digest.update(file.relative_to(folder).as_posix().encode() + b'\0')
            with file.open('rb') as stream:
                digest.update(hashlib.file_digest(stream, 'sha256').digest())
    return digest.hexdigest()


def command(action, cfg, lifecycle, *, artifact=None, artifact_sha256=None, expected_live_sha256=None, expected_staged_sha256=None):
    # Managed publishers share this lock through validation and activation, so a
    # second release cannot replace the live/staged metadata between the guards
    # and the symlink switch. Staging still leaves the running service alone.
    home = ROOT / '.runtime/public-client'
    home.mkdir(parents=True, exist_ok=True)
    with (home / '.release.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        return _command(action, cfg, lifecycle, artifact=artifact, artifact_sha256=artifact_sha256,
            expected_live_sha256=expected_live_sha256, expected_staged_sha256=expected_staged_sha256)


def _command(action, cfg, lifecycle, *, artifact=None, artifact_sha256=None, expected_live_sha256=None, expected_staged_sha256=None):
    if expected_live_sha256 is not None or expected_staged_sha256 is not None:
        if action != 'activate' or not expected_live_sha256 or not expected_staged_sha256:
            raise RuntimeError('Expected live and staged digests require activate only')
    if artifact is not None or artifact_sha256 is not None:
        if action != 'stage' or not artifact or not artifact_sha256:
            raise RuntimeError('Prebuilt client path and digest require stage only')
    if action == 'proxy':
        host = 'toby@10.0.1.248'
        container = 'nginx-proxy-manager-app-1'
        lifecycle.run(['scp', '-q', str(ROOT / 'ops/keycloak/npm-game-host.mjs'), host + ':/tmp/sidereal-game-host.mjs'])
        for args in (
            ['docker', 'cp', '/tmp/sidereal-game-host.mjs', container + ':/app/sidereal-game-host.mjs'],
            ['docker', 'exec', '-w', '/app', container, 'node', '/app/sidereal-game-host.mjs'],
        ):
            lifecycle.run(['ssh', '-o', 'BatchMode=yes', host, shlex.join(args)])
        return
    settings = cfg['public_client']
    home = ROOT / '.runtime/public-client'
    current = home / 'current'
    if action in ('deploy', 'stage'):
        if artifact is None:
            lifecycle.run(['npm', 'run', 'build:client'])
            source = ROOT / 'apps/client/dist'
        else:
            source = Path(artifact).absolute()
            if source.is_symlink() or not source.is_dir():
                raise RuntimeError('Prebuilt client must be a regular directory')
        digest = validate_build(source)
        if artifact is not None and digest != artifact_sha256:
            raise RuntimeError('Prebuilt client digest mismatch')
        release = home / 'releases' / (time.strftime('%Y%m%d-%H%M%S') + '-' + digest[:12])
        shutil.copytree(source, release)
        if validate_build(release) != digest:
            raise RuntimeError('Release copy verification failed')
        (home / 'staged.json').write_text(json.dumps({'origin': cfg['auth']['client_origin'], 'sha256': digest, 'release': str(release)}, indent=2))
        print('Public build staged:', digest)
    if action in ('deploy', 'activate'):
        staged = json.loads((home / 'staged.json').read_text())
        if expected_staged_sha256 is not None:
            live = json.loads((home / 'release.json').read_text())
            if live['sha256'] != expected_live_sha256 or staged['sha256'] != expected_staged_sha256:
                raise RuntimeError('Public release changed since review; reconcile before activation')
            if current.resolve() != Path(live['release']).resolve() or validate_build(current.resolve()) != expected_live_sha256:
                raise RuntimeError('Current public artifact differs from expected live digest')
        release = Path(staged['release'])
        if release.resolve().parent != (home / 'releases').resolve() or validate_build(release) != staged['sha256']:
            raise RuntimeError('Staged public release failed verification')
        lifecycle.down('public-client')
        pending = home / 'next'
        pending.unlink(missing_ok=True)
        pending.symlink_to(release)
        pending.replace(current)
        (home / 'release.json').write_text(json.dumps(staged, indent=2))
        print('Public build activated:', staged['sha256'])
    if action in ('deploy', 'activate', 'up'):
        if not (current / 'index.html').is_file():
            raise RuntimeError('Deploy a public build before starting it')
        existing = lifecycle.load().get('public-client')
        if not existing or not lifecycle.alive(existing):
            lifecycle.port_free(settings['host'], settings['port'])
        lifecycle.launch('public-client', [
            'node', 'node_modules/vite/bin/vite.js', 'preview',
            '--config', 'apps/client/vite.config.ts', '--host', settings['host'],
            '--port', str(settings['port']), '--strictPort', '--outDir', str(current.resolve()),
        ], os.environ.copy())
        lifecycle.ready(f"http://127.0.0.1:{settings['port']}", 'public-client')
        print('Public game:', cfg['auth']['client_origin'])
