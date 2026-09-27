"""Validate exact paired handheld/aim-space publication independently of art approval."""
import json
import struct
from publish_pose_runtime import ROOT, OUT, SOURCE, PUBLICATION, PINNED, NATIVE, ITEMS, digest, read

receipt = read(PUBLICATION / 'publication.json')
assert receipt['runtimeRoot'] == str(OUT.relative_to(ROOT))
assert receipt['authorization']['ownerQuote'] and receipt['authorization']['messageReference']
assert receipt['ownerFinalSignoff'] is None
assert {str(p.relative_to(OUT)) for p in OUT.rglob('*') if p.is_file()} == set(PINNED)
for name, expected in PINNED.items():
    assert digest(OUT / name) == digest(SOURCE / name) == receipt['files'][name]['sha256'] == expected, name
for name, expected in NATIVE.items():
    assert digest(SOURCE / name) == expected, name
for name, expected in receipt['validationInputs'].items():
    assert digest(SOURCE / name) == expected, name
snapshot = ROOT / receipt['rollback']['canonicalSnapshot']
assert digest(snapshot) == receipt['rollback']['canonicalSnapshotSha256']
canonical = read(snapshot)
for name, expected in canonical.items():
    assert digest(ROOT / name) == expected, name
metadata = read(OUT / 'profile-socket-metadata.json')
assert set(metadata['items']) == set(ITEMS)
for name in ITEMS:
    raw = (OUT / 'equipment' / (name + '.glb')).read_bytes()
    assert raw[:4] == b'glTF' and struct.unpack_from('<I', raw, 4)[0] == 2
    size = struct.unpack_from('<I', raw, 12)[0]
    gltf = json.loads(raw[20:20 + size])
    assert gltf['meshes'] and gltf['materials']
    assert not any('uri' in buffer for buffer in gltf['buffers']), name
    assert metadata['items'][name]['assetId'] == name
assert not (OUT / 'crew-poses.glb').exists()
print(json.dumps({'pairedRuntimeRevision': 'r002', 'pairedEquipment': len(ITEMS),
                  'publishedFiles': len(PINNED), 'sourceAndDeliveryHashes': 'pass',
                  'canonicalFilesPreserved': len(canonical), 'nativeSourcesPreserved': len(NATIVE),
                  'normalCrew': 'r008 modular crew; original pose crew GLB not published',
                  'ownerFinalSignoff': None}))
