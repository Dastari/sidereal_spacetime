"""Blender-authored armor cassette proof; no runtime or authority mutations.

The managed framed_wayfarer_entry.py calls build_all(output_directory). Every
output directory is immutable once models.json exists. The proof contains six
models; independent review is required before propagating the complete family.
"""
from __future__ import annotations

import hashlib
import json
import math
from pathlib import Path
import sys

if __name__ == '__main__' and '--' not in sys.argv:
    # Narrow managed authoring launcher: read the configured Blender path;
    # do not depend on the earlier shared-worktree entry helper.
    import argparse
    import shutil
    import subprocess
    import tomllib
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--out', required=True)
    args = parser.parse_args()
    project = Path(__file__).resolve().parents[2]
    output = Path(args.out).resolve()
    output.mkdir(parents=True, exist_ok=False)
    shutil.copyfile(__file__, output / 'recipe.py')
    shutil.copyfile(Path(__file__).with_name('armor_cassette_interfaces.json'), output / 'armor_cassette_interfaces.json')
    config = tomllib.loads((project / 'dev.toml').read_text())
    command = [config['art']['blender'], '--background', '--factory-startup', '--threads', '8',
               '--python-exit-code', '1', '--python', str(Path(__file__).resolve()), '--', str(output)]
    with (output / 'build.log').open('w') as log:
        result = subprocess.run(command, cwd=project, stdout=log, stderr=subprocess.STDOUT)
    print((output / 'build.log').read_text()[-6000:])
    raise SystemExit(result.returncode)

import bpy
import numpy as np
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
REVISION = 4
CELL = 1 / 32
ATLAS_METRES = 16
TEXELS_PER_METRE = 128
FONT = {
    'W': ['10001', '10001', '10001', '10101', '10101', '11011', '10001'],
    'F': ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
    'A': ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
    'Y': ['10001', '10001', '01010', '00100', '00100', '00100', '00100'],
    'R': ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
    'E': ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
    '0': ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
    '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
    '-': ['00000', '00000', '00000', '11111', '00000', '00000', '00000'],
}
REGIONS = {
    'plain': (0, 0, 2, 3, (.68, .71, .78)),
    'service': (2, 0, 2, 3, (.47, .055, .075)),
    'wide-plain': (4, 0, 4, 3, (.68, .71, .78)),
    'wide-identity': (8, 0, 4, 3, (.055, .073, .115)),
    'identity': (12, 0, 2, 3, (.055, .073, .115)),
    'connector': (0, 3, 4, 4, (.69, .72, .79)),
    'rail': (4, 3, 4, 4, (.05, .065, .105)),
    'bow-name': (0, 7, 4, 1.5, (.68, .71, .78)),
    'metal': (8, 3, 4, 4, (.15, .19, .245)),
    'black': (12, 3, 4, 4, (.012, .02, .03)),
}
FRONT_IDS = {
    'front-bow-bumper': 'part-63a0c40bbb71cfeba4dd',
    'front-shoulder-transition': 'part-e965a5502d9fe4c25406',
}


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def image(name, pixels, path, color=False):
    h, w, _ = pixels.shape
    result = bpy.data.images.new(name, width=w, height=h, alpha=True)
    result.colorspace_settings.name = 'sRGB' if color else 'Non-Color'
    result.pixels.foreach_set(pixels.astype(np.float32).ravel())
    result.filepath_raw = str(path)
    result.file_format = 'PNG'
    result.save()
    result.pack()
    return result


def text_mask(rgb, text, u, v, scale, color):
    x, y = round(u * TEXELS_PER_METRE), round(v * TEXELS_PER_METRE)
    for ch in text:
        for row, bits in enumerate(FONT.get(ch, ['00000'] * 7)):
            for column, bit in enumerate(bits):
                if bit == '1':
                    xx, yy = x + column * scale, y + (6 - row) * scale
                    rgb[yy:yy + scale, xx:xx + scale] = color
        x += 6 * scale


