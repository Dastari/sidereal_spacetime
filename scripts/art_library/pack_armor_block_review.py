"""Package a new native block kit without changing geometry or live bindings."""
import argparse
from copy import deepcopy
import hashlib
import json
from pathlib import Path
from pack_framed_glb import LibraryPacker


def pack(native, output):
    manifest = json.loads((native / 'models.json').read_text())
    check = json.loads((native / 'native-validation.json').read_text())
    assert check['status'] == 'pass' and check['sourceSha256'] == manifest['sourceSha256']
    strict = json.loads((native / 'validation.json').read_text())
    assert strict['status'] == 'pass' and strict['sourceSha256'] == manifest['sourceSha256']
    assert strict['manifestSha256'] == hashlib.sha256((native / 'models.json').read_bytes()).hexdigest()
    assert hashlib.sha256((native / manifest['source']).read_bytes()).hexdigest() == manifest['sourceSha256']
    library = LibraryPacker('armor-block-kit-r005')
    for model in manifest['models']:
        library.add(native / model['glb'], {**model, 'slug': model['modelId'],
                    'nodePrefix': 'GEO-' + model['modelId'] + '--'})
    raw, rows, parity = library.finish()
    output.mkdir(parents=True, exist_ok=False)
    (output / 'hull.glb').write_bytes(raw)
    digest = hashlib.sha256(raw).hexdigest()
    packed = deepcopy(manifest)
    for model in packed['models']:
        model.update(sourceGlb=model['glb'], sourceSha256=model['sha256'],
                     glb='hull.glb', sha256=digest,
                     nodePrefix='GEO-' + model['modelId'] + '--')
    packed['packaging'] = {'sha256': digest, 'bytes': len(raw),
        'nativeManifestSha256': hashlib.sha256((native / 'models.json').read_bytes()).hexdigest(),
        'strictValidationSha256': hashlib.sha256((native / 'validation.json').read_bytes()).hexdigest(),
        'nativeDirectory': str(native), 'parity': 'exact geometry, hierarchy and material bytes'}
    for name, data in [('models.json', packed), ('parity.json', parity), ('model-source-map.json', rows)]:
        (output / name).write_text(json.dumps(data, indent=2) + '\n')
    print(json.dumps(packed['packaging']))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('native', type=Path)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    pack(args.native.resolve(), args.output.resolve())
