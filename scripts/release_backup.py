"""Private cold recovery archive; only the managed database is interrupted."""
import hashlib
import json
import os
import shutil
import tarfile
import time


BACKUP_RESERVE_BYTES = 4 * 1024 ** 3


def require_backup_space(directory):
    if shutil.disk_usage(directory).free < BACKUP_RESERVE_BYTES:
        raise RuntimeError('Cold backup reached its free-space safety reserve')


class BoundedArchiveWriter:
    """Monitor actual free blocks, including on compressed/sparse filesystems."""
    def __init__(self, stream, directory):
        self.stream, self.directory, self.written = stream, directory, 0

    def write(self, value):
        if self.written >= 4 * 1024 ** 2:
            require_backup_space(self.directory)
            self.written = 0
        self.written += len(value)
        return self.stream.write(value)

    def __getattr__(self, name):
        return getattr(self.stream, name)


def backup_database(lifecycle):
    previous = lifecycle.load().get('database')
    if not previous or not lifecycle.alive(previous):
        raise RuntimeError('A managed running database is required for cold backup.')
    root = lifecycle.ROOT
    destination = lifecycle.STATE / ('recovery-' + time.strftime('%Y%m%d-%H%M%S') + '.tar')
    require_backup_space(lifecycle.STATE)
    # O_EXCL plus 0600 protects keys even during archive creation.
    descriptor = os.open(destination, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    started = time.monotonic()
    complete = False
    try:
        lifecycle.down('database')
        with os.fdopen(descriptor, 'wb') as stream:
            descriptor = None
            with tarfile.open(fileobj=BoundedArchiveWriter(stream, lifecycle.STATE), mode='w') as archive:
                archive.add(root / '.spacetime-data', arcname='database')
                archive.add(root / '.tools/spacetime/config', arcname='cli-config')
                archive.add(root / 'dev.toml', arcname='dev.toml')
                archive.add(root / '.runtime/public-client/release.json', arcname='public-client-release.json')
            stream.flush()
            os.fsync(stream.fileno())
        complete = True
    finally:
        if descriptor is not None:
            os.close(descriptor)
        # Free any partial allocation before restarting the writer. A failed
        # attempt must not consume the reserve needed by the live database.
        if not complete:
            destination.unlink(missing_ok=True)
        lifecycle.database_up(publish_module=False)
    outage = time.monotonic() - started
    with destination.open('rb') as stream:
        digest = hashlib.file_digest(stream, 'sha256').hexdigest()
    with tarfile.open(destination, 'r:') as archive:
        members = archive.getmembers()
    metadata = {'archive': str(destination), 'sha256': digest, 'bytes': destination.stat().st_size,
                'members': len(members), 'databaseInterruptionSeconds': round(outage, 3),
                'modulePublished': False, 'restoreTested': False}
    record = destination.with_suffix('.json')
    record.write_text(json.dumps(metadata, indent=2))
    record.chmod(0o600)
    print(json.dumps(metadata))