def materials(out):
    """Three shared portable maps, all at 128 texels per physical metre.

    Atlas coordinates are explicit material surfaces, not scaled textures.
    Fine tooling, seated bolts, slot heads and restrained scratches are baked
    into a millimetre relief field and exported as tangent-space normals.
    """
    target = out / 'textures'
    target.mkdir(parents=True)
    n = ATLAS_METRES * TEXELS_PER_METRE
    u, v = np.meshgrid((np.arange(n) + .5) / TEXELS_PER_METRE,
                       (np.arange(n) + .5) / TEXELS_PER_METRE)
    rgb = np.zeros((n, n, 3), dtype=np.float32)
    relief = np.zeros((n, n), dtype=np.float32)
    rough = np.full((n, n), .39, dtype=np.float32)
    rng = np.random.default_rng(40914)
    fine = rng.normal(0, .006, (n, n))
    for key, (x, y, w, h, color) in REGIONS.items():
        inside = (u >= x) & (u < x + w) & (v >= y) & (v < y + h)
        rgb[inside] = np.asarray(color) * (1 + fine[inside, None])
        rough[inside] += fine[inside] * 1.8
        lu, lv = u - x, v - y
        if key in ('plain', 'service', 'wide-plain', 'identity', 'wide-identity'):
            left, right, low, high = .25, w - .25, .56, 2.43
            # Sparse short engraved channels near panel ends; no metre grid.
            channel = (((abs(lv - .69) < .009) | (abs(lv - 2.30) < .009)) &
                       (lu > .52) & (lu < w - .52) & inside)
            relief[channel] = -.003
            rgb[channel] *= .67
            for cu in (left + .09, right - .09):
                for cv in (low + .14, high - .14):
                    rad = np.hypot(lu - cu, lv - cv)
                    seat = (rad < .03125) & inside
                    head = (rad < .019) & inside
                    slot = head & (abs(lv - cv) < .005)
                    relief[seat] = -.003; relief[head] = -.001; relief[slot] = -.005
                    rgb[seat] *= .59; rgb[head] *= 1.28; rgb[slot] *= .37
                    rough[seat] = .57
            if key == 'service':
                outline = (((abs(lu - .38) < .009) | (abs(lu - (w - .38)) < .009)) &
                           (lv > .83) & (lv < 2.13)) | (
                           ((abs(lv - .83) < .009) | (abs(lv - 2.13) < .009)) &
                           (lu > .38) & (lu < w - .38))
                relief[outline & inside] = -.004
                rgb[outline & inside] *= .58
                hazard = inside & (lu > .80) & (lu < 1.23) & (lv > 1.09) & (lv < 1.14)
                rgb[hazard] = (.05, .045, .025)
                rgb[hazard & (((lu + lv) * 20) % 1 < .46)] = (.89, .56, .035)
            # Restrained wear near the tooling, rather than all-over noise.
            wear = inside & (lv > .73) & (lv < .75) & (lu > .56) & (lu < .86)
            rgb[wear & (fine > .001)] *= 1.14
        elif key == 'connector':
            for cu in (.0625, .1875, .9375, 1.0625, 1.9375):
                for cv in (.09375, .40625, .90625, 1.40625, 1.90625):
                    rad = np.hypot(lu - cu, lv - cv)
                    seat = inside & (rad < .022)
                    slot = inside & (rad < .014) & (abs(lv - cv) < .004)
                    relief[seat] = -.0025; relief[slot] = -.005
                    rgb[seat] *= .65; rgb[slot] *= .30
            seam = inside & (abs(lv - .25) < .007) & (lu < .25)
            relief[seam] = -.002; rgb[seam] *= .7
        elif key == 'rail':
            for cu in (.18, .90, 1.75):
                seat = inside & (np.hypot(lu - cu, lv - .19) < .022)
                relief[seat] = -.004; rgb[seat] *= .43
            channel = inside & (abs(lv - .08) < .008) & (lu > .12) & (lu < 1.88)
            relief[channel] = -.003; rgb[channel] *= .60
    # The broad identity marking spans the two members at a fixed real size.
    text_mask(rgb, 'WF-01', 8.43, 1.17, 5, (.80, .83, .90))
    text_mask(rgb, 'WF-01', 12.45, 1.18, 3, (.80, .83, .90))
    disc = (u - 11.02) ** 2 + (v - 1.55) ** 2 < .31 ** 2
    rgb[disc] = (.80, .83, .89)
    ring = ((u - 11.02) / .51) ** 2 + ((v - 1.55 - (u - 11.02) * .35) / .12) ** 2
    rgb[(ring > .77) & (ring < 1.20)] = (.66, .08, .10)
    text_mask(rgb, 'WAYFARER', .68, 7.66, 6, (.04, .06, .10))
    dv, du = np.gradient(relief, 1 / TEXELS_PER_METRE)
    normals = np.stack((-du, -dv, np.ones_like(du)), axis=-1)
    normals /= np.linalg.norm(normals, axis=-1, keepdims=True)
    rgba = np.ones((n, n, 4), dtype=np.float32)
    rgba[:, :, :3] = np.clip(rgb, 0, 1)
    base = image('Armor cassette / shared metric color atlas', rgba, target / 'armor-basecolor.png', True)
    rgba[:, :, :3] = normals * .5 + .5
    normal = image('Armor cassette / baked millimetre relief', rgba, target / 'armor-normal.png')
    rgba[:, :, :3] = np.clip(rough, 0, 1)[:, :, None]
    roughness = image('Armor cassette / localized finish atlas', rgba, target / 'armor-roughness.png')
    mats = {}
    for role in ('enamel', 'metal'):
        m = bpy.data.materials.new('Armor cassette / ' + role)
        m.use_nodes = True
        p = m.node_tree.nodes.get('Principled BSDF')
        p.inputs['Metallic'].default_value = .10 if role == 'enamel' else .68
        for source, socket in ((base, 'Base Color'), (roughness, 'Roughness')):
            node = m.node_tree.nodes.new('ShaderNodeTexImage'); node.image = source
            node.interpolation = 'Linear'; node.extension = 'EXTEND'
            m.node_tree.links.new(node.outputs['Color'], p.inputs[socket])
        tex = m.node_tree.nodes.new('ShaderNodeTexImage'); tex.image = normal
        tex.extension = 'EXTEND'
        nm = m.node_tree.nodes.new('ShaderNodeNormalMap')
        m.node_tree.links.new(tex.outputs['Color'], nm.inputs['Color'])
        m.node_tree.links.new(nm.outputs['Normal'], p.inputs['Normal'])
        mats[role] = m
    for role, color in [('cyan', (.012, .50, .82, 1)), ('amber', (.93, .30, .018, 1))]:
        m = bpy.data.materials.new('Armor cassette / ' + role); m.use_nodes = True
        p = m.node_tree.nodes.get('Principled BSDF')
        p.inputs['Base Color'].default_value = color
        p.inputs['Roughness'].default_value = .30
        p.inputs['Emission Color'].default_value = color
        p.inputs['Emission Strength'].default_value = 1.6
        mats[role] = m
    return mats


