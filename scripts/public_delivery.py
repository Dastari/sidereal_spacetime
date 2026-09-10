"""Independent immutable static-delivery releases; never rebuild app/world."""
from pathlib import Path
import hashlib
import json
import os
import shutil
import time

FILES = ('glb_delivery.mjs', 'public_client_preview.mjs')


def read(path):
    return json.loads(path.read_text()) if path.is_file() else None


def digest(folder):
    h = hashlib.sha256()
    for name in FILES:
        path = folder / name
        if path.is_symlink() or not path.is_file():
            raise RuntimeError('Delivery artifact must contain regular files')
        h.update(name.encode() + b'\0' + hashlib.sha256(path.read_bytes()).digest())
    return h.hexdigest()


def verify(home, record):
    if record is None:
        return None
    folder = Path(record['release'])
    if folder.is_symlink() or folder.resolve().parent != (home / 'delivery-releases').resolve() or digest(folder) != record['sha256']:
        raise RuntimeError('Delivery artifact failed verification')
    return folder


def launch_options(root, cfg):
    home = root / '.runtime/public-client'
    folder = verify(home, read(home / 'delivery.json'))
    if folder is None:
        return 'apps/client/vite.config.ts', os.environ.copy()
    env = os.environ.copy()
    env.update({
        'SIDEREAL_PUBLIC_ROOT': str((home / 'current').resolve()),
        'SIDEREAL_PUBLIC_DATABASE_URL': f"http://{cfg['server']['host']}:{cfg['server']['port']}",
        'SIDEREAL_PUBLIC_ALLOWED_HOSTS': json.dumps(cfg['client']['allowed_hosts']),
    })
    return str(folder / 'public_client_preview.mjs'), env


def command(action, root, cfg, lifecycle, validate_build, start):
    # Called while public_client's publication lock is held.
    home = root / '.runtime/public-client'
    active = read(home / 'delivery.json')
    verify(home, active)
    live = read(home / 'release.json')
    current = home / 'current'
    if not live or current.resolve() != Path(live['release']).resolve() or validate_build(current.resolve()) != live['sha256']:
        raise RuntimeError('Current client artifact failed verification')
    if action == 'delivery-stage':
        sha = digest(root / 'scripts')
        folder = home / 'delivery-releases' / (time.strftime('%Y%m%d-%H%M%S') + '-' + sha[:12])
        folder.mkdir(parents=True, exist_ok=False)
        for name in FILES:
            shutil.copyfile(root / 'scripts' / name, folder / name)
        if digest(folder) != sha:
            raise RuntimeError('Delivery copy failed verification')
        staged = {'sha256': sha, 'release': str(folder), 'clientSha256': live['sha256'], 'previous': active}
        (home / 'delivery-staged.json').write_text(json.dumps(staged, indent=2))
        print('Delivery staged:', sha, 'client unchanged:', live['sha256'])
        return
    if action == 'delivery-activate':
        selected = read(home / 'delivery-staged.json')
        if not selected or selected['clientSha256'] != live['sha256'] or selected['previous'] != active:
            raise RuntimeError('Client or delivery changed since staging; reconcile before activation')
        verify(home, selected)
    elif action == 'delivery-rollback':
        if active is None:
            raise RuntimeError('No active delivery release to roll back')
        selected = active['previous']
        verify(home, selected)
    else:
        raise RuntimeError('Unknown delivery action')
    # Validated before stopping only this frontend. The database is untouched.
    lifecycle.down('public-client')
    record_path = home / 'delivery.json'
    def install(record):
        if record is None:
            record_path.unlink(missing_ok=True)
        else:
            pending = home / 'delivery-next.json'
            pending.write_text(json.dumps(record, indent=2))
            pending.replace(record_path)
    install(selected)
    try:
        start()
    except Exception:
        lifecycle.down('public-client')
        install(active)
        start()
        raise
    print('Delivery active:', selected['sha256'] if selected else 'original Vite delivery', 'client unchanged:', live['sha256'])
