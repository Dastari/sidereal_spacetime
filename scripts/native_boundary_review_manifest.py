"""Read-only manifest for exact delivered native boundary review fixtures.

build_manifest(output) takes the directory containing the eventual gallery JSON.
It returns data only: no directories, artifacts, catalogs or live state are written.
Asset paths are relative to output; sourcePins keys are repository-relative paths.
The caller must preserve imported node world matrices before applying placement.
"""
from pathlib import Path
import hashlib
import json
import math
import os
import struct

ROOT = Path(__file__).resolve().parents[1]
DESIGNS = ROOT / 'assets/art-library/designs'
CONVEX = DESIGNS / 'shipyard.structure.convex-inset-boundary/revisions/r004'
UNION = DESIGNS / 'shipyard.structure.union-junction250/revisions/r001'
INTERNAL = DESIGNS / 'shipyard.structure.internal250/revisions/r000'
WINDOW = DESIGNS / 'shipyard.structure.window250/revisions/r004'
ROOF = DESIGNS / 'shipyard.structure.roof125/revisions/r000'
FLOOR = DESIGNS / 'shipyard.floor.mapped-deck-kit/revisions/r002/glb.glb'
FILLER = DESIGNS / 'shipyard.structure.floor-contact250/revisions/r011'
DOOR = DESIGNS / 'shipyard.structure.doorway250/revisions/r003'
REQUESTS = {
    'corner': ('ship-tileset-corner-spec.v1.json', '3c94dbaba8dfa33c466c23eb83b6b2a10637d27683b8ce055327000e94be2ac4'),
    'union': ('ship-tileset-union-junction-spec.v1.json', '46b06de54bfd81993716e0acea0d840ded94a6bcf45a0cc13a610ba0bddac6c4'),
    'internal': ('ship-tileset-internal-spec.v1.json', 'f8dc612cf7ce856043431d98180a1f00d3cfac17031a2e1ca96e28118496f200'),
    'window': ('ship-tileset-window-spec.v1.json', 'ae9bb7c41779f426c26ec838f6b849f361f80210fd752bfbc2714cbcaafca797'),
}