class Module:
    def __init__(self, slug, mats):
        self.slug, self.mats = slug, mats
        self.collection = bpy.data.collections.new('SOURCE-' + slug)
        bpy.context.scene.collection.children.link(self.collection)
        self.root = bpy.data.objects.new('ASSET-' + slug, None)
        self.collection.objects.link(self.root)
        self.root['native_source'] = 'armor_cassette_hull.py / r004'
        self.objects, self.sockets = [], {}

    def mesh(self, name, verts, faces, region='rail', bevel=0, group='ARMOR', surface_uv=None, material='enamel'):
        data = bpy.data.meshes.new('MESH-' + self.slug + '--' + name)
        data.from_pydata(verts, [], faces); data.update()
        obj = bpy.data.objects.new('GEO-' + self.slug + '--' + group + '--' + name, data)
        self.collection.objects.link(obj); obj.parent = self.root
        obj['render_group'] = group; obj['texture_region'] = region
        if material == 'enamel' and region == 'metal': material = 'metal'
        data.materials.append(self.mats[material])
        uv = data.uv_layers.new(name='MetricAtlas16m')
        origin = [min(v[i] for v in verts) for i in range(3)]
        ru, rv, rw, rh, _ = REGIONS[region]
        for face in data.polygons:
            axis = max(range(3), key=lambda i: abs(face.normal[i]))
            for li in face.loop_indices:
                p = data.vertices[data.loops[li].vertex_index].co
                if surface_uv is not None:
                    a, b = surface_uv(p)
                elif axis == 0:
                    a, b = p.y - origin[1], p.z - origin[2]
                elif axis == 1:
                    a, b = p.x - origin[0], p.z - origin[2]
                else:
                    a, b = p.x - origin[0], p.y - origin[1]
                # No normalized UV stretching or wrapping through another cell.
                assert -.000001 <= a <= rw + .000001 and -.000001 <= b <= rh + .000001, (name, region, a, b)
                uv.data[li].uv = ((ru + a) / ATLAS_METRES, (rv + b) / ATLAS_METRES)
        if bevel:
            smallest = min((Vector(verts[face[(i + 1) % len(face)]]) - Vector(verts[v])).length
                           for face in faces for i, v in enumerate(face))
            b = obj.modifiers.new('Authored single-step chamfer', 'BEVEL')
            b.width = min(bevel, smallest * .35); b.segments = 1; b.harden_normals = True
            obj.modifiers.new('Broad face weighted normals', 'WEIGHTED_NORMAL')
        self.objects.append(obj)
        return obj

    def box(self, name, x0, x1, y0, y1, z0, z1, region='connector', bevel=.015625, group='ARMOR', surface_uv=None, material='enamel'):
        assert min(x1 - x0, y1 - y0, z1 - z0) > 0, name
        verts = [(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0),
                 (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)]
        return self.mesh(name, verts, [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4),
                                      (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)],
                         region, bevel, group, surface_uv, material)

    def xy_prism(self, name, points, low, high, region='rail', bevel=0, group='ARMOR', surface_uv=None):
        n = len(points)
        verts = [(x, y, low(x, y) if callable(low) else low) for x, y in points]
        verts += [(x, y, high(x, y) if callable(high) else high) for x, y in points]
        return self.mesh(name, verts, [tuple(reversed(range(n))), tuple(range(n, 2 * n))] +
                         [(i, (i + 1) % n, (i + 1) % n + n, i + n) for i in range(n)],
                         region, bevel, group, surface_uv)

    def rail(self, name, cross, y0, y1, region='rail'):
        # Cross-section is counterclockwise in XZ; its outward end normal is -Y.
        n = len(cross)
        verts = [(x, y0, z) for x, z in cross] + [(x, y1, z) for x, z in cross]
        return self.mesh(name, verts, [tuple(range(n)), tuple(reversed(range(n, 2 * n)))] +
                         [(i, i + n, (i + 1) % n + n, (i + 1) % n) for i in range(n)],
                         region, .008)

    def socket(self, name, position, normal):
        obj = bpy.data.objects.new('SOCKET-' + self.slug + '--' + name, None)
        self.collection.objects.link(obj); obj.parent = self.root; obj.location = position
        obj['socket_name'] = name; obj['normal'] = list(normal)
        self.sockets[name] = {'position': list(position), 'normal': list(normal)}


