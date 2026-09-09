"""Lossless cold-archive compaction, independent of running services.

Replacement removes only the raw representation after exact decompressed-byte
verification, safe recovery member validation and a durable private manifest.
"""
import argparse
import gzip
import hashlib
import json
import os
from pathlib import Path
import shutil
import tarfile
import time

from restore_review import validate_members

GIB = 1024 ** 3


def compress_archive(archive, expected_sha256, *, max_output_bytes=8 * GIB,
                     reserve_bytes=4 * GIB, replace=False):
    source = Path(archive).absolute()
    if source.is_symlink() or not source.is_file() or source.suffix != '.tar':
        raise RuntimeError('Regular raw .tar recovery archive required')
    if len(expected_sha256) != 64 or max_output_bytes <= 0 or reserve_bytes < 0:
        raise RuntimeError('Exact SHA256 and bounded compression budget required')
    destination = source.with_suffix('.tar.gz')
    manifest = destination.with_suffix('.gz.json')
    if destination.exists() or manifest.exists():
        raise RuntimeError('Never overwrite a recovery artifact or manifest')
    original = source.stat()
    if shutil.disk_usage(source.parent).free < reserve_bytes:
        raise RuntimeError('Insufficient free-space reserve')
    started = time.monotonic()
    descriptor = os.open(destination, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    created_manifest = False
    try:
        digest = hashlib.sha256()
        with os.fdopen(descriptor, 'wb') as output, source.open('rb') as input_stream:
            with gzip.GzipFile(filename='', mode='wb', fileobj=output,
                               compresslevel=1, mtime=0) as compressed:
                while chunk := input_stream.read(1024 * 1024):
                    digest.update(chunk)
                    compressed.write(chunk)
                    if output.tell() > max_output_bytes:
                        raise RuntimeError('Compression output budget exceeded')
                    if shutil.disk_usage(source.parent).free < reserve_bytes:
                        raise RuntimeError('Free-space reserve reached')
            output.flush()
            os.fsync(output.fileno())
        if digest.hexdigest() != expected_sha256:
            raise RuntimeError('Original archive SHA256 mismatch')
        if destination.stat().st_size > max_output_bytes:
            raise RuntimeError('Compression output budget exceeded')
        with gzip.open(destination, 'rb') as verified:
            recovered = hashlib.file_digest(verified, 'sha256').hexdigest()
        if recovered != expected_sha256:
            raise RuntimeError('Decompressed archive SHA256 mismatch')
        with tarfile.open(destination, 'r:gz') as verified:
            members = verified.getmembers()
            logical_bytes = validate_members(members)
        with destination.open('rb') as verified:
            compressed_sha = hashlib.file_digest(verified, 'sha256').hexdigest()
        current = source.stat()
        if (current.st_ino, current.st_size, current.st_mtime_ns) != (
                original.st_ino, original.st_size, original.st_mtime_ns):
            raise RuntimeError('Source archive changed during verification')
        record = {'sourceArchive': str(source), 'sourceSha256': expected_sha256,
                  'sourceBytes': original.st_size, 'archive': str(destination),
                  'sha256': compressed_sha, 'bytes': destination.stat().st_size,
                  'decompressedSha256': recovered, 'members': len(members),
                  'regularFileBytes': logical_bytes, 'losslessVerified': True,
                  'rawReplacementAuthorized': replace,
                  'seconds': round(time.monotonic() - started, 3),
                  'liveDatabaseChanged': False}
        fd = os.open(manifest, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        created_manifest = True
        with os.fdopen(fd, 'w') as output:
            json.dump(record, output, indent=2)
            output.write('\n')
            output.flush()
            os.fsync(output.fileno())
        directory = os.open(source.parent, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(directory)
            if replace:
                source.unlink()
                os.fsync(directory)
        finally:
            os.close(directory)
        return record
    except BaseException:
        # Before replacement, source remains authoritative and untouched. After
        # unlink, never delete the sole verified compressed recovery artifact.
        if source.exists():
            destination.unlink(missing_ok=True)
            if created_manifest:
                manifest.unlink(missing_ok=True)
        raise


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--archive', required=True)
    parser.add_argument('--expected-sha256', required=True)
    parser.add_argument('--replace-verified-raw', action='store_true')
    parser.add_argument('--max-output-gib', type=int, default=8)
    args = parser.parse_args()
    print(json.dumps(compress_archive(args.archive, args.expected_sha256,
                                     replace=args.replace_verified_raw,
                                     max_output_bytes=args.max_output_gib * GIB)))