def require(condition, message):
    if not condition:
        raise ValueError(message)


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def build_manifest(output: Path) -> dict:
    """Build/validate the pinned review data, failing closed on missing or changed sources."""
    output = Path(output).resolve()
    require(not output.exists() or output.is_dir(), 'output must be the gallery output directory')
    pins, source_pins, expected, documents = {}, {}, {}, {}

    def source(path, expected_sha=None):
        path = path.resolve()
        key = path.relative_to(ROOT).as_posix()
        actual = digest(path)
        require(expected_sha is None or actual == expected_sha, f'Source pin mismatch: {key}')
        source_pins[key] = actual
        if path not in documents:
            documents[path] = json.loads(path.read_text())
        return documents[path]

    specs = {key: source(ROOT/'packages/content/src'/name, pin) for key, (name, pin) in REQUESTS.items()}
    floor_ref = specs['corner']['sourceFloorInterfaces']
    floor_interfaces = source(ROOT/floor_ref['path'], floor_ref['sha256'])
    require(floor_interfaces['latticePerMeter'] == 32 and floor_interfaces['datums']['floorTop'] == 6,
            'Unsupported floor coordinate datums')
    floors = {part['id']: part for part in floor_interfaces['parts']}
    require(len(floors) == 12, 'Expected all 12 retained native floor footprints')
    interfaces = {}
    for family, directory in [('corner', CONVEX), ('union', UNION), ('internal', INTERNAL), ('window', WINDOW), ('roof', ROOF)]:
        interfaces[family] = source(directory/'interfaces.json')
        if family in REQUESTS:
            require(interfaces[family]['specSha256'] == REQUESTS[family][1], f'{family} interface request mismatch')
        manifest = source(directory/'delivery-manifest.json')
        files = manifest['files']
        records = files.items() if isinstance(files, dict) else [(entry.get('path', entry.get('file')), entry) for entry in files]
        for name, entry in records:
            require(isinstance(name, str), f'Missing manifest filename: {directory}')
            path = (directory/name).resolve()
            require(path.is_relative_to(directory), f'Manifest path escape: {name}')
            if path.suffix == '.glb':
                expected[path] = entry['sha256']
    require(interfaces['union']['fixtures'] == specs['union']['fixtures'], 'Union delivered fixtures diverge from frozen request')
    for record in specs['union']['sourceRequests']:
        source(ROOT/record['path'], record['sha256'])
    for record in specs['union']['nativeDependencies']:
        path = (ROOT/record['path']).resolve()
        require(digest(path) == record['sha256'], f'Union dependency changed: {record["path"]}')
        require(path not in expected or expected[path] == record['sha256'], f'Conflicting dependency pin: {path}')
        expected[path] = record['sha256']
    # Verify frozen metadata for every floor, including node selection and native transform.
    floor_bytes = FLOOR.read_bytes()
    require(floor_bytes[:4] == b'glTF', 'Retained floor is not a GLB')
    json_length = struct.unpack_from('<I', floor_bytes, 12)[0]
    floor_doc = json.loads(floor_bytes[20:20+json_length])
    floor_sha = hashlib.sha256(floor_bytes).hexdigest()
    for part in floors.values():
        native = part['native']
        require(native['revision'] == 'r002' and native['sha256'] == floor_sha, f'Floor native pin mismatch: {part["id"]}')
        require(native['sourceToNominal'] == {'translation': [0, 0, 0], 'quarterTurns': 0, 'reflected': False},
                f'Unsupported extra floor placement transform: {part["id"]}')
        nodes = [n for n in floor_doc['nodes'] if 'mesh' in n and n.get('name', '').startswith(native['nodePrefix'])]
        require(len(nodes) == 1, f'Ambiguous/missing floor node: {part["id"]}')
    expected[FLOOR] = floor_sha
    filler_audit = source(FILLER/'export-audit.json', '92c2f5a907e7272636a33ef176f1198dbbc818ca767ae2bb3ada37b55a6401a3')
    window_contact = source(FILLER/'window-contact-audit.json', '48fb3582dc75d1605964b962d60796e71d79a0e9700694c13cfc380933f4dcb0')
    require(filler_audit['pass'] and window_contact['pass'], 'Native floor contact audit failed')
    require(filler_audit['distanceToleranceM'] == 1e-6 and window_contact['distanceToleranceM'] == 1e-6, 'Contact allowance changed')
    require(filler_audit['source']['nativeSha256'] == floor_sha, 'Filler base floor changed')
    require(len(filler_audit['profiles']) == 12, 'Missing floor contact shapes')
    for p in filler_audit['profiles']:
        require(p['floorId'] in floors, 'Unknown filler floor shape')
        expected[(FILLER/(p['floorId']+'.glb')).resolve()] = p['glbSha256']

    def placement(path, origin, yaw=0, role='wall', prefix=None):
        path = path.resolve()
        require(path in expected, f'Asset has no delivery pin: {path}')
        require(len(origin) == 3 and all(isinstance(v, (int, float)) and math.isfinite(v) for v in origin), 'Nonfinite origin')
        require(math.isfinite(yaw), 'Nonfinite native yaw')
        relative = Path(os.path.relpath(path, output)).as_posix()
        if relative not in pins:
            actual = digest(path)
            require(actual == expected[path], f'Native delivery pin mismatch: {path}')
            pins[relative] = actual
        result = {'path': relative, 'originM': list(origin), 'yawRadians': yaw, 'role': role}
        if prefix is not None:
            result['prefix'] = prefix
        return result

    def floor_and_roof(part_id, origin, turns=0):
        require(part_id in floors, f'Unknown floor: {part_id}')
        require(turns in floors[part_id]['quarterTurns'], f'Unsupported floor rotation: {part_id}')
        require(len(origin) == 2, 'Floor origins must be XY metres')
        roof = interfaces['roof']['pieces'][part_id]
        require(roof['footprintM'] == [[x/32, y/32] for x, y in floors[part_id]['footprint']], f'Roof/floor silhouette mismatch: {part_id}')
        require(roof['reservationZ'] == [0, .125] and roof['placementUndersideM'] == 3.1875, 'Roof datum changed')
        return [placement(FLOOR, [*origin, 0], turns*math.pi/2, 'floor', floors[part_id]['native']['nodePrefix']),
                placement(FILLER/(part_id+'.glb'), [*origin, 0], turns*math.pi/2, 'floor'),
                placement(ROOF/(part_id+'.glb'), [*origin, 3.1875], turns*math.pi/2, 'roof')]

    def wall(directory, profile, origin, height, yaw=0):
        suffix = f'{profile}-q{height}'
        family = {CONVEX: 'corner', UNION: 'union', INTERNAL: 'internal'}[directory]
        require(suffix in interfaces[family]['pieces'], f'Missing native interface: {suffix}')
        item = interfaces[family]['pieces'][suffix]
        require(item['heightM'] == height*.75 and item['placementFloorTopM'] == .1875, f'Native wall datum mismatch: {suffix}')
        subdir = directory/'profiles' if directory == CONVEX else directory
        return placement(subdir/(suffix+'.glb'), [*origin, .1875], yaw)

    def units(polygon):
        require(len(polygon) >= 3 and all(len(v) == 2 for v in polygon), 'Invalid explicit footprint')
        result = [[x*32, y*32] for x, y in polygon]
        require(all(math.isfinite(v) and abs(v-round(v)) < 1e-9 for point in result for v in point), 'Nonlattice footprint')
        return [[round(v) for v in point] for point in result]

    common = ('Unapproved native study; physical qualification pending. Imported node world matrices must be preserved. '
              'Actual r002 floors include the measured r011 native bevel-contact adapters; physical qualification remains pending. '
              'Roofs remain at standard underside Z3.1875 even for lower quarter-height walls.')
    fixtures = []
    for fixture in specs['corner']['fixtures']:
        require(fixture['footprintUnits'] == floors[fixture['id']]['footprint'], 'Convex fixture/floor footprint mismatch')
        placements = {}
        for height in [1, 2, 3, 4]:
            pieces = floor_and_roof(fixture['id'], [0, 0])
            pieces += [wall(CONVEX, c['profileId'], c['originM'], height) for c in fixture['corners']]
            for span in fixture['spans']:
                tangent = span['tangent']
                require(abs(math.hypot(*tangent)-1) < 1e-12, 'Invalid span tangent')
                pieces.append(wall(CONVEX, span['profileId'], span['originM'], height, math.atan2(tangent[1], tangent[0])))
            placements[str(height)] = pieces
        fixtures.append({'id': 'convex-'+fixture['id'], 'footprintUnits': fixture['footprintUnits'],
                         'supportedHeights': [1, 2, 3, 4], 'placements': placements, 'notes': common})
    families = {'convex-r004': CONVEX, 'internal-r000': INTERNAL, 'new': UNION}
    for fixture in specs['union']['fixtures']:
        placements = {}
        for height in [1, 2, 3, 4]:
            pieces = []
            for floor in fixture['floors']:
                pieces += floor_and_roof(floor['id'], floor['originM'], floor['quarterTurns'])
            for part in fixture['pieces']:
                require(part['family'] in families and part['quarterTurns'] in [0, 1, 2, 3], 'Unknown union family/orientation')
                pieces.append(wall(families[part['family']], part['profileId'], part['originM'], height, part['quarterTurns']*math.pi/2))
            placements[str(height)] = pieces
        fixtures.append({'id': 'union-'+fixture['id'], 'footprintUnits': units(fixture['footprintM']),
                         'supportedHeights': [1, 2, 3, 4], 'placements': placements, 'notes': common})
    request = specs['window']; fixture = request['fixture']; pieces = []
    require(request['placementFloorTopM'] == .1875 and request['standardRoofUndersideM'] == 3.1875, 'Window datum changed')
    for floor in fixture['floorParts']:
        pieces += floor_and_roof(floor['id'], floor['originM'])
    for part in [request['frame'], request['pane']]:
        pieces.append(placement(WINDOW/'profiles'/(part['id']+'.glb'), fixture['windowOriginM']))
    for origin in fixture['companionOriginsM']:
        pieces.append(placement(WINDOW/'profiles/window-companion-span-q4.glb', origin))
    pieces += [wall(CONVEX, c['profileId'], c['originM'], 4) for c in fixture['corners']]
    for span in fixture['remainingSpans']:
        profiles = [p for p in specs['corner']['profiles'] if p.get('lengthM') == span['lengthM']]
        require(len(profiles) == 1, 'Ambiguous window residual span')
        pieces.append(wall(CONVEX, profiles[0]['id'], span['originM'], 4, span['quarterTurns']*math.pi/2))
    fixtures.append({'id': 'window-'+fixture['id'], 'footprintUnits': units(fixture['footprintM']),
                     'supportedHeights': [4], 'placements': {'4': pieces},
                     'notes': common+' Corrected window floor contact passes:2.75m² total and .5m² frame bottom across eight rotated/mirrored native fixtures; shifted-filler controls fail. The preserved no-filler baseline fails2.698128331862888/2.75m². Preserve native alpha glass; no pressure or cockpit qualification.'})
    require(len(fixtures) == 18 and len({f['id'] for f in fixtures}) == 18, 'Unexpected fixture count or duplicate ID')
    door = source(DOOR/'interfaces.json', '8568344c7e20bb2a1e4d5945dfa4953fb31fd043486b6192f7f69e88edc0c788')
    require(door['specSha256'] == 'e276e0d5290ca0fb417cb6519911cf41c37833f2c15d58f6ad076e541b216ef9', 'Door request changed')
    source(ROOT/'packages/content/src/ship-tileset-doorway-spec.v1.json', door['specSha256'])
    require(door['motion']['hingeBindLocalM'] == [.3125, .0625, -.1875] and door['motion']['openDegrees'] == 90, 'Unsupported hinge datums')
    for opened in [False, True]:
        pieces = []
        for p in door['fixture']['placements']:
            path = (ROOT/p['path']).resolve()
            require(path.is_relative_to(DESIGNS), 'Door fixture path outside native library')
            require(path not in expected or expected[path] == p['sha256'], 'Conflicting doorway dependency')
            expected[path] = p['sha256']
            origin, yaw = p['originM'].copy(), p['yawRadians']
            if opened and p['motion'] == 'hinged-leaf':
                require(yaw == 0, 'Unimplemented extra hinge placement rotation')
                h = door['motion']['hingeBindLocalM']
                origin = [origin[0]+h[0]+h[1], origin[1]+h[1]-h[0], origin[2]]
                yaw = math.pi/2
            role = 'roof' if p['role'] == 'roof' else 'floor' if p['role'] in ['floor', 'floor-contact'] else 'wall'
            item = placement(path, origin, yaw, role, p['prefix'])
            if p['role'] == 'gasket':
                item['morph'] = {'name': door['motion']['gasketMorph'], 'value': 1 if opened else 0}
            pieces.append(item)
        fixtures.append({'id': 'doorway-'+('open-retracted' if opened else 'closed-deployed'),
                         'footprintUnits': units(door['fixture']['footprintM']), 'supportedHeights': [4],
                         'placements': {'4': pieces},
                         'notes': 'Exact doorway r003 native fixture; '+('90° inward hinge, seal fully retracted.' if opened else 'Closed hinge, seal deployed.')+' Actual contact and continuous motion geometry audits pass. Whole-room pressure, authoritative sequencing, mechanical ratings and game installation remain unqualified. Art unapproved. The retained original strap-contact nominal failure is preserved separately from unchanged required seal/leaf contacts.'})
    return {'schema': 'sidereal.native-boundary-review.v2', 'fixtures': fixtures,
            'pins': dict(sorted(pins.items())), 'sourcePins': dict(sorted(source_pins.items())),
            'notes': 'Five internal250 standalone fixtures omitted: delivered wall placements have no explicit floor footprint/placement; no floor bounds invented. Internal end pieces remain in explicit union fixtures. Includes measured native floor-contact adapters, without physical grant, owner approval or runtime publication.'}
