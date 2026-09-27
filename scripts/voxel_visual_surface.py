"""Presentation-only welding and micro-bevels; never rewrites occupied cells."""
import bisect
import math
import bpy
import bmesh

def welded_surface(part):
    # Greedy rectangle meshing has T-junctions at material/chunk boundaries.
    # Split every axis-aligned edge at existing collinear vertices before weld.
    points = list(dict.fromkeys(tuple(round(c, 7) for c in p) for p in part['vertices']))
    ids = {p:i for i,p in enumerate(points)}
    lines = {}
    for p in points:
        for axis in range(3):
            key = (axis, p[(axis+1)%3], p[(axis+2)%3])
            lines.setdefault(key, []).append(p[axis])
    for values in lines.values(): values.sort()
    faces = []
    for face in part['faces']:
        original = [tuple(round(c, 7) for c in part['vertices'][i]) for i in face]
        boundary = []
        for start, end in zip(original, original[1:] + original[:1]):
            boundary.append(ids[start])
            axes = [a for a in range(3) if start[a] != end[a]]
            if len(axes) != 1: continue
            a = axes[0]
            values = lines[(a,start[(a+1)%3],start[(a+2)%3])]
            lo,hi = sorted((start[a],end[a]))
            interior = values[bisect.bisect_right(values,lo):bisect.bisect_left(values,hi)]
            if end[a] < start[a]: interior.reverse()
            for value in interior:
                p=list(start);p[a]=value;boundary.append(ids[tuple(p)])
        faces.append(boundary)
    return points,faces

def bevel_surface(obj, cell_meters):
    mesh=obj.data
    mesh.validate(verbose=False)
    bm=bmesh.new();bm.from_mesh(mesh);bm.normal_update()
    # Only genuine manifold convex corners. Flat palette changes and concave
    # sockets stay exact. Non-manifold edge-touch voxels are never bevel inputs.
    weight=bm.edges.layers.float.new('bevel_weight_edge')
    foliage={i for i,m in enumerate(mesh.materials) if m.name == 'MAT-botanical-polymer' or m.name in ('MAT-interior-prop-17','MAT-interior-prop-18','MAT-interior-prop-36','MAT-interior-prop-38')}
    eligible=0
    for edge in bm.edges:
        botanical = bool(foliage) and all(f.material_index in foliage for f in edge.link_faces)
        threshold = cell_meters * 2
        if not botanical and edge.is_manifold and edge.is_convex and edge.calc_face_angle(0) > .4 and edge.calc_length() >= threshold - 1e-7 and all(v.is_manifold for v in edge.verts):
            edge[weight]=1.;eligible+=1
    invalid=sum(not e.is_manifold for e in bm.edges)
    bm.to_mesh(mesh);bm.free()
    modifier=obj.modifiers.new('Visual molded edge radius','BEVEL')
    modifier.width=min(.025,cell_meters*.32)
    modifier.segments=2;modifier.limit_method='WEIGHT'
    modifier.affect='EDGES';modifier.use_clamp_overlap=True
    modifier.loop_slide=True
    obj['visual_bevel_meters']=modifier.width
    obj['bevel_eligible_edges']=eligible
    obj['unbeveled_nonmanifold_edges']=invalid
    # Evaluate a real geometry budget before publishing. The source retains its
    # editable modifier and vertex palette; glTF export applies the modifier.
    evaluated=obj.evaluated_get(bpy.context.evaluated_depsgraph_get()).to_mesh()
    evaluated.calc_loop_triangles()
    triangles=len(evaluated.loop_triangles)
    check=bmesh.new();check.from_mesh(evaluated)
    after_invalid=sum(not e.is_manifold for e in check.edges)
    check.free()
    if after_invalid > invalid:
        raise RuntimeError(f'Bevel opened surface: {obj.name}: {invalid} -> {after_invalid}')
    colors=evaluated.color_attributes.get('palette')
    if colors is None or any(not math.isfinite(c) for entry in colors.data for c in entry.color):
        raise RuntimeError(f'Invalid bevel palette: {obj.name}')
    if triangles > max(20000, len(mesh.polygons)*16):
        raise RuntimeError(f'Bevel triangle budget exceeded: {obj.name}: {triangles}')
    obj.evaluated_get(bpy.context.evaluated_depsgraph_get()).to_mesh_clear()
    return {'name':obj.name,'triangles':triangles,'beveledEdges':eligible,'nonmanifoldEdges':invalid,'evaluatedNonmanifoldEdges':after_invalid}
