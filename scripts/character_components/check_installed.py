"""Runtime publication must match its exact editable source and revision lineage."""
from pathlib import Path
import json
import re
import struct
import sys

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT / "scripts") not in sys.path:
    sys.path.insert(0, str(ROOT / "scripts"))
from character_components.publication_validation import digest, read, require, path_under, validate_r009


def require_component_node(nodes, component_id):
    """Stable metadata owns identity; Blender may suffix an exported mesh name."""
    matches = [node for node in nodes if node.get('extras', {}).get('component_id') == component_id]
    require(len(matches) == 1 and 'mesh' in matches[0], f'Missing/duplicate component mesh: {component_id}')
    node = matches[0]
    require(re.fullmatch(r'GEO-' + re.escape(component_id) + r'(?:\.[0-9]{3,})?', node.get('name', '')) is not None,
            f'Component mesh name/metadata mismatch: {component_id}')
    return node


def validate(root=ROOT):
    out = root / 'assets/runtime/crew/components'
    manifest = read(out / 'manifest.json')
    catalog = read(root / 'packages/content/src/character-components.json')
    require(manifest['revision'] == catalog['revision'] and manifest['revision'] >= 2, 'Installed/catalog revision mismatch')
    require(manifest['revision'] == 2 or manifest.get('publication'), 'Later visual revisions require an explicit publication receipt')
    for name, expected in manifest['files'].items():
        require(digest(path_under(root, 'assets/runtime/crew/components/' + name)) == expected, name)
    source = path_under(root, manifest['blenderSource'])
    require(digest(source) == manifest['sourceSha256'], 'Editable source changed')
    raw = (out / 'modular-crew.glb').read_bytes()
    require(raw[:4] == b'glTF' and struct.unpack_from('<II', raw, 4) == (2, len(raw)), 'Invalid combined GLB')
    size, kind = struct.unpack_from('<II', raw, 12)
    require(kind == 0x4E4F534A and 20 + size <= len(raw), 'Invalid combined GLB JSON')
    gltf = json.loads(raw[20:20 + size])
    require(len(gltf['skins'][0]['joints']) == 16 and len(gltf['animations']) == 12, 'Shared rig/clip count changed')
    names = {node['name'] for node in gltf['nodes']}
    for component in catalog['components']:
        require_component_node(gltf['nodes'], component['id'])
        require((out / (component['id'] + '.png')).read_bytes()[:8] == b'\x89PNG\r\n\x1a\n', component['id'])
    for body in ['male', 'female']:
        require('GEO-base-' + body + '-modesty' in names, 'Missing modesty base')
    require(all('JOINTS_0' in primitive['attributes'] and 'WEIGHTS_0' in primitive['attributes']
                for mesh in gltf['meshes'] for primitive in mesh['primitives']), 'Unweighted character mesh')
    if publication_path := manifest.get('publication'):
        receipt = read(path_under(root, publication_path))
        require(receipt['revision'] == manifest['revision'], 'Publication revision mismatch')
        require(receipt['sourceSha256'] == manifest['sourceSha256'], 'Publication source mismatch')
        require(receipt['runtimeSha256'] == manifest['files']['modular-crew.glb'], 'Publication runtime mismatch')
        require(receipt['authorization']['ownerQuote'] and receipt['authorization']['messageReference'], 'Missing publication authorization')
        require(manifest['componentRevisions'] == catalog['visualRevisions'] and len(manifest['componentRevisions']) == 100,
                'Component revision accounting mismatch')
        if receipt['schema'] == 'sidereal.character-visual-publication.v2':
            validate_r009(root, manifest, catalog, receipt)
        else:
            # Preserve the exact historical v1 rollback evidence requirements.
            require(receipt['schema'] == 'sidereal.character-visual-publication.v1', 'Unknown publication schema')
            for name, evidence in receipt['files'].items():
                require(manifest['files'][name] == evidence['sha256'] == digest(path_under(root, evidence['source'])), name)
            for name, expected in receipt['unchangedRuntimeFiles'].items():
                require(manifest['files'][name] == expected, name)
            rollback = path_under(root, receipt['rollback'])
            require(digest(rollback / 'manifest.json') == receipt['rollbackManifestSha256'], 'Rollback manifest changed')
            require(digest(rollback / 'character-components.json') == receipt['rollbackCatalogSha256'], 'Rollback catalog changed')
            previous = read(rollback / 'character-components.json')
            require(all(catalog[key] == previous[key] for key in ['rigId', 'bodyTypes', 'hairStyles', 'sets']), 'Existing catalog contract changed')
            without_bounds = lambda rows: [{key: value for key, value in row.items() if key != 'boundsMeters'} for row in rows]
            require(without_bounds(catalog['components']) == without_bounds(previous['components']), 'Existing item contract changed')
            for name, evidence in receipt['files'].items():
                require(digest(rollback / name) == evidence['previousSha256'], name)
        require({key for key, value in catalog['visualRevisions'].items() if value == receipt['revision']} == set(receipt['installedComponents']),
                'Installed component revision scope mismatch')
        require('medic-open-comms' not in {row['id'] for row in catalog['components']}, 'Draft equipment unexpectedly issued')
    return {'installedRevision': manifest['revision'], 'modularCharacterComponents': len(catalog['components']),
            'bodyTypes': 2, 'hairStyles': 8, 'editableSourceAndPublicationHashes': 'pass', 'rigBones': 16, 'animations': 12}


if __name__ == '__main__':
    print(json.dumps(validate()))
