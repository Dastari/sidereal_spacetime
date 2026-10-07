#!/usr/bin/env python3
"""Author wall-depth animated access tiles; no chamber or room floor is included.

blender -b --python scripts/art/build_hull_access_tiles.py -- --root REPO
Native metre axes: X span, Y exterior, Z up. Neighbor tiles reserve the slide slot.
"""
from __future__ import annotations
import argparse
import hashlib
import importlib.util
import json
import math
import sys
from pathlib import Path
import bpy
from mathutils import Vector


def load_module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def bounds(objects):
    bpy.context.view_layer.update()
    points = [o.matrix_world @ v.co for o in objects for v in o.data.vertices]
    return [[min(p[i] for p in points) for i in range(3)],
            [max(p[i] for p in points) for i in range(3)]]


def delete(kit, group, token):
    for obj in list(kit.GROUPS[group]):
        if token in obj.name:
            kit.GROUPS[group].remove(obj)
            bpy.data.objects.remove(obj, do_unlink=True)


def author_tile(kit, kind, span):
    variant = kit.build(kind, span)
    frame = variant['parts']['frame']
    clear = variant['clearWidthM']
    # Replace vestibule ledges/landing and wide rotated hazard bars with a wall sill.
    for token in ['recess-landing', 'landing-rail', 'recess-roof', 'threshold', 'hazard-']:
        delete(kit, frame, token)
    # Author a shallow wall collar; face layering retains original bevel dimensions.
    for obj in kit.GROUPS[frame]:
        if 'jamb-' in obj.name:
            obj.location.y = -.045
            obj.dimensions.y = .33
        elif 'recess-cheek-' in obj.name:
            obj.location.y = -.06
            obj.dimensions.y = .12
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    kit.box(frame, 'sill', (0, .025, .018), (clear, .26, .036), 'trim', .004)
    # Diagonal bands are clipped to a narrow sill: no broad floor slab or protruding ends.
    n = max(8, round(clear / .14))
    step = clear / n
    for i in range(n):
        x = -clear / 2 + (i + .5) * step
        obj = kit.box(frame, f'sill-hazard-{i}', (x, .026, .038),
                      (step * .45, .25, .006), 'hazard', .001)
        obj.rotation_euler.z = -.32
    # Fine cap follows the existing hull rail instead of creating a room roof.
    kit.box(frame, 'navy-cap', (0, 0, 2.365), (span, .35, .105), 'navy', .018)
    for i in range(span * 2):
        kit.box(frame, f'cap-tile-{i}', (-span/2 + .25 + i*.5, .015, 2.421),
                (.465, .31, .032), 'navy', .008)
    for side in (-1, 1):
        x = side * (span / 2 - .095)
        kit.box(frame, f'red-catch-{side}', (x, .22, .29), (.045, .045, .30), 'red', .008)
        for z in (.53, 1.9):
            kit.box(frame, f'jamb-key-{side}-{z}', (x, .233, z),
                    (.043, .015, .09), 'metal', .004)
    if kind == 'cargo':
        delete(kit, frame, 'header-emitter')
        delete(kit, frame, 'light-housing')
        kit.box(frame, 'ivory-lintel', (0, .17, 2.292), (span-.10, .10, .145), 'white', .018)
        for i, x in enumerate((-clear*.39, 0, clear*.39)):
            kit.box(frame, f'lamp-socket-{i}', (x, .235, 2.297), (.30, .07, .115), 'trim', .01)
            kit.box(frame, f'amber-lamp-{i}', (x, .279, 2.297), (.235, .021, .066), 'amber', .006)
        for side in (-1, 1):
            leaf = variant['parts']['left' if side < 0 else 'right']
            x = side * (clear/2 - .105)
            kit.box(leaf, 'yellow-edge-lock', (x, .17, 1.05), (.028, .026, .78), 'hazard', .004)
            # Small upper stamped service inset and four slotted vents.
            center = side * clear/4
            kit.box(leaf, 'upper-service-inset', (center, .144, 1.80),
                    (min(.65, clear/2-.25), .024, .17), 'grey', .009)
            for i in range(4):
                kit.box(leaf, f'upper-slot-{i}', (center, .159, 1.75+i*.034),
                        (min(.52, clear/2-.33), .014, .012), 'trim', .002)
        for side in (-1, 1):
            leaf = variant['parts']['left' if side < 0 else 'right']
            for token in ['vent-', 'upper-service-inset', 'upper-slot-', 'service-spine', 'warning-pin']:
                delete(kit, leaf, token)
            center = side * clear / 4
            width = min(.88, clear/2-.28)
            kit.box(leaf, 'louvre-recess', (center, .149, 1.48), (width, .032, .34), 'navy', .009)
            for i in range(5):
                kit.box(leaf, f'louvre-fin-{i}', (center, .172, 1.35+i*.058), (width-.065, .025, .017), 'grey', .003)
            kit.panel(leaf, 'lower-service-field', center-width/2, center+width/2, .35, .94, .13, .152, 'grey', .035)
            kit.panel(leaf, 'lower-service-cover', center-width/2+.04, center+width/2-.04, .40, .88, .153, .17, 'white', .025)
            if side == 1:
                kit.box(leaf, 'service-serial', (center+.11, .18, .73), (width*.38, .02, .105), 'trim', .007)
                for i in range(4):
                    kit.box(leaf, f'serial-bar-{i}', (center+.05+i*.035, .195, .73), (.014, .009, .055), 'white', .002)
            kit.box(leaf, 'center-latch-slot', (side*.065, .177, 1.03), (.042, .029, .73), 'trim', .006)
            kit.box(leaf, 'center-latch-keeper', (side*.065, .198, .88), (.045, .022, .085), 'metal', .005)
    else:
        leaf = variant['parts']['leaf']
        delete(kit, leaf, 'molded-inset')
        kit.panel(leaf, 'molded-inset', -.42, .42, .23, 1.98, .05, .071, 'grey', .105)
        for i, (lo, hi) in enumerate(((.33, .85), (.91, 1.30))):
            kit.panel(leaf, f'service-inset-{i}', -.35, .35, lo, hi, .077, .091, 'white', .045)
        kit.box(leaf, 'viewport-blue-glass', (0, .133, 1.55), (.17, .012, .14), 'grey', .015)
        kit.box(leaf, 'viewport-cyan-reflection', (.025, .142, 1.59), (.092, .006, .012), 'cyan', .002)
        # Header frame and viewport remain readable without a deep vestibule.
        kit.box(frame, 'ivory-header-cheek', (0, .12, 2.298), (span-.20, .075, .065), 'white', .011)
    # The occupied deck sees a molded back face, not a bare black pressure plate.
    if kind == 'personnel':
        leaf = variant['parts']['leaf']
        kit.panel(leaf, 'rear-clipped-rim', -.56, .56, .08, 2.13, -.310, -.282, 'trim', .14)
        kit.panel(leaf, 'rear-molded-face', -.52, .52, .13, 2.08, -.335, -.309, 'grey', .13)
        kit.panel(leaf, 'rear-service-field', -.41, .41, .29, 1.30, -.353, -.334, 'white', .065)
        kit.panel(leaf, 'rear-port-rim', -.16, .16, 1.40, 1.73, -.370, -.335, 'trim', .06)
        kit.panel(leaf, 'rear-port', -.11, .11, 1.45, 1.68, -.382, -.369, 'navy', .035)
        kit.box(leaf, 'rear-handle', (0,-.378,1.0), (.12,.028,.06), 'metal', .007)
    else:
        for side in (-1,1):
            leaf = variant['parts']['left' if side < 0 else 'right']
            a,b = (-clear/2,-.006) if side < 0 else (.006,clear/2)
            kit.panel(leaf, 'rear-metal-face', a+.03,b-.03,.07,2.18,-.150,-.121,'grey',.05)
            kit.panel(leaf, 'rear-service-cover', a+.13,b-.13,.35,1.05,-.174,-.149,'white',.035)
            center = (a+b)/2
            kit.box(leaf, 'rear-vent-socket',(center,-.171,1.55),(min(.88,b-a-.28),.03,.30),'navy',.008)
            for i in range(4):
                kit.box(leaf,f'rear-vent-fin-{i}',(center,-.195,1.45+i*.055),(min(.81,b-a-.35),.02,.017),'grey',.003)
    moving = [o for key, objects in kit.GROUPS.items()
              if key in variant['parts'].values() and key != frame for o in objects]
    # Door bottom seats above the narrow sill, not through the native floor dressing.
    kit.cut(moving, [-100, -100, -1], [100, 100, .045])
    low, high = bounds(moving)
    sweep_low, sweep_high = low[:], high[:]
    if kind == 'personnel':
        sweep_low[0] -= variant['strokeM']
    else:
        sweep_low[0] -= variant['strokeM']
        sweep_high[0] += variant['strokeM']
    kit.cut(kit.GROUPS[frame], [sweep_low[0]-.016, sweep_low[1]-.016, sweep_low[2]-.002],
            [sweep_high[0]+.016, sweep_high[1]+.016, sweep_high[2]+.016])
    variant['sweepBounds'] = {'min': sweep_low, 'max': sweep_high, 'clearanceM': .015625}
    variant['leafDirection'] = -1
    # The frame ring fits the named tile; lateral space belongs to neighbor hull tiles.
    variant['floorFootprintM'] = [clear, .26]
    variant['chamber'] = False
    return variant


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--root', type=Path, required=True)
    ap.add_argument('--output', type=Path)
    ap.add_argument('--source', type=Path)
    args = ap.parse_args(sys.argv[sys.argv.index('--')+1:])
    root = args.root.resolve()
    output = args.output or root/'assets/runtime/hull-access/r001'
    source = args.source or root/'assets/source/hull-access/r001'
    output.mkdir(parents=True, exist_ok=True)
    source.mkdir(parents=True, exist_ok=True)
    kit = load_module('kit', root/'scripts/art/build_ship_access_doors.py')
    native = load_module('native', root/'scripts/art/build_wayfarer_access_profile.py')
    kit.cut = native.cut
    kit.PALETTE['access.amber'] = ((1, .16, .012), 'emissive', 1.65)
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    variants = [author_tile(kit, 'personnel', 2),
                *[author_tile(kit, 'cargo', width) for width in (2, 4, 6)]]
    # Boolean subtraction can leave a zero-volume bolt face. It is neither
    # visible solid hardware nor a valid collision volume; remove it at source.
    for key, objects in kit.GROUPS.items():
        for obj in list(objects):
            if not obj.data.polygons:
                objects.remove(obj)
                bpy.data.objects.remove(obj,do_unlink=True)
                continue
            lo,hi = bounds([obj])
            if key.endswith('frame') and min(hi[i]-lo[i] for i in range(3)) < 1e-6:
                objects.remove(obj)
                bpy.data.objects.remove(obj,do_unlink=True)

    # Match the existing native hull rail at31/16m, with1.875m clear height.
    # Geometry is authored at these dimensions; renderer transforms stay rigid.
    for variant in variants:
        original_top = variant['clearHeightM']
        for key in variant['parts'].values():
            for obj in kit.GROUPS[key]:
                transform = obj.matrix_world.copy()
                inverse = transform.inverted()
                for vertex in obj.data.vertices:
                    point = transform @ vertex.co
                    point.z = (point.z * 1.875 / original_top if point.z <= original_top
                               else 1.875 + (point.z-original_top) * .0625/(2.4375-original_top))
                    vertex.co = inverse @ point
                obj.data.update()
        moving = [o for key in variant['parts'].values() if key != variant['parts']['frame'] for o in kit.GROUPS[key]]
        kit.cut(moving, [-100,-100,-1], [100,100,.045])
        low, high = bounds(moving)
        if variant['motion'] == 'single-sliding': low[0] -= variant['strokeM']
        else: low[0] -= variant['strokeM']; high[0] += variant['strokeM']
        variant['sweepBounds'] = {'min':low, 'max':high, 'clearanceM':.015625}
        variant['clearHeightM'] = 1.875
    pieces = [kit.export_group(key, objects, output) for key, objects in kit.GROUPS.items()]
    for variant in variants:
        selected = [p for p in pieces if p['id'] in variant['parts'].values()]
        variant['outerHeightM'] = max(p['boundsMax'][2] for p in selected)
        variant['depthM'] = max(p['boundsMax'][1] for p in selected)-min(p['boundsMin'][1] for p in selected)
    bpy.ops.wm.save_as_mainfile(filepath=str(source/'tiles.blend'))
    manifest = {'schema': 'sidereal.ship-access-doors/v1', 'revision': 'hull-access-r001',
                'approval': 'proposal', 'variants': variants, 'pieces': pieces,
                'palette': {name: {'colour': list(c), 'family': f, 'kind': 'authored-access', 'strength': s}
                            for name, (c, f, s) in kit.PALETTE.items()},
                'frameBlockers': {v['id']: [{'id': o.name, 'min': bounds([o])[0], 'max': bounds([o])[1]}
                                 for o in kit.GROUPS[v['parts']['frame']]
                                 if bounds([o])[0][2] < 1.8 and bounds([o])[1][2] > .3] for v in variants},
                'sourceSha256': hashlib.sha256((source/'tiles.blend').read_bytes()).hexdigest()}
    encoded = json.dumps(manifest, indent=2, sort_keys=True)+'\n'
    for directory in (output, source):
        (directory/'manifest.json').write_text(encoded)
    print(json.dumps({'revision': manifest['revision'], 'triangles': sum(p['triangles'] for p in pieces)}))


if __name__ == '__main__':
    main()
