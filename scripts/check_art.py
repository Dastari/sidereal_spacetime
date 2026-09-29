"""Validate published runtime art: GLB containers, declared hashes and pinned provenance.

Covers what the game and dashboard load today:
- every GLB under a published `assets/runtime` entry (scripts/prepare_app.py PUBLISHED_RUNTIME)
  is a well-formed glTF 2.0 binary with finite position bounds;
- baked materials and the asteroid;
- inventory UI icons and their preserved equipment source;
- SHIPS-COMPONENTS / ship-objects runtime GLBs (scripts/art_library/check_ship_components.py).
Runs in CI (`npm run art:check`). The retired voxel/assembly pipelines are no longer checked here.
"""
from pathlib import Path
import hashlib
import json
import math
import runpy
import struct
import sys

ROOT = Path(__file__).resolve().parents[1]
RUNTIME = ROOT / 'assets/runtime'
sys.path.insert(0, str(ROOT / 'scripts'))
from prepare_app import PUBLISHED_RUNTIME  # noqa: E402


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def glb(path):
    """Parse the JSON chunk of a glTF binary, rejecting truncated or foreign files."""
    with path.open('rb') as stream:
        header = stream.read(20)
        assert len(header) == 20, f'Truncated GLB: {path}'
        magic, version, size, length, kind = struct.unpack('<IIIII', header)
        assert magic == 0x46546C67 and version == 2, f'Not a glTF 2.0 binary: {path}'
        assert size == path.stat().st_size, f'GLB length mismatch: {path}'
        assert kind == 0x4E4F534A, f'GLB without a leading JSON chunk: {path}'
        return json.loads(stream.read(length))


def published_glbs():
    for entry in PUBLISHED_RUNTIME:
        path = RUNTIME / entry
        if path.is_file():
            if path.suffix == '.glb':
                yield path
        else:
            yield from sorted(path.rglob('*.glb'))


checked = 0
for path in published_glbs():
    gltf = glb(path)
    for accessor in gltf.get('accessors', []):
        for key in ('min', 'max'):
            assert all(math.isfinite(v) for v in accessor.get(key, [])), f'Non-finite accessor bounds: {path}'
    checked += 1
assert checked > 0
print(json.dumps({'published_glbs': checked, 'containers': 'passed'}))

materials = json.loads((RUNTIME / 'materials/manifest.json').read_text())
for file, digest in materials['outputs'].items():
    assert sha(RUNTIME / 'materials' / file) == digest, f'Asset hash changed: materials/{file}'
rock = glb(RUNTIME / 'voxels/asteroid.glb')
assert rock['meshes']
print(json.dumps({'materials': len(materials['outputs']), 'asteroid_meshes': len(rock['meshes']), 'hashes': 'passed'}))

# Inventory UI icons are CPU renders of preserved original equipment sources.
icons_root = RUNTIME / 'equipment/icons'
icons = json.loads((icons_root / 'manifest.json').read_text())
assert sha(ROOT / icons['source']) == icons['sourceSha256']
assert sha(ROOT / icons['generator']) == icons['generatorSha256']
assert len(icons['entries']) == 11 and icons['iconBytes'] < 1024 * 1024
for entry in icons['entries']:
    raw = (icons_root / entry['file']).read_bytes()
    assert hashlib.sha256(raw).hexdigest() == entry['sha256'], entry['file']
    assert raw[:8] == b'\x89PNG\r\n\x1a\n' and raw[12:16] == b'IHDR'
    assert struct.unpack('>II', raw[16:24]) == (256, 256) and raw[24:26] == bytes([8, 6]), entry['file']
    assert len(raw) == entry['bytes'] and all(6 <= c <= 250 for c in entry['boundsPixels'])
assert sum(entry['bytes'] for entry in icons['entries']) == icons['iconBytes']
assert sha(icons_root / icons['contactSheet']) == icons['contactSheetSha256']
print(json.dumps({'inventory_icons': len(icons['entries']), 'icon_bytes': icons['iconBytes'],
                  'preserved_source_and_rgba_provenance': 'passed'}))

# Published SHIPS-COMPONENTS runtime GLBs: prefab coverage, fixed slots and preserved .blend source.
runpy.run_path(str(ROOT / 'scripts/art_library/check_ship_components.py'), run_name='__main__')