def side(slug, variant, mats, pair=None, width=2, height=3):
    m = Module(slug, mats); half = width / 2
    low_band, high_band = (.4375, .5) if height >= 1.5 else (.1875, .1875)
    m.box('retained-inboard-liner', 0, CELL, -half, half, 0, height, 'metal', 0, 'LINER')
    m.box('cassette-carrier', .125, .1875, -half, half, 0, height, 'black', 0)
    lower = [(.125, 0), (.40625, 0), (.5, .09375), (.5, low_band - .09375),
             (.4375, low_band), (.1875, low_band), (.125, low_band - .0625)]
    top = [(.125, height - high_band), (.34375, height - high_band),
           (.5, height - high_band + .15625), (.5, height - .09375), (.40625, height), (.125, height)]
    m.rail('deep-lower-impact-rail', lower, -half, half)
    m.rail('stepped-upper-armor-shoulder', top, -half, half)
    # Physical 125 mm half-posts combine into one 250 mm inter-bay connector.
    # Internal paired edges omit that post and retain a narrow cassette seam.
    edges = ([] if pair == 'right' else [(-half, -half + .125)]) + ([] if pair == 'left' else [(half - .125, half)])
    for i, (a, b) in enumerate(edges):
        m.box(f'wrapped-connector-{i}-spine', .34375, .5, a, b, .28125, height - .28125,
              'connector', .03125)
        m.box(f'wrapped-connector-{i}-lower-shoe', .0625, .5, a, b, 0, low_band + .0625,
              'connector', .03125)
        m.box(f'wrapped-connector-{i}-upper-shoe', .0625, .5, a, b, height - high_band - .0625, height,
              'connector', .03125)
        m.box(f'wrapped-connector-{i}-top-return', CELL, .4375, a, b, height - .125, height,
              'connector', .015625)
        if height >= 1.5:
            m.box(f'connector-{i}-amber-socket', .493, .499, a + .035, b - .035, .73, 1.14,
                  'black', .002)
            m.box(f'connector-{i}-amber-lens', .499, .5, a + .049, b - .049, .78, 1.09,
                  'black', 0, material='amber')
    edge0 = -half + (.1875 if pair != 'right' else .0078125)
    edge1 = half - (.1875 if pair != 'left' else .0078125)
    z0, z1 = low_band + .0625, height - high_band - .0625
    region = 'wide-' + variant if pair else 'service' if variant == 'red-service' else variant
    if region not in REGIONS: region = 'plain'
    bay_shift = 0 if pair != 'right' else 2
    panel_uv = lambda p: (p.y + half + bay_shift, p.z)
    m.box('deep-black-cassette-reveal', .1875, .203125, max(-half, edge0 - .025), min(half, edge1 + .025),
          z0 - .025, z1 + .025, 'black', .008)
    m.box('interchangeable-armor-cassette', .203125, .28125, edge0, edge1, z0, z1,
          region, .03125, surface_uv=panel_uv)
    if variant == 'vent':
        m.box('vent-well', .282, .294, -.63, .63, .68, 2.21, 'black', .018)
        for i in range(6):
            z = .74 + i * .235
            m.rail(f'deep-vent-louver-{i}', [(.292, z), (.4375, z + .035),
                                          (.4375, z + .112), (.292, z + .155)], -.57, .57, 'metal')
        for a, b in [(-.68, -.60), (.60, .68)]:
            m.box('vent-cassette-side-jamb', .28125, .40625, a, b, .625, 2.27, 'rail', .016)
    elif variant == 'red-service':
        m.box('service-upper-hinge', .282, .34375, -.63, -.40, 1.94, 2.07, 'metal', .018)
        m.box('service-lower-hinge', .282, .34375, -.63, -.40, .76, .89, 'metal', .018)
        m.box('service-latch-recess', .282, .291, .47, .65, 1.23, 1.57, 'black', .008)
        m.box('service-latch-grip', .29, .375, .53, .59, 1.27, 1.52, 'metal', .013)
    m.box('cyan-rail-recess', .492, .499, -.36, .36, .14, .255, 'black', .008)
    m.box('cyan-rail-lens', .499, .5, -.29, .29, .174, .218, 'black', 0, material='cyan')
    m.socket('HULL_ATTACH', (0, 0, 0), (1, 0, 0))
    m.socket('HULL_EDGE_START', (0, -half, 0), (0, -1, 0))
    m.socket('HULL_EDGE_END', (0, half, 0), (0, 1, 0))
    m.socket('HULL_TOP', (0, 0, height), (0, 0, 1))
    return m


