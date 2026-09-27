"""Pinned retained-cockpit visual fixture; pure reads, no publication or writes.

Preserve each imported mesh's world matrix and optical materials before applying
the placement transform. This fixture is not a new 250 mm inward-wall family.
"""
import hashlib
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CATALOG = 'assets/runtime/assembly/catalog.json'
ASSEMBLY = 'assets/runtime/assembly/wayfarer.json'
SOURCE_PINS = {
    CATALOG: 'f92e1e487106794b188bcb4e5a3e2f0cada7047b81ddfc0ee8bd9434964063ac',
    ASSEMBLY: '1f723510ac156089903fbd0d711a2f6adff1da35433e2ac02afde94fa4a00deb',
}

# Stable placement ID, asset ID, authored origin, authored yaw. None are mirrored.
PLACEMENTS = [
    ('floor-square-00', 'part-a3f5c1c3caa171a94d6c', [-3, 9, 0], 0),
    ('floor-square-01', 'part-a3f5c1c3caa171a94d6c', [-1, 9, 0], 0),
    ('floor-square-02', 'part-a3f5c1c3caa171a94d6c', [1, 9, 0], 0),
    ('floor-square-03', 'part-a3f5c1c3caa171a94d6c', [-1, 11, 0], 0),
    ('floor-corner45-05', 'part-771cc318e835d7a08abd', [1, 11, 0], 0),
    ('floor-corner45-06', 'part-771cc318e835d7a08abd', [-1, 11, 0], math.pi / 2),
    ('hull-straight-07', 'part-4c25a5fd9da0bce537f5', [3, 9, .1875], math.pi / 2),
    ('canopy-side-08', 'part-48cf8b9cf29d0b226ec4', [3, 9, 1.3125], math.pi / 2),
    ('hull-straight-09', 'part-4c25a5fd9da0bce537f5', [-3, 11, .1875], -math.pi / 2),
    ('canopy-side-left-10', 'part-624989ddf1192dceee75', [-3, 11, 1.3125], -math.pi / 2),
    ('hull-diagonal45-11', 'part-540c83fc49ee792d9a4a', [3, 11, .1875], math.pi / 2),
    ('canopy-diagonal45-12', 'part-b70713e9836547941e3f', [3, 11, 1.3125], math.pi / 2),
    ('hull-diagonal45-13', 'part-540c83fc49ee792d9a4a', [-1, 13, .1875], math.pi),
    ('canopy-diagonal45-14', 'part-b70713e9836547941e3f', [-1, 13, 1.3125], math.pi),
    ('bow-transom-15', 'part-ecd751f76e602db806a3', [1, 13, .1875], math.pi),
    ('canopy-nose-16', 'part-4a1d28344c5ee632b249', [1, 13, 1.3125], math.pi),
    ('pilot-roof-25', 'part-1d133c308abd8b172d95', [-3, 9, 2.625], 0),
]


def require(condition, message):
    if not condition:
        raise ValueError(message)


def build_cockpit(output: Path) -> dict:
    """Return manifest data and copy instructions, validating exact retained inputs.

    Copy targets are relative to output. No directories or files are created.
    Catalog bytes pin asset SHA, selectors, measured bounds and source URLs.
    """
    output = Path(output).resolve()
    require(not output.exists() or output.is_dir(), 'Output must be a directory')
    source_pins = dict(SOURCE_PINS)
    documents = {}
    for path, expected in SOURCE_PINS.items():
        data = (ROOT / path).read_bytes()
        require(hashlib.sha256(data).hexdigest() == expected, 'Source pin mismatch: ' + path)
        documents[path] = json.loads(data)
    assets = {a['id']: a for a in documents[CATALOG]['assets']}
    source_placements = {p['id']: p for p in documents[ASSEMBLY]['parts']}
    placements, pins, copies = [], {}, {}
    for suffix, asset_id, origin, yaw in PLACEMENTS:
        placed_id = 'pilot-r004-' + suffix
        p = source_placements[placed_id]
        require(p['assetId'] == asset_id and p['position'] == origin
                and p['rotation'] == yaw and p['flipped'] is False
                and p['removedCells'] == [], 'Retained placement changed: ' + placed_id)
        asset = assets[asset_id]
        visual = asset['visual']
        require(visual['url'].startswith('/assets/assembly/'), 'Unexpected asset URL')
        source = visual['url'].replace('/assets/assembly/', 'assets/runtime/assembly/', 1)
        actual = hashlib.sha256((ROOT / source).read_bytes()).hexdigest()
        require(actual == visual['sha256'], 'Native GLB pin mismatch: ' + source)
        source_pins[source] = actual
        # Shared floor and roof libraries copied once, preserving native selectors.
        target = ('native/cockpit/floor-kit.glb' if asset['category'] == 'floor' else
                  'native/cockpit/roof-kit.glb' if asset['category'] == 'roof' else
                  'native/cockpit/' + asset_id + '.glb')
        require(target not in pins or pins[target] == actual, 'Conflicting copy target')
        pins[target] = actual
        copies[target] = {'source': source, 'target': target}
        placement = {'path': target, 'originM': origin.copy(), 'yawRadians': yaw,
                     'role': asset['category']}
        if visual.get('nodePrefix'):
            placement['prefix'] = visual['nodePrefix']
        placements.append(placement)
    roof = assets['part-1d133c308abd8b172d95']['visual']
    require(roof['bounds']['min'][2] == 0
            and roof['bounds']['max'][2] == 0.28999999165534973,
            'Retained measured roof bounds changed')
    fixture = {
        'id': 'retained-cockpit-five-spans',
        'footprintUnits': [[-96, 288], [96, 288], [96, 352], [32, 416], [-32, 416], [-96, 352]],
        'supportedHeights': [4], 'placements': {'4': placements},
        'heightLabel': 'Retained cockpit', 'displayHeightM': 2.695,
        'roofUndersideM': 2.625,
        'roofTopM': 2.625 + roof['bounds']['max'][2],
        'notes': [
            'Exact retained legacy cockpit: six native floors, ten sill/glazing pieces and one roof. Rear edge is open; pressure, new collision and damage qualification are unsupported.',
            'Legacy sill/glazing/roof dimensions are preserved. This is not 250 mm inward-family qualification and is not resized to the new 3 m clear height. No generated opaque walls cover glazing.',
            'The two diagonal bow triangles remain structural backing and are intended nonwalkable reservations; this gallery does not implement navigation authority. Reservation edges do not create walls.',
            'Roof toggle controls the native pilot roof only. Collars and vestibule context are intentionally absent from this minimal fixture. No live pins or template state are changed.',
        ],
    }
    return {'fixture': fixture, 'pins': pins, 'sourcePins': source_pins,
            'copies': [copies[key] for key in sorted(copies)]}
