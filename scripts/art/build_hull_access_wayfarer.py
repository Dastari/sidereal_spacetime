#!/usr/bin/env python3
"""Cut wall apertures/pocket slots in immutable native tiles; preserve original floors.

blender -b --python scripts/art/build_hull_access_wayfarer.py -- --root REPO
No chamber bulkheads, chamber roof, or continuous room floor is authored.
"""
import argparse
import copy
import hashlib
import importlib.util
import json
import re
import sys
from pathlib import Path
import bpy
from mathutils import Matrix

MODULES = [('personnel', 2, 4, 3, 1.2), ('cargo', -9, -5, -7, 3.75)]
IDENTITY = [[1,0,0,0],[0,1,0,0],[0,0,1,0],[0,0,0,1]]


def module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    value = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(value)
    return value


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--root', type=Path, required=True)
    ap.add_argument('--output', type=Path)
    ap.add_argument('--source', type=Path)
    ap.add_argument('--metadata-only', action='store_true')
    args = ap.parse_args(sys.argv[sys.argv.index('--')+1:])
    root = args.root.resolve()
    output = args.output or root/'assets/runtime/hull-access/r001'
    source = args.source or root/'assets/source/hull-access/r001'
    kit = module('kit', root/'scripts/art/build_ship_access_doors.py')
    native = module('native', root/'scripts/art/build_wayfarer_access_profile.py')
    manifest = json.loads((output/'manifest.json').read_text())
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    cuts = []
    for name, x0, x1, center, clear in MODULES:
        variant = next(v for v in manifest['variants'] if v['id'] == ('personnel' if name == 'personnel' else 'cargo.4m'))
        sweep = variant['sweepBounds']
        # Open only the clear aperture and the narrow mechanical slot in neighboring hull.
        cuts.append(([center-clear/2, 5.0, 0], [center+clear/2, 7.4, variant['outerHeightM']+.005]))
        cuts.append(([center+sweep['min'][0]-.016, 6.5+sweep['min'][1]-.016, 0],
                     [center+sweep['max'][0]+.016, 6.5+sweep['max'][1]+.016, sweep['max'][2]+.016]))
    # Existing room entrances, rather than a second pair of chamber modules.
    cuts.append(([3, 1.2, 0], [4, 1.8, 2.44]))
    cuts.append(([-9, 1.2, 0], [-7, 1.8, 2.44]))
    base = root/'assets/runtime/ship-study/wayfarer-authored-r001'
    original = json.loads((base/'manifest.json').read_text())
    layout = json.loads((base/'layout.json').read_text())
    pieces = {p['id']: p for p in original['pieces']+original['unique']}
    # Floors are never boolean-cut/reexported: preserve their authored surfaces byte-for-byte.
    rows = [r for r in layout['placements'] if r['role'] != 'floor']
    deck = [] if args.metadata_only else native.import_native(root, 'deck', rows, pieces, cuts, legacy_entrance_cut=False, standing_height=1.8)
    near = []
    variants = ['int.wallpanel.cockpit+amber.w1.s0.i1','int.wallpanel.cockpit+cyanbox.w1.s0.i1','int.wallpanel.machinery.w1.s0.i0.25']
    for i in range(15):
        p = variants[i%3]
        for prefix, piece, y in [('WALL', p, 5.75 if 'machinery' in p else 6.5),
                                 ('LINER', f'int.rimliner.v{i%3}.w1', 6.5)]:
            transform = copy.deepcopy(IDENTITY)
            transform[0][3] = -10.5+i
            transform[1][3] = y
            near.append({'object': f'{prefix}_near_{i:02}', 'piece': piece,
                         'role': 'wall-dressing', 'matrix': transform})
    if args.metadata_only:
        # Changing standing-slice admission does not change the verified mesh
        # bytes. Reconstruct exact collision fragments from the pinned source
        # placements and authored cuts, retaining source/mesh receipts.
        physical = json.loads((output/'wayfarer.json').read_text())
        from itertools import product
        from mathutils import Vector
        for row in rows+near:
            if row['object'] not in physical['collisionReplacements']:
                continue
            piece = pieces[row['piece']]
            low = piece.get('boundsMin',piece.get('bounds_min'))
            high = piece.get('boundsMax',piece.get('bounds_max'))
            baked = piece.get('frame') in {'ship (object transform kept in the GLB node)','ship-node-baked'}
            transform = Matrix(row.get('originalMatrix',row['matrix']) if baked else row['matrix'])
            corners = [transform@Vector(c) for c in product(*zip(low,high))]
            source_bounds = ([min(c[i] for c in corners) for i in range(3)], [max(c[i] for c in corners) for i in range(3)])
            rects = [[source_bounds[0][0],source_bounds[0][1],source_bounds[1][0],source_bounds[1][1]]]
            for low_cut,high_cut in cuts:
                if native.intersects(source_bounds,(low_cut,high_cut)) and low_cut[2]<=0 and high_cut[2]>=1.8:
                    rects = [r for old in rects for r in native.subtract(old,[low_cut[0],low_cut[1],high_cut[0],high_cut[1]])]
            physical['collisionReplacements'][row['object']] = rects
        for directory in (output,source):
            (directory/'wayfarer.json').write_text(json.dumps(physical,indent=2,sort_keys=True)+'\n')
        print(json.dumps({'metadataOnly':True,'standingHeightM':1.8,'collisionRows':len(physical['collisionReplacements'])}))
        return
    deck += native.import_native(root, 'deck', near, pieces, cuts, legacy_entrance_cut=False, standing_height=1.8)
    # Six narrow threshold tiles fill the hull depth, using the same authored floor kit.
    # They start beyond existing floor at y5.5, so there is no coplanar overlap.
    floor_piece = next(p for p in original['pieces'] if p['id'] == 'floor.plain') if any(p['id']=='floor.plain' for p in original['pieces']) else pieces[next(r['piece'] for r in layout['placements'] if r['role']=='floor')]
    for name, x0, x1, center, clear in MODULES:
        for x in range(x0, x1):
            before = set(bpy.data.objects)
            bpy.ops.import_scene.gltf(filepath=str(base/floor_piece['file']))
            for obj in set(bpy.data.objects)-before:
                if obj.type == 'MESH':
                    obj.matrix_world = Matrix.Translation((x, 5.5, 0)) @ obj.matrix_world
                    obj.name = f'GEO-hull-sill-{name}-{x}'
                    deck.append(obj)
    flight_base = root/'assets/runtime/ship-study/wayfarer-dorsal-r001'
    flight = json.loads((flight_base/'descriptor.json').read_text())
    flight_objects = native.import_native(root, 'flight', flight['instances'], {p['id']:p for p in flight['pieces']}, cuts)
    for material in bpy.data.materials:
        name = re.sub(r'\.\d{3}$', '', material.name)
        if name in original['palette']:
            material['sr_family'] = original['palette'][name]['family']
    bpy.ops.wm.save_as_mainfile(filepath=str(source/'wayfarer.blend'))
    exports = []
    for key, objects in [('native.deck', deck), ('native.flight', flight_objects)]:
        value = kit.export_group(key, objects, output)
        value['boundsMin'], value['boundsMax'] = native.bounds(objects)
        exports.append(value)
    physical = {'schema': 'sidereal.wayfarer-access-profile/v1', 'revision': 'hull-access-r001',
                'approval': 'proposal', 'pieces': exports+manifest['pieces'],
                'omitted': native.OMITTED, 'collisionReplacements': native.COLLISION_REPLACEMENTS,
                'newBlockers': [], 'floorSupport': [], 'frameBlockers': manifest['frameBlockers'],
                'palette': {**original['palette'], **manifest['palette']}, 'sourcePins': native.SOURCE_PINS,
                'sourceSha256': hashlib.sha256((source/'wayfarer.blend').read_bytes()).hexdigest()}
    for directory in (output, source):
        (directory/'wayfarer.json').write_text(json.dumps(physical, indent=2, sort_keys=True)+'\n')
    print(json.dumps({'omitted': {k:len(v) for k,v in native.OMITTED.items()}, 'pieces': len(exports)}))


if __name__ == '__main__':
    main()
