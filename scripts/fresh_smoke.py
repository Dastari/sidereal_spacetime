"""Reserve a new named fixture without resetting any prior shared system."""
import json
from pathlib import Path
import re
from urllib.error import HTTPError
from urllib.request import urlopen


def database_exists(url, database):
    try:
        with urlopen(url + '/v1/database/' + database + '/identity', timeout=10) as response:
            if response.status != 200:
                raise RuntimeError('Unexpected database lookup response')
            return True
    except HTTPError as error:
        if error.code == 404:
            return False
        raise RuntimeError('Could not establish an unused smoke database') from error


def reserve(lifecycle, label, exists=database_exists, attempts=256):
    if not re.fullmatch(r'[a-z0-9][a-z0-9-]{0,31}', label or ''):
        raise ValueError('Fresh smoke requires a lowercase label of at most32 characters')
    if not isinstance(attempts, int) or not 1 <= attempts <= 256:
        raise ValueError('Fresh fixture allocation is bounded to256 attempts')
    parent = lifecycle.STATE / 'smoke-runs'
    parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    if parent.is_symlink():
        raise ValueError('Smoke evidence root must not be a symlink')
    for ordinal in range(1, attempts + 1):
        slug = f'{label}-r{ordinal:04d}'
        database = lifecycle.CFG['project']['database'] + '-' + slug + '-smoke'
        folder = parent / database
        try:
            folder.mkdir(mode=0o700)
        except FileExistsError:
            continue
        # The directory is an atomic local reservation across concurrent runs.
        # The host lookup also protects an existing database after .runtime loss.
        occupied = exists(lifecycle.DB_URL, database)
        record = {'database': database, 'smokeName': slug,
                  'state': 'already-exists' if occupied else 'reserved',
                  'reset': False}
        path = folder / 'reservation.json'
        with path.open('x') as stream:
            json.dump(record, stream)
        path.chmod(0o600)
        if not occupied:
            return {**record, 'evidenceDirectory': str(folder)}
    raise RuntimeError('No unused smoke fixture within bounded allocation; choose another label')


def evidence_directory(lifecycle, database):
    prefix = lifecycle.CFG['project']['database'] + '-'
    if not database.startswith(prefix) or not database.endswith('-smoke'):
        raise ValueError('Evidence must belong to an isolated project smoke database')
    folder = lifecycle.STATE / 'smoke-runs' / database
    if not folder.is_dir():
        return None
    if folder.is_symlink():
        raise ValueError('Smoke evidence directory must not be a symlink')
    record = json.loads((folder / 'reservation.json').read_text())
    if record.get('database') != database or record.get('state') != 'reserved':
        raise ValueError('Smoke reservation does not match the restart database')
    return str(folder)