def edge_block(m, name, a, b, start, end, d0, d1, low, high, region='connector', bevel=.015625, group='ARMOR', surface_uv=None):
    a, b = Vector(a), Vector(b); tangent = (b - a).normalized()
    outward = Vector((tangent.y, -tangent.x, 0))
    aa, bb = a + tangent * start, a + tangent * end
    xy = [tuple(p + outward * d)[:2] for p, d in ((aa, d0), (bb, d0), (bb, d1), (aa, d1))]
    if m.slug == 'front-shoulder-transition':
        # The forward wedge narrows to X=0. A constant inward-offset rectangle
        # would cross that datum. Clip its actual swept polygon to the positive
        # shell land instead of widening the inherited mating envelope.
        clipped = []
        for previous, current in zip(xy[-1:] + xy[:-1], xy):
            pin, cin = previous[0] >= CELL, current[0] >= CELL
            if pin != cin:
                t = (CELL - previous[0]) / (current[0] - previous[0])
                clipped.append((CELL, previous[1] + t * (current[1] - previous[1])))
            if cin: clipped.append(current)
        xy = clipped
        assert len(xy) >= 3, ('Empty clipped shoulder solid', name)
    # a -> b -> outward is clockwise, so reverse the polygon for prism winding.
    return m.xy_prism(name, list(reversed(xy)), low, high, region, bevel, group, surface_uv)


