"""Split Boolean zero-area surface bridges without bridging any finite opening.

No source vertices move. Only exactly collinear boundary edges may receive
zero-area topology caps. Every resulting component must itself be manifold.
"""
from collections import defaultdict
import numpy as np
import manifold3d as m


def components_without_zero_area_bridges(solid):
    native = solid.to_mesh64()
    vertices = np.asarray(native.vert_properties)[:, :3]
    faces = np.asarray(native.tri_verts)
    xyz = vertices[faces]
    area_vectors = np.cross(xyz[:, 1]-xyz[:, 0], xyz[:, 2]-xyz[:, 0])
    keep = np.any(area_vectors != 0, axis=1)
    if keep.all():
        return solid.decompose(), {'removedZeroAreaFaces': 0, 'addedZeroAreaFaces': 0, 'verticesMoved': 0}
    faces = faces[keep]
    parent = list(range(len(faces)))
    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i
    edges = defaultdict(list)
    for i, face in enumerate(faces):
        for u, v in zip(face, np.roll(face, -1)):
            edges[tuple(sorted((int(u), int(v))))].append(i)
    for adjacent in edges.values():
        if len(adjacent) == 2:
            parent[find(adjacent[0])] = find(adjacent[1])
        elif len(adjacent) > 2:
            raise ValueError('Non-manifold positive-area input edge')
    groups = defaultdict(list)
    for i in range(len(faces)):
        groups[find(i)].append(i)
    result = []
    added = 0
    for indexes in groups.values():
        part = faces[indexes].tolist()
        directed = defaultdict(list)
        for face in part:
            for u, v in zip(face, face[1:]+face[:1]):
                directed[tuple(sorted((u, v)))].append((u, v))
        boundary = [values[0] for values in directed.values() if len(values) == 1]
        outgoing = defaultdict(list)
        for u, v in boundary:
            outgoing[u].append(v)
        while any(outgoing.values()):
            start = next(u for u, targets in outgoing.items() if targets)
            loop = [start]
            node = outgoing[start].pop()
            while node != start:
                loop.append(node)
                if not outgoing[node]:
                    raise ValueError('Open boundary chain cannot receive a topology cap')
                node = outgoing[node].pop()
            while len(loop) >= 3:
                ear = None
                for i, current in enumerate(loop):
                    previous = loop[i-1]
                    following = loop[(i+1) % len(loop)]
                    if not np.any(np.cross(vertices[following]-vertices[previous], vertices[current]-vertices[previous])):
                        ear = i
                        cap = [previous, following, current]
                        if len(set(cap)) == 3:
                            part.append(cap)
                            added += 1
                        break
                if ear is None:
                    raise ValueError('Refusing a positive-area boundary cap')
                loop.pop(ear)
        used, remap = np.unique(np.asarray(part), return_inverse=True)
        component = m.Manifold(m.Mesh64(np.array(vertices[used], dtype=np.float64),
                                      np.array(remap.reshape(-1, 3), dtype=np.uint64)))
        if component.status() != m.Error.NoError:
            raise ValueError('Zero-area normalization did not produce a closed manifold: '+str(component.status()))
        result.append(component)
    difference = abs(sum(p.volume() for p in result)-solid.volume())
    if difference > max(1e-8, abs(solid.volume())*1e-12):
        raise ValueError('Zero-area normalization changed signed volume')
    return result, {'removedZeroAreaFaces': int((~keep).sum()), 'addedZeroAreaFaces': added,
                    'verticesMoved': 0, 'positiveAreaFacesAdded': 0, 'signedVolumeDifferenceM3': difference}
