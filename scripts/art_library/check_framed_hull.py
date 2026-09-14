"""Read and validate exported framed hull GLB bytes independently of Blender."""
import argparse
import hashlib
import json
import math
from pathlib import Path

from check_hull_voxel_study import (
    accessor, buffer_view, identity, multiply, node_matrix, read_glb, scene_meshes,
)


def check(directory):
    base = Path(directory)
    manifest = json.loads((base/'models.json').read_text())
    results = []
    for record in manifest['models']:
        data, doc, binary = read_glb(base/record['path'])
        assert hashlib.sha256(data).hexdigest() == record['sha256']
        world = {}

        def visit(index, parent):
            node = doc['nodes'][index]
            transform = multiply(parent,node_matrix(node))
            world[node['name']] = transform
            assert all(abs(v-1) < 1e-7 for v in node.get('scale',[1,1,1])), 'Scaled node'
            for child in node.get('children',[]):
                visit(child,transform)

        for root in doc['scenes'][doc.get('scene',0)]['nodes']:
            visit(root,identity())
        for name, socket in record['sockets'].items():
            assert name in world, ('Missing exact socket',record['slug'],name)
            matrix = world[name]
            actual = [matrix[0][3],-matrix[2][3],matrix[1][3]]
            assert max(abs(a-b) for a,b in zip(actual,socket['position'])) < 1e-6
        points, triangles, primitive_count = [],0,0
        for mesh, transform in scene_meshes(doc):
            assert mesh['primitives']
            for prim in mesh['primitives']:
                primitive_count += 1
                assert prim.get('mode',4) == 4
                local = accessor(doc,binary,prim['attributes']['POSITION'])
                transformed = []
                for position in local:
                    v = tuple(sum(transform[i][j]*(*position,1)[j] for j in range(4)) for i in range(3))
                    assert all(math.isfinite(c) for c in v)
                    transformed.append(v)
                    points.append((v[0],-v[2],v[1]))
                normals = accessor(doc,binary,prim['attributes']['NORMAL'])
                assert all(abs(sum(c*c for c in n)-1) < 2e-4 for n in normals)
                indices = [row[0] for row in accessor(doc,binary,prim['indices'])]
                assert len(indices)%3 == 0
                for i in range(0,len(indices),3):
                    a,b,c = (transformed[k] for k in indices[i:i+3])
                    ab,ac = [b[k]-a[k] for k in range(3)],[c[k]-a[k] for k in range(3)]
                    cross = (ab[1]*ac[2]-ab[2]*ac[1],ab[2]*ac[0]-ab[0]*ac[2],ab[0]*ac[1]-ab[1]*ac[0])
                    assert sum(v*v for v in cross)>1e-18, 'Degenerate triangle'
                    triangles += 1
                material = doc['materials'][prim['material']]
                basecolor = material.get('pbrMetallicRoughness',{}).get('baseColorTexture')
                if 'sign' in material['name']:
                    assert basecolor and basecolor.get('texCoord',0) > 0, 'Sign must select its dedicated UV layer'
        bounds = {'min':[min(v[i] for v in points) for i in range(3)],
                  'max':[max(v[i] for v in points) for i in range(3)]}
        for k in bounds:
            assert max(abs(a-b) for a,b in zip(bounds[k],record['bounds'][k])) < 2e-6
        assert triangles == record['triangles']
        if record['family'] == 'side':
            expected = {'min':[0,-record['widthM']/2,0], 'max':[.5,record['widthM']/2,record['heightM']]}
            for k in bounds:
                assert max(abs(a-b) for a,b in zip(bounds[k],expected[k])) < 2e-6
        else:
            for i in range(3):
                assert bounds['min'][i] >= record['existingBounds']['min'][i]-.0001
                assert bounds['max'][i] <= record['existingBounds']['max'][i]+.0001
        assert len(scene_meshes(doc)) == 1, 'Expected one merged native mesh'
        normal_materials = sum('normalTexture' in m for m in doc['materials'])
        assert normal_materials > 0
        for image in doc['images']:
            assert 'uri' not in image
            assert buffer_view(doc,binary,image['bufferView']).startswith(b'\x89PNG\r\n\x1a\n')
        results.append({'slug':record['slug'],'sha256':record['sha256'],'bounds':bounds,
                        'triangles':triangles,'drawPrimitives':primitive_count,
                        'packedImages':len(doc['images']),'normalMappedMaterials':normal_materials,
                        'exactSockets':list(record['sockets']),'status':'pass'})
    return {'schema':'sidereal.framed-hull-check.v1','models':results,'status':'pass',
            'scope':'Actual GLB hashes, nodes, unit transforms, sockets, bounds, finite nondegenerate triangles, unit normals and packed materials. No live damage/pressure qualification.'}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('directory')
    args = parser.parse_args()
    print(json.dumps(check(args.directory),indent=2))