def front(slug, mats):
    m = Module(slug, mats)
    if slug == 'front-bow-bumper':
        # Retain the exact inboard Y=0 surface of r002's impact carrier.
        m.xy_prism('retained-inboard-bow-liner', [(0, 0), (4, 0), (3.984375, CELL), (.015625, CELL)],
                   0, 1.48, 'rail', 0, 'LINER')
        a, b, length = (3.75, .5, 0), (.25, .5, 0), 3.5
        for name, low, high in [('impact', 0, .3125), ('shoulder', 1.21875, 1.55)]:
            edge_block(m, 'wrapped-bow-' + name, a, b, 0, length, -.375, .125, low, high,
                       'rail', .03125)
        for j, (t0, t1) in enumerate([(0, .21875), (length - .21875, length)]):
            edge_block(m, f'bow-connector-{j}', a, b, t0, t1, -.375, .125, .03125, 1.52,
                       'connector', .03125)
        edge_block(m, 'bow-cassette-dark-reveal', a, b, .22, length - .22, -.28125, -.25,
                   .29, 1.24, 'black', .008)
        tangent = (Vector(b) - Vector(a)).normalized()
        uv = lambda p: ((p - Vector(a)).dot(tangent) + .25, p.z)
        edge_block(m, 'opaque-bow-name-cassette', a, b, .28125, length - .28125, -.25, -.09375,
                   .34375, 1.1875, 'bow-name', .03125, surface_uv=uv)
        edge_block(m, 'bow-cyan-socket', a, b, 1.31, 2.19, .115, .124, .11, .23, 'black', .003)
        obj = edge_block(m, 'bow-cyan-lens', a, b, 1.38, 2.12, .124, .125, .15, .19, 'black', 0)
        obj.data.materials.clear(); obj.data.materials.append(mats['cyan'])
    else:
        height = lambda x, y: 2.9375 - 1.375 * y / 2
        m.xy_prism('retained-inboard-shoulder-liner', [(0, 0), (CELL, 0), (0, 2)],
                   0, height, 'rail', 0, 'LINER')
        m.xy_prism('shoulder-aft-wrapped-endblock', [(CELL, 0), (.75, 0), (.65625, .25), (CELL, .25)],
                   0, height, 'connector', .015625)
        m.xy_prism('shoulder-forward-wrapped-endblock', [(.0078125, 1.75), (.09375, 1.75), (.00390625, 1.98)],
                   0, height, 'connector', .008)
        a, b = Vector((.75, 0, 0)), Vector((0, 2, 0)); length = (b - a).length
        # Fixed terminal land keeps the deep inward casing inside X/Y bounds.
        start, end = .3125, length - .3125
        edge_block(m, 'shoulder-lower-impact-frame', a, b, start, end, -.28125, .0625,
                   0, .34375, 'rail', .025)
        edge_block(m, 'shoulder-sloped-upper-frame', a, b, start, end, -.28125, .0625,
                   lambda x, y: height(x, y) - .34375, height, 'rail', .025)
        for j, (t0, t1) in enumerate([(start, start + .1875), (end - .1875, end)]):
            edge_block(m, f'wrapped-shoulder-connector-{j}', a, b, t0, t1, -.25, .0625,
                       .03125, lambda x, y: height(x, y) - .03125, 'connector', .025)
        edge_block(m, 'deep-shoulder-shadow-reveal', a, b, start + .18, end - .18, -.25, -.21875,
                   .31, lambda x, y: height(x, y) - .31, 'black', .008)
        edge_block(m, 'opaque-stepped-shoulder-cassette', a, b, start + .21875, end - .21875,
                   -.21875, -.15625, .390625, lambda x, y: height(x, y) - .421875,
                   'plain', .025)
    m.socket('HULL_ATTACH', (0, 0, 0), (1, 0, 0))
    return m


