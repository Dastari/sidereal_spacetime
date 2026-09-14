"""Lossless review library for one validated native armor attempt.

Reuse the byte-parity packer; do not install assets or change any live pins.
Shared maps/materials reduce duplicate GPU resources across independent parts.
"""
import argparse
from copy import deepcopy
import hashlib
import json
from pathlib import Path

from check_armor_cassette_hull import check
from pack_framed_glb import LibraryPacker


def pack(native, output):
    validation = check(native)
    manifest = json.loads((native / 'models.json').read_text())
    library = LibraryPacker('armor-cassette')
    for row in manifest['models']:
        library.add(native / row['path'], row)
    raw, rows, parity = library.finish()
    output.mkdir(parents=True, exist_ok=False)
    (output / 'hull.glb').write_bytes(raw)
    digest = hashlib.sha256(raw).hexdigest()
    packed_manifest = deepcopy(manifest)
    packed_manifest['models'] = [{**row, 'path': 'hull.glb', 'sha256': digest,
                                  'sourcePath': row['path'], 'sourceSha256': row['sha256']}
                                 for row in manifest['models']]
    packed_manifest['sourceDirectory'] = str(native)
    packed_manifest['packaging'] = {'kind': 'lossless shared library', 'sha256': digest,
                                     'bytes': len(raw), 'nativeValidation': validation['status'],
                                     'nativeManifestSha256': hashlib.sha256((native / 'models.json').read_bytes()).hexdigest()}
    (output / 'models.json').write_text(json.dumps(packed_manifest, indent=2) + '\n')
    (output / 'parity.json').write_text(json.dumps(parity, indent=2) + '\n')
    (output / 'model-source-map.json').write_text(json.dumps(rows, indent=2) + '\n')
    print(json.dumps(packed_manifest['packaging']))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('native', type=Path)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    pack(args.native.resolve(), args.output.resolve())
