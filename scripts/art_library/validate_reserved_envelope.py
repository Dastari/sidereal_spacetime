"""Fail closed when authored export exceeds its declared convex footprint/prism.

Author coordinates are metres, XY deck/Z up. No recentering, scaling or placement
repair is performed. The tiny tolerance covers GLB float32 encoding only.
"""
import math
from validate_cargo_carriers import digest, triangles

ENCODING_TOLERANCE_M = 1e-6


def qualify_points(points, footprint, bottom, top):
    if not 3 <= len(footprint) <= 64:
        raise ValueError('Explicit convex reserved polygon required')
    values = [bottom, top] + [v for p in footprint for v in p]
    if any(len(p) != 2 for p in footprint) or not all(math.isfinite(v) for v in values) or bottom >= top:
        raise ValueError('Invalid finite reserved volume')
    area = sum(a[0]*b[1]-a[1]*b[0] for a,b in zip(footprint, footprint[1:]+footprint[:1]))
    if abs(area) < 1e-10:
        raise ValueError('Reserved polygon is degenerate')
    direction = 1 if area > 0 else -1
    edges = list(zip(footprint, footprint[1:]+footprint[:1]))
    # Convexity makes vertex containment sufficient for every exported triangle.
    # Concave shapes require decomposition into declared convex cells, not AABBs.
    for a,b in edges:
        length = math.hypot(b[0]-a[0], b[1]-a[1])
        if length < 1e-9:
            raise ValueError('Reserved polygon has a repeated vertex')
        if any(direction*((b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0])) < -1e-10 for p in footprint):
            raise ValueError('Reserved polygon must be convex')
    count = 0
    lower = [math.inf]*3
    upper = [-math.inf]*3
    for point in points:
        if len(point) != 3 or not all(math.isfinite(v) for v in point):
            raise ValueError('Non-finite exported vertex')
        count += 1
        for i in range(3):
            lower[i] = min(lower[i], point[i]); upper[i] = max(upper[i], point[i])
        if point[2] < bottom-ENCODING_TOLERANCE_M or point[2] > top+ENCODING_TOLERANCE_M:
            raise ValueError('Exported geometry exceeds reserved height')
        for a,b in edges:
            distance = direction*((b[0]-a[0])*(point[1]-a[1])-(b[1]-a[1])*(point[0]-a[0]))/math.hypot(b[0]-a[0], b[1]-a[1])
            if distance < -ENCODING_TOLERANCE_M:
                raise ValueError('Exported geometry exceeds reserved footprint')
    if count == 0:
        raise ValueError('Empty exported geometry')
    return {'verticesChecked':count, 'nativeBoundsM':{'min':lower,'max':upper}}


def qualify_glb(path, footprint, bottom, top):
    faces, doc = triangles(path)
    visited = set()
    def visit(index):
        if index in visited:
            raise ValueError('Shared or cyclic export node is unsupported')
        visited.add(index)
        for child in doc['nodes'][index].get('children', []):
            visit(child)
    for index in doc['scenes'][doc.get('scene', 0)]['nodes']:
        visit(index)
    used_meshes = {doc['nodes'][i]['mesh'] for i in visited if 'mesh' in doc['nodes'][i]}
    if used_meshes != set(range(len(doc.get('meshes', [])))) or any('mesh' in n and i not in visited for i,n in enumerate(doc['nodes'])):
        raise ValueError('Unverified geometry outside the default exported scene')
    if any('skin' in doc['nodes'][i] for i in visited) or any(p.get('targets') for m in doc.get('meshes',[]) for p in m['primitives']):
        raise ValueError('Deformed export needs a declared swept-envelope qualification')
    result = qualify_points((p for _,face in faces for p in face), footprint, bottom, top)
    return {**result,'glbSha256':digest(path),'reservedFootprintM':footprint,'reservedBottomM':bottom,'reservedTopM':top,
            'coordinateFrame':'native author XY deck/Z up; unchanged pivot','placementRepairApplied':False,
            'encodingToleranceM':ENCODING_TOLERANCE_M,'entireDefaultSceneQualified':True}