def bounds(objects):
    deps = bpy.context.evaluated_depsgraph_get(); points = []
    for obj in objects:
        evaluated = obj.evaluated_get(deps); mesh = evaluated.to_mesh()
        points.extend(obj.matrix_world @ v.co for v in mesh.vertices)
        evaluated.to_mesh_clear()
    return {key: [fn(p[i] for p in points) for i in range(3)] for key, fn in [('min', min), ('max', max)]}


def export(m, out, metadata):
    target = out / 'models' / m.slug; target.mkdir(parents=True)
    bpy.context.view_layer.update(); measured = bounds(m.objects)
    render_groups, batches = {}, []
    for group in ('ARMOR', 'LINER'):
        sources = [obj for obj in m.objects if obj['render_group'] == group]
        if not sources: raise ValueError('Missing semantic group: ' + group)
        copies = []
        for source in sources:
            obj = source.copy(); obj.data = source.data.copy()
            m.collection.objects.link(obj); obj.parent = None; copies.append(obj)
        bpy.ops.object.select_all(action='DESELECT')
        for obj in copies: obj.select_set(True)
        bpy.context.view_layer.objects.active = copies[0]
        bpy.ops.object.convert(target='MESH'); bpy.ops.object.join()
        joined = bpy.context.object; joined.name = 'GEO-' + m.slug + '--' + group
        joined.parent = m.root; joined['render_group'] = group
        render_groups[group.lower()] = {'nodePrefix': joined.name, 'bounds': bounds([joined]),
                                       'triangles': sum(len(p.vertices) - 2 for p in joined.data.polygons)}
        batches.append(joined)
    bpy.ops.object.select_all(action='DESELECT'); m.root.select_set(True)
    for obj in batches: obj.select_set(True)
    sockets = []
    for obj in m.collection.objects:
        if obj.type == 'EMPTY' and obj is not m.root:
            sockets.append((obj, obj.name)); obj.name = obj['socket_name']; obj.select_set(True)
    path = target / 'model.glb'
    bpy.ops.export_scene.gltf(filepath=str(path), export_format='GLB', use_selection=True,
                              export_apply=True, export_extras=True)
    for obj, name in sockets: obj.name = name
    record = {'slug': m.slug, 'path': str(path.relative_to(out)), 'sha256': digest(path),
              'bounds': measured, 'sockets': m.sockets, 'nodePrefix': 'GEO-' + m.slug + '--',
              'renderGroups': render_groups, 'authoredMeshCount': len(m.objects),
              'triangles': sum(g['triangles'] for g in render_groups.values()),
              'nonuniformScale': False, 'revision': REVISION, **metadata}
    (target / 'model.json').write_text(json.dumps(record, indent=2) + '\n')
    for obj in batches: bpy.data.objects.remove(obj, do_unlink=True)
    return record


