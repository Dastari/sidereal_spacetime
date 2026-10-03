"""Derive real post lens apertures from the immutable r001 GLBs in Blender.

Only trim and recess geometry changes. All other primitive buffers and the
complete source material definitions stay byte-exact. Inputs are never written.
Run: blender -b --python this.py -- --root REPO --output NEW_DIRECTORY
"""
import argparse
import hashlib
import json
from pathlib import Path
import struct
import sys

PINS = {
    'pink': '68d982ae6adf2ffd624509f4a0e3e43ef885ffc5915e17210199cdc5d944e8a1',
    'white': 'ad5be49bcc75908fcd6888ab54cb1dc21062594117e0f149b9111d9cbf25933d',
}


def document(raw):
    size = struct.unpack_from('<I', raw, 12)[0]
    return json.loads(raw[20:20 + size]), bytearray(raw[28 + size:])


def accessor(doc, binary, index):
    acc = doc['accessors'][index]
    view = doc['bufferViews'][acc['bufferView']]
    widths = {'SCALAR': 1, 'VEC3': 3}
    formats = {5123: 'H', 5125: 'I', 5126: 'f'}
    width = widths[acc['type']]
    fmt = '<' + formats[acc['componentType']] * width
    size = struct.calcsize(fmt)
    start = view.get('byteOffset', 0) + acc.get('byteOffset', 0)
    return [struct.unpack_from(fmt, binary, start + i * view.get('byteStride', size)) for i in range(acc['count'])]


def append_accessor(doc, binary, rows, kind, component=5126):
    while len(binary) % 4:
        binary.append(0)
    start = len(binary)
    fmt = '<' + ({5125: 'I', 5126: 'f'}[component]) * len(rows[0])
    for row in rows:
        binary.extend(struct.pack(fmt, *row))
    doc['bufferViews'].append({'buffer': 0, 'byteOffset': start, 'byteLength': len(binary) - start})
    acc = {'bufferView': len(doc['bufferViews']) - 1, 'componentType': component, 'count': len(rows), 'type': kind}
    if kind == 'VEC3':
        acc['min'] = [min(row[c] for row in rows) for c in range(3)]
        acc['max'] = [max(row[c] for row in rows) for c in range(3)]
    doc['accessors'].append(acc)
    return len(doc['accessors']) - 1


def trim_aperture(positions, indices):
    import bpy
    import bmesh
    # Authoring Z-up coordinates. Both face apertures are actual Boolean holes.
    mesh = bpy.data.meshes.new('GEO-post-trim')
    mesh.from_pydata([(x, -z, y) for x, y, z in positions], [], [indices[i:i + 3] for i in range(0, len(indices), 3)])
    obj = bpy.data.objects.new('GEO-post-trim', mesh)
    bpy.context.collection.objects.link(obj)
    bpy.context.view_layer.objects.active = obj
    for side in (-1, 1):
        bpy.ops.mesh.primitive_cube_add(size=1, location=(0, side * 0.255, 0.46))
        cutter = bpy.context.object
        cutter.name = 'GEO-post-aperture-cutter'
        cutter.dimensions = (0.092, 0.06, 0.364)
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        bpy.context.view_layer.objects.active = obj
        mod = obj.modifiers.new('True recessed lens aperture', 'BOOLEAN')
        mod.operation = 'DIFFERENCE'
        mod.solver = 'EXACT'
        mod.object = cutter
        bpy.ops.object.modifier_apply(modifier=mod.name)
        bpy.data.objects.remove(cutter, do_unlink=True)
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.triangulate(bm, faces=list(bm.faces))
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update()
    positions, normals, indices = [], [], []
    for polygon in obj.data.polygons:
        for loop_index in polygon.loop_indices:
            loop = obj.data.loops[loop_index]
            v = obj.data.vertices[loop.vertex_index].co
            n = polygon.normal
            indices.append(len(positions))
            positions.append((v.x, v.z, -v.y))
            normals.append((n.x, n.z, -n.y))
    bpy.data.objects.remove(obj, do_unlink=True)
    return positions, normals, indices


def derive(raw):
    doc, binary = document(raw)
    for primitive in doc['meshes'][0]['primitives']:
        name = doc['materials'][primitive['material']]['name']
        if name == 'trim':
            positions = accessor(doc, binary, primitive['attributes']['POSITION'])
            indices = [row[0] for row in accessor(doc, binary, primitive['indices'])]
            positions, normals, indices = trim_aperture(positions, indices)
            primitive['attributes'] = {'POSITION': append_accessor(doc, binary, positions, 'VEC3'), 'NORMAL': append_accessor(doc, binary, normals, 'VEC3')}
            primitive['indices'] = append_accessor(doc, binary, [(i,) for i in indices], 'SCALAR', 5125)
        elif name == 'dark':
            positions = accessor(doc, binary, primitive['attributes']['POSITION'])
            # The narrow lamp recess is a disconnected component of this primitive;
            # x-side doorway reveals remain exact. Recess backing front at 0.252,
            # lens front at 0.258: six millimetres of physical separation.
            corrected = [(x, y, (-1 if z < 0 else 1) * (0.248 + (abs(z) - 0.24) * 0.004 / 0.022))
                         if abs(x) < 0.046 and 0.279 < y < 0.641 else (x, y, z)
                         for x, y, z in positions]
            primitive['attributes']['POSITION'] = append_accessor(doc, binary, corrected, 'VEC3')
    doc['buffers'][0]['byteLength'] = len(binary)
    while len(binary) % 4:
        binary.append(0)
    encoded = json.dumps(doc, separators=(',', ':')).encode()
    encoded += b' ' * (-len(encoded) % 4)
    return (struct.pack('<III', 0x46546c67, 2, 28 + len(encoded) + len(binary))
            + struct.pack('<II', len(encoded), 0x4e4f534a) + encoded
            + struct.pack('<II', len(binary), 0x004e4942) + binary)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--root', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
    if args.output.exists():
        raise ValueError('Derivative output already exists; do not overwrite')
    args.output.mkdir(parents=True)
    pieces = []
    for cap, pin in PINS.items():
        source = args.root / f'assets/runtime/ship-study/wayfarer-authored-r001/glb/int/post/int.post.{cap}.glb'
        raw = source.read_bytes()
        if hashlib.sha256(raw).hexdigest() != pin:
            raise ValueError('Changed immutable post source')
        output = derive(raw)
        destination = args.output / f'int.post.{cap}.aperture.glb'
        destination.write_bytes(output)
        doc, _ = document(output)
        triangles = sum(doc['accessors'][p['indices']]['count'] // 3 for p in doc['meshes'][0]['primitives'])
        pieces.append({'id': f'int.post.{cap}', 'file': destination.name, 'sha256': hashlib.sha256(output).hexdigest(), 'sourceSha256': pin, 'triangles': triangles, 'frame': 'piece-local'})
        assert source.read_bytes() == raw
    descriptor = {'schema': 'sidereal.wayfarer-details.r001', 'operation': 'Blender trim aperture; recessed dark backing; unchanged source caps/body/lenses/materials', 'pieces': pieces}
    (args.output / 'descriptor.json').write_text(json.dumps(descriptor, indent=2) + '\n')
    print(json.dumps(descriptor))


if __name__ == '__main__':
    main()
