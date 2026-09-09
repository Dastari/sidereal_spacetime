"""Publish exact pinned module bytes only to a named isolated review database."""
import hashlib
from pathlib import Path
import re


def publish(lifecycle, suffix, artifact, expected_sha256):
    if not re.fullmatch(r'[a-z0-9][a-z0-9-]{0,39}', suffix or ''):
        raise ValueError('Named isolated review suffix required')
    if not re.fullmatch(r'[0-9a-f]{64}', expected_sha256 or ''):
        raise ValueError('Exact artifact SHA-256 required')
    source = Path(artifact)
    if source.is_symlink() or not source.is_file() or source.stat().st_size > 100 * 1024 * 1024:
        raise ValueError('Regular bounded module artifact required')
    data = source.read_bytes()
    if hashlib.sha256(data).hexdigest() != expected_sha256:
        raise ValueError('Module artifact hash mismatch')
    wasm = data.startswith(b'\x00asm')
    if not wasm:
        data.decode('utf8')
    directory = lifecycle.ROOT / '.runtime/review-modules'
    directory.mkdir(mode=0o700, parents=True, exist_ok=True)
    target = directory / (expected_sha256 + ('.wasm' if wasm else '.js'))
    if target.exists():
        if target.is_symlink() or target.read_bytes() != data:
            raise ValueError('Pinned staging file differs')
    else:
        with target.open('xb') as stream:
            stream.write(data)
        target.chmod(0o600)
    database = lifecycle.CFG['project']['database'] + '-review-' + suffix
    lifecycle.require_development()
    lifecycle.cli('publish', database, '--server', lifecycle.DB_URL,
                  '--bin-path' if wasm else '--js-path', str(target),
                  '--yes', '--no-config', '--delete-data=never')
    return {'database': database, 'artifactSha256': expected_sha256, 'reset': False}