def build_all(out_dir):
    out = Path(out_dir).resolve(); out.mkdir(parents=True, exist_ok=True)
    if (out / 'models.json').exists() or (out / 'source.blend').exists():
        raise FileExistsError('Preserve this proof; use a new attempt directory: ' + str(out))
    bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
    mats = materials(out); modules, records = [], []
    for variant, pair in [('red-service', None), ('vent', None), ('plain', 'left'), ('plain', 'right')]:
        slug = 'armor-' + variant + ('-pair-' + pair if pair else '') + '-w200-h300'
        m = side(slug, variant, mats, pair)
        records.append(export(m, out, {'family': 'side', 'variant': variant, 'widthM': 2, 'heightM': 3,
                                       'pairRole': pair, 'visualBayWidthM': 4 if pair else 2,
                                       'interfaceLatticeM': CELL, 'cassetteFaceX': .28125}))
        modules.append(m)
    interface_path = Path(__file__).with_name('armor_cassette_interfaces.json')
    interfaces = json.loads(interface_path.read_text())
    catalogue = {a['assetId']: a for a in interfaces['fronts']}
    current_catalogue = ROOT / interfaces['sourceCatalogPath']
    if current_catalogue.exists():
        current = {a['id']: a for a in json.loads(current_catalogue.read_text())['assets']}
        for asset_id, interface in catalogue.items():
            assert current[asset_id]['bounds'] == interface['bounds'], ('Current front interface changed', asset_id)
    for slug, asset_id in FRONT_IDS.items():
        m = front(slug, mats); old = catalogue[asset_id]
        record = export(m, out, {'family': 'front', 'assetId': asset_id, 'existingBounds': old['bounds'],
                                'glazingChanged': False, 'innerVisibleLinerPreserved': True})
        for axis in range(3):
            assert record['bounds']['min'][axis] >= old['bounds']['min'][axis] - .0001, (slug, record['bounds'], old['bounds'])
            assert record['bounds']['max'][axis] <= old['bounds']['max'][axis] + .0001, (slug, record['bounds'], old['bounds'])
        records.append(record); modules.append(m)
    scene = bpy.context.scene; scene.unit_settings.system = 'METRIC'; scene.unit_settings.scale_length = 1
    scene['native_hull_contract'] = 'r004 proof; distinct armor/liner; fixed interface; independent visual review pending'
    for module in modules:
        module.collection.hide_render = module is not modules[0]
        module.collection.hide_viewport = module is not modules[0]
    bpy.ops.wm.save_as_mainfile(filepath=str(out / 'source.blend'))
    result = {'schema': 'sidereal.armor-cassette-hull-native.v1', 'revision': REVISION, 'stage': 'initial-independent-review-proof',
              'models': records, 'source': 'source.blend', 'sourceSha256': digest(out / 'source.blend'),
              'recipeSha256': digest(__file__), 'textureTexelsPerMetre': TEXELS_PER_METRE,
              'maps': [{'path': str(p.relative_to(out)), 'sha256': digest(p)} for p in sorted((out / 'textures').glob('*.png'))],
              'sourceDependencies': [{'path': str(interface_path.relative_to(ROOT)), 'sha256': digest(interface_path)}],
              'interfaceProvenance': {'sourceCatalogSha256': interfaces['sourceCatalogSha256'],
                                      'currentCatalogAvailableAndBoundsMatched': current_catalogue.exists()},
              'limits': ['No live publication or authority changes.',
              'Separate inboard liner and exterior armor groups; no opaque glazing cover.',
              'Independent visual review required before full-family propagation.',
              'No pressure/collision/damage qualification from these visible surfaces.']}
    (out / 'models.json').write_text(json.dumps(result, indent=2) + '\n')
    return records


if __name__ == '__main__':
    build_all(sys.argv[sys.argv.index('--') + 1])
