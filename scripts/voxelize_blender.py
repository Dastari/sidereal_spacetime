"""Deterministic solid voxel sampling of evaluated, watertight Blender meshes.

Coordinates are meters, X east / Y north / Z up. Each object must be a closed
solid. Overlapping solids are unioned; higher voxel_priority wins. Material
constants are preserved, including linear emission and strength. Linked shader
inputs must be baked/converted before this pass; silently losing them is forbidden.
"""
from collections import Counter
import math
from mathutils import Vector
from mathutils.bvhtree import BVHTree
import bpy


def material_record(material):
    if not material or not material.use_nodes:
        raise ValueError('Every source mesh needs a Principled material')
    nodes = [n for n in material.node_tree.nodes if n.type == 'BSDF_PRINCIPLED']
    if len(nodes) != 1:
        raise ValueError(f'{material.name}: use one Principled surface')
    shader = nodes[0]
    fields = {'color': 'Base Color', 'metallic': 'Metallic', 'roughness': 'Roughness',
              'emission': 'Emission Color', 'emissionStrength': 'Emission Strength'}
    record = {'name': material.name, 'voxelMaterialId': int(material.get('voxel_material_id', 0))}
    for key, socket in fields.items():
        value = shader.inputs[socket]
        if value.is_linked:
            raise ValueError(f'{material.name}: bake linked {socket} before voxelization')
        record[key] = list(value.default_value)[:3] if key in ('color', 'emission') else float(value.default_value)
    if (shader.inputs['Alpha'].is_linked or shader.inputs['Alpha'].default_value < 1
            or shader.inputs['Transmission Weight'].is_linked
            or shader.inputs['Transmission Weight'].default_value > 0):
        raise ValueError(f'{material.name}: transparent solids need an explicit glass pass')
    return record


def voxelize(objects, cell_meters, max_samples=8_000_000):
    if not math.isfinite(cell_meters) or cell_meters <= 0:
        raise ValueError('Cell size must be positive and finite')
    cells, palette, material_ids = {}, [None], {}
    report = []
    depsgraph = bpy.context.evaluated_depsgraph_get()
    examined = 0
    for obj in sorted(objects, key=lambda o: (int(o.get('voxel_priority', 0)), o.name)):
        if obj.type != 'MESH' or obj.hide_render:
            continue
        evaluated = obj.evaluated_get(depsgraph)
        mesh = evaluated.to_mesh()
        try:
            vertices = [evaluated.matrix_world @ v.co for v in mesh.vertices]
            polygons = [list(p.vertices) for p in mesh.polygons]
            edges = Counter(tuple(sorted((face[i], face[(i+1) % len(face)])))
                            for face in polygons for i in range(len(face)))
            if not edges or any(count != 2 for count in edges.values()):
                raise ValueError(f'{obj.name}: open or non-manifold solid; repair or Solidify first')
            ids = []
            for mat in mesh.materials:
                if mat.name not in material_ids:
                    if len(palette) >= 256:
                        raise ValueError('Voxel material palette exceeds 255 materials')
                    material_ids[mat.name] = len(palette)
                    palette.append(material_record(mat))
                ids.append(material_ids[mat.name])
            if not ids or any(p.material_index >= len(ids) for p in mesh.polygons):
                raise ValueError(f'{obj.name}: missing material slot')
            tree = BVHTree.FromPolygons(vertices, polygons, all_triangles=False)
            low = [math.floor(min(v[a] for v in vertices)/cell_meters) for a in range(3)]
            high = [math.ceil(max(v[a] for v in vertices)/cell_meters) for a in range(3)]
            examined += math.prod(high[a]-low[a] for a in range(3))
            if examined > max_samples:
                raise ValueError('Voxel sampling budget exceeded; split asset or reduce resolution')
            sampled = 0
            # Scan closed-solid intervals along +X; inspect material at the nearest
            # surface for each occupied center. Opposite wall faces may differ.
            for z in range(low[2], high[2]):
                for y in range(low[1], high[1]):
                    origin = Vector(((low[0]-1)*cell_meters, (y+.5)*cell_meters, (z+.5)*cell_meters))
                    hits = []
                    for _ in range(1024):
                        location, _, _, _ = tree.ray_cast(origin, Vector((1, 0, 0)))
                        if location is None:
                            break
                        hits.append(location.x)
                        # BVH uses float precision; sub-micron advances can re-hit a bevel face.
                        origin.x = location.x + max(cell_meters*1e-4, 1e-6)
                    else:
                        raise ValueError(f'{obj.name}: ray intersection budget exceeded')
                    if len(hits) % 2:
                        raise ValueError(f'{obj.name}: ambiguous solid at scanline {y},{z}; repair geometry')
                    for start, end in zip(hits[::2], hits[1::2]):
                        for x in range(math.ceil(start/cell_meters-.5), math.ceil(end/cell_meters-.5)):
                            center = Vector(((x+.5)*cell_meters, (y+.5)*cell_meters, (z+.5)*cell_meters))
                            _, _, face, _ = tree.find_nearest(center)
                            cells[(x, y, z)] = ids[mesh.polygons[face].material_index]
                            sampled += 1
            if sampled == 0:
                raise ValueError(f'{obj.name}: no occupied samples; thicken small details or increase resolution')
            report.append({'object': obj.name, 'sampled': sampled})
        finally:
            evaluated.to_mesh_clear()
    if not cells:
        raise ValueError('No voxel geometry selected')
    return {'schema': 'sidereal.sampled-solid.v1', 'cellMeters': cell_meters,
            'axes': 'X east, Y north, Z up', 'palette': palette,
            'cells': [[*key, value] for key, value in sorted(cells.items())], 'objects': report}
