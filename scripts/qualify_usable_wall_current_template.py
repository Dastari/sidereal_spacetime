"""Read-only compatibility/locker proof for the exact current native Wayfarer."""
import hashlib
import json
import math
from pathlib import Path
from qualify_usable_wall_combined_mapping import plan, ROOT, MAP, BASE
from qualify_wayfarer_placement_interfaces import shape
from qualify_wayfarer_airlock_inlet import native_parts

CURRENT = ROOT / 'packages/content/src/wayfarer-starter-r001.json'
SHA = '362f37217f63a44a470676f104c8368bd0973ca03f5e29eab190bc4d6df71340'

def qualify():
    document = json.loads(CURRENT.read_text())
    encoded = json.dumps(document, separators=(',', ':'), ensure_ascii=False).encode()
    assert hashlib.sha256(encoded).hexdigest() == SHA
    candidate = plan()
    original = {p['sourcePlacedId']: p for p in json.loads(MAP.read_text())['preserveOriginalPlacements']}
    assembly = {p['id']: p for p in document['layout']['assembly']['parts']}
    floors = {p['id'] for p in document['floors']}
    assert len(assembly) == 211 and len(floors) == 51
    assert set(assembly) | floors == set(original) and not set(assembly) & floors
    for ident, p in assembly.items():
        assert all(value == original[ident]['originalPlacement'][key] for key, value in p.items())
    proof = json.loads((ROOT / 'packages/content/src/wayfarer-walking-proof.json').read_text())
    assert proof['documentSha256'] == SHA
    for path, sha in proof['artifacts'].items():
        assert hashlib.sha256((ROOT / path).read_bytes()).hexdigest() == sha
    bindings = {p['sourcePlacedId']: p for p in candidate['bindings']}
    assert set(bindings) <= set(assembly)
    reports = []
    for side in (-1, 1):
        for y in (-6, -2, 2):
            ident = f'equipment-locker-{side*4.7:g}-{y:g}'
            wall_id = f'wall-{side*2}-{y//2}'
            locker, pin = shape(original[ident])
            wall, wall_pin = shape(original[wall_id])
            assert proof['artifacts'][pin['path']] == pin['sha256']
            assert proof['artifacts'][wall_pin['path']] == wall_pin['sha256']
            old_intersection = (locker ^ wall).volume()
            assert old_intersection > 1e-7
            binding = bindings[wall_id]
            visual = binding['candidateNativeVisual']
            fixed = native_parts(ROOT / visual['path'], visual['nodePrefix'])[0]
            placed = binding['originalPlacement']
            if placed['flipped']: fixed = fixed.scale([-1, 1, 1])
            fixed = fixed.rotate([0, 0, placed['rotation']*180/math.pi]).translate(placed['position'])
            overlap = (locker ^ fixed).volume()
            assert overlap < 1e-10
            assert ident not in bindings
            reports.append({'cabinetSourcePlacedId': ident, 'wallSourcePlacedId': wall_id,
                'cabinetAssetId': original[ident]['assetId'], 'cabinetNativeSource': pin,
                'currentWallNativeSource': wall_pin, 'unchangedCabinetPlacement': assembly[ident],
                'currentIntersectionM3': old_intersection, 'candidateIntersectionM3': overlap,
                'candidateGapM': fixed.min_gap(locker, .1),
                'candidateWallVisual': visual,
                'diagnosis': 'Legacy wall composite consumes declared usable floor; complete locker and floor exports fit their own reserved envelopes. Correct the wall authoring interface, not the cabinet placement.'})
    return {'schema': 'sidereal.usable-wall-current-template-compatibility.v1', 'pass': True,
        'currentDocumentPath': str(CURRENT.relative_to(ROOT)), 'currentDocumentSha256': SHA,
        'currentWalkingProofSha256': hashlib.sha256((ROOT/'packages/content/src/wayfarer-walking-proof.json').read_bytes()).hexdigest(),
        'sourceMappingSha256': candidate['sourceMappingSha256'], 'preservedSourcePlacementCount': 262,
        'nativeAssemblyPlacementCount': 211, 'semanticFloorPlacementCount': 51,
        'replacementMappingPath': str((BASE/'a009/combined-replacement-mapping.json').relative_to(ROOT)),
        'replacementMappingSha256': hashlib.sha256((BASE/'a009/combined-replacement-mapping.json').read_bytes()).hexdigest(),
        'replacementSourcePlacedIds': sorted(bindings), 'sourceTransformsChanged': 0,
        'cabinetFindings': reports, 'installed': False, 'wholeTemplateAdmissible': False,
        'liveMigrationContract': [
            'Server validates exact original canonical SHA, current expected instance revision and authoritative operation ID.',
            'Resolve each of the50 sourcePlacedIds through that instance existing identity mapping; preserve all mapped UUIDs.',
            'Change only qualified structural/armor visual and separately requalified collider bindings. Never copy the full review assembly over live state.',
            'Keep all51 floor IDs, equipment/item/fitting/container UUIDs, inventories, appearance, health and transforms unchanged.',
            'Reject unknown source revisions or mutated frames; this offline report is not a live refit authorization validator.',
            'Full walking/support, finite enclosure, damage binding and installed renderer qualification remain prerequisites.'],
        'scope': 'Current362f source artifact compatibility, not proof of arbitrary edited live instance state or final owner art approval.'}

if __name__ == '__main__':
    result = qualify()
    output = BASE/'a009/current-template-compatibility.json'
    if output.exists(): assert json.loads(output.read_text()) == result
    else: output.write_text(json.dumps(result, indent=2)+'\n')
    print(json.dumps({'pass': result['pass'], 'sha256': SHA, 'cabinetFindings': len(result['cabinetFindings']), 'replacementIds': len(result['replacementSourcePlacedIds'])}))
