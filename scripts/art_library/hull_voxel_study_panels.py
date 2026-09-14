"""Blender-authored material/geometry study; never installs native runtime assets.

build_panel(style, height, state, out_dir) returns a local-X-outward Empty.
Source solids remain editable in a hidden collection. Derived occupancy is a
separate representation. Metric UVs repeat at 2m x .75m; heights never stretch.
"""
from __future__ import annotations

import json
import hashlib
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree

sys.path.insert(0, str(Path(__file__).resolve().parent))
from hull_voxel_study_damage import damage_cells, mesh_cells
from hull_voxel_study_height import panel_layout

CELL = .0625
ROLES = ['fracture_core', 'pale_enamel', 'indigo_frame', 'burgundy_cover', 'cyan_indicator', 'amber_indicator']
COLORS = [(.105, .12, .15, 1), (.72, .75, .81, 1), (.105, .12, .205, 1), (.40, .065, .095, 1), (.035, .74, .82, 1), (.92, .46, .055, 1)]
_CACHE = {}


def _images(out_dir):
    """Explicit image-backed authored finish: enamel, channels, screws, vents.
    These are created as Blender Image datablocks, packed, and exported in GLB.
    No unavailable shader-only procedural nodes are used in exported materials.
    """
    key = str(Path(out_dir).resolve())
    if key in _CACHE:
        return _CACHE[key]
    target = Path(out_dir) / 'textures'
    target.mkdir(parents=True, exist_ok=True)
    w, h = 512, 192
    colors, heights, rough = [], [], []
    for iz in range(h):
        z = (iz + .5) / h * .75
        for iy in range(w):
            y = (iy + .5) / w * 2 - 1
            edge = abs(y) > .93 or z < .025 or z > .725
            seam = abs(y) < .012 or abs(z - .375) < .009
            cover = .14 < y < .70 and .12 < z < .30
            vent = -.75 < y < -.23 and .48 < z < .61 and (int((y + .75) / .045) % 2 == 0)
            screw = any((y - by)**2 + (z - bz)**2 < .014**2 for by in [-.87, -.065, .065, .87] for bz in [.065, .335, .415, .685])
            cyan = -.74 < y < -.55 and .083 < z < .096
            amber = .75 < y < .84 and .09 < z < .113
            c = COLORS[2] if edge or seam else COLORS[3] if cover else COLORS[0] if vent or screw else COLORS[4] if cyan else COLORS[5] if amber else COLORS[1]
            # Subtle fixed-scale enamel grain, never topology or damage noise.
            grain = 1 + .012 * math.sin(iy * 1.73 + iz * 3.41)
            colors.extend([c[0]*grain, c[1]*grain, c[2]*grain, 1])
            heights.append(-.0025 if seam or vent else -.0018 if screw else .001 if cover else 0)
            r = .62 if vent or seam else .43 if cover else .36
            rough.extend([r, r, r, 1])
    normals = []
    for iz in range(h):
        for iy in range(w):
            dx = (heights[iz*w+(iy+1)%w] - heights[iz*w+(iy-1)%w]) / (4/w)
            dy = (heights[((iz+1)%h)*w+iy] - heights[((iz-1)%h)*w+iy]) / (1.5/h)
            n = Vector((-dx, -dy, 1)).normalized()
            normals.extend([.5*n.x+.5, .5*n.y+.5, .5*n.z+.5, 1])
    results = []
    for kind, values in [('basecolor', colors), ('normal', normals), ('roughness', rough)]:
        image = bpy.data.images.new(f'Hull-study-{kind}', width=w, height=h, alpha=True)
        image.colorspace_settings.name = 'sRGB' if kind == 'basecolor' else 'Non-Color'
        image.pixels.foreach_set(values)
        image.filepath_raw = str(target / f'panel-{kind}.png')
        image.file_format = 'PNG'
        image.save()
        image.pack()
        results.append(image)
    _CACHE[key] = results
    return results


def materials(out_dir):
    images = _images(out_dir)
    result = []
    for i, role in enumerate(ROLES):
        name = f'Hull-study-{role}'
        mat = bpy.data.materials.get(name)
        if mat is None:
            mat = bpy.data.materials.new(name)
            mat.use_nodes = True
            p = mat.node_tree.nodes.get('Principled BSDF')
            p.inputs['Base Color'].default_value = COLORS[i]
            p.inputs['Roughness'].default_value = .45 if i else .77
            p.inputs['Metallic'].default_value = .1 if i else .32
            if i == 1:
                color, normal, roughness = [mat.node_tree.nodes.new('ShaderNodeTexImage') for _ in range(3)]
                color.image, normal.image, roughness.image = images
                for node in [color, normal, roughness]:
                    node.interpolation = 'Linear'
                    node.extension = 'REPEAT'
                nm = mat.node_tree.nodes.new('ShaderNodeNormalMap')
                nm.inputs['Strength'].default_value = 1
                mat.node_tree.links.new(color.outputs['Color'], p.inputs['Base Color'])
                mat.node_tree.links.new(normal.outputs['Color'], nm.inputs['Color'])
                mat.node_tree.links.new(nm.outputs['Normal'], p.inputs['Normal'])
                mat.node_tree.links.new(roughness.outputs['Color'], p.inputs['Roughness'])
            if i in (4, 5):
                p.inputs['Emission Color'].default_value = COLORS[i]
                p.inputs['Emission Strength'].default_value = .55
        result.append(mat)
    return result


def voxel_materials(out_dir, base_materials):
    """One visible paint texel per 62.5mm material cell; no finer normal relief.
    A/B retain their original high-resolution packed maps and materials.
    """
    name = 'Hull-study-pale_enamel-voxel0625'
    material = bpy.data.materials.get(name)
    if material is None:
        material = base_materials[1].copy()
        material.name = name
        nodes = material.node_tree.nodes
        p = nodes.get('Principled BSDF')
        for link in list(p.inputs['Normal'].links):
            material.node_tree.links.remove(link)
        for node in nodes:
            if node.type != 'TEX_IMAGE' or node.image is None:
                continue
            if 'normal' in node.image.name:
                continue
            source = node.image
            w, h = source.size
            pixels = list(source.pixels[:])
            result = []
            for iz in range(12):
                for iy in range(32):
                    src = (min(h-1,int((iz+.5)*h/12))*w + min(w-1,int((iy+.5)*w/32))) * 4
                    rgba = pixels[src:src+4]
                    if 'basecolor' in source.name:
                        # Stable cell-level enamel variation, not geometry noise.
                        grain = 1 + .035*math.sin(iy*2.13+iz*1.71)
                        rgba = [rgba[0]*grain,rgba[1]*grain,rgba[2]*grain,rgba[3]]
                    result.extend(rgba)
            image = bpy.data.images.new(source.name+'-voxel0625',width=32,height=12,alpha=True)
            image.colorspace_settings.name = source.colorspace_settings.name
            image.pixels.foreach_set(result)
            image.file_format = 'PNG'
            kind = 'basecolor' if 'basecolor' in source.name else 'roughness'
            image.filepath_raw = str(Path(out_dir)/'textures'/f'panel-{kind}-voxel0625.png')
            image.save()
            image.pack()
            node.image = image
            node.interpolation = 'Closest'
    result = list(base_materials)
    result[1] = material
    return result


def metric_uv(obj):
    mesh = obj.data
    uv = mesh.uv_layers.new(name='Metric2mx075m') if not mesh.uv_layers else mesh.uv_layers.active
    for poly in mesh.polygons:
        axis = max(range(3), key=lambda i: abs(poly.normal[i]))
        for li in poly.loop_indices:
            p = mesh.vertices[mesh.loops[li].vertex_index].co
            uv.data[li].uv = ((p.y+1)/2, p.z/.75) if axis == 0 else (p.x/2, p.z/.75) if axis == 1 else ((p.y+1)/2, p.x/.75)


def _box(name, bounds, role, collection, mats, bevel=0):
    x0, x1, y0, y1, z0, z1 = bounds
    verts = [(x0,y0,z0),(x1,y0,z0),(x1,y1,z0),(x0,y1,z0),(x0,y0,z1),(x1,y0,z1),(x1,y1,z1),(x0,y1,z1)]
    faces = [(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)]
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    obj.data.materials.append(mats[role])
    obj['material_role'] = role
    obj['authored_bounds_m'] = list(bounds)
    if bevel:
        mod = obj.modifiers.new('Editable continuous shoulder bevel', 'BEVEL')
        mod.width = bevel
        mod.segments = 4
    metric_uv(obj)
    return obj


def _continuous_shoulder(name, side, height, collection, mats):
    """Editable six-sided chamfer rail, not pre-voxelized geometry.

    The 0.375m-wide cross-section has 0.1875m-long continuous slopes. At
    0.0625m sampling these create multiple real outward-depth steps, unlike a
    sub-cell bevel whose occupancy is indistinguishable from its parent box.
    """
    profile = [(.1875,.625),(.3125,.625),(.5,.75),(.5,.875),(.3125,1),(.1875,1)]
    if side < 0:
        profile = [(x,-y) for x,y in reversed(profile)]
    n = len(profile)
    verts = [(x,y,z) for z in (0,height) for x,y in profile]
    faces = [tuple(reversed(range(n))), tuple(range(n,2*n))]
    faces += [(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts,[],faces)
    mesh.update()
    obj = bpy.data.objects.new(name,mesh)
    collection.objects.link(obj)
    mesh.materials.append(mats[2])
    obj['material_role'] = 2
    obj['source_profile'] = 'continuous six-sided chamfer, 187.5mm sloped shoulder'
    metric_uv(obj)
    return obj


def _master(style, height, key, mats):
    collection = bpy.data.collections.new(f'SOURCE-{key}-editable-solids')
    bpy.context.scene.collection.children.link(collection)
    objs = [_box(f'GEO-{key}-author-base', (0,.25,-1,1,0,height), 1, collection, mats)]
    if style != 'mapped':
        # Full-height rail profiles and fixed-size repeated courses are authored
        # mesh solids. Voxel variant samples a continuous rounded source profile.
        for side in [-1, 1]:
            if style == 'voxel':
                objs.append(_continuous_shoulder(f'GEO-{key}-author-continuous-rail-{side}', side, height, collection, mats))
            else:
                lo, hi = (-1,-.8125) if side < 0 else (.8125,1)
                objs.append(_box(f'GEO-{key}-author-rail-{side}', (.1875,.4375,lo,hi,0,height), 2, collection, mats))
        layout = panel_layout(height)
        for course, course_layout in enumerate(layout['courses']):
            z, top = course_layout['z_min_m'], course_layout['z_max_m']
            kind = course_layout['kind']
            if kind in ('bottom_cap', 'top_cap'):
                objs.append(_box(f'GEO-{key}-author-{kind}', (.1875,.375,-1,1,z,top), 2, collection, mats))
                continue
            # Fixed .25m courses; residual filler is its own exact closed strip.
            objs.append(_box(f'GEO-{key}-author-enamel-{course}', (.1875,.3125,-.8125,.8125,z,top), 1, collection, mats, .065 if style=='voxel' else 0))
            if kind == 'repeat' and course % 3 == 1:
                objs.append(_box(f'GEO-{key}-author-cover-{course}', (.25,.375,.125,.6875,z,z+.1875), 3, collection, mats, .065 if style=='voxel' else 0))
        # Stepped shoulder caps finish the top on exact same 1/16m lattice.
        for step in range(3):
            for side in [-1, 1]:
                lo, hi = (1-(step+1)*CELL, 1-step*CELL) if side > 0 else (-1+step*CELL,-1+(step+1)*CELL)
                objs.append(_box(f'GEO-{key}-author-shoulder-{side}-{step}', (.25,.5-step*CELL,lo,hi,height-(3-step)*CELL,height), 1, collection, mats))
    bpy.context.view_layer.update()
    return collection, objs


def _sample_sources(objects):
    occupancy = {}
    dg = bpy.context.evaluated_depsgraph_get()
    for obj in objects:
        evaluated = obj.evaluated_get(dg)
        mesh = evaluated.to_mesh()
        verts = [v.co.copy() for v in mesh.vertices]
        tree = BVHTree.FromPolygons(verts, [list(p.vertices) for p in mesh.polygons], all_triangles=False)
        ranges = [range(math.floor(min(v[i] for v in verts)/CELL), math.ceil(max(v[i] for v in verts)/CELL)) for i in range(3)]
        for ix in ranges[0]:
            for iy in ranges[1]:
                for iz in ranges[2]:
                    center = Vector(((ix+.5)*CELL,(iy+.5)*CELL,(iz+.5)*CELL))
                    near, normal, _, _ = tree.find_nearest(center)
                    # All authored inputs here are convex, closed solids; nearest
                    # outward surface sign is a robust exact inside predicate.
                    if near is not None and (center-near).dot(normal) <= 1e-8:
                        occupancy[(ix,iy,iz)] = int(obj['material_role'])
        evaluated.to_mesh_clear()
    return occupancy


def _derived_mesh(name, meshdata, collection, mats):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(meshdata.vertices, [], meshdata.faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    for mat in mats:
        mesh.materials.append(mat)
    for poly, material in zip(mesh.polygons, meshdata.material_indices):
        poly.material_index = material
    metric_uv(obj)
    return obj


def build_panel(style, height, state, out_dir):
    """Build specimen in scene; write immutable-by-caller occupancy metadata.
    style mapped|stepped|voxel, state intact|breach|explosive (small alias allowed).
    Root contains only visible derivatives and attachment Empty sockets. Source
    collection is preserved hidden separately in caller's saved .blend file.
    """
    if style not in ('mapped','stepped','voxel'):
        raise ValueError(f'Unknown style {style}')
    layout = panel_layout(height)
    state = 'breach' if state == 'small' else state
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    key = f'{style}-h{round(height*100):03d}-{state}'
    mats = materials(out_dir)
    if style == 'voxel':
        mats = voxel_materials(out_dir,mats)
    source_collection, sources = _master(style, height, key, mats)
    occupancy = _sample_sources(sources)
    damage = damage_cells(occupancy, state=state, center_yz=(0,round(height/CELL)//2))
    root = bpy.data.objects.new(f'PANEL-{key}', None)
    bpy.context.scene.collection.objects.link(root)
    root['study_style'] = style
    root['study_state'] = state
    root['cell_size_m'] = CELL
    root['height_m'] = height
    root['texture_course_m'] = .75
    root['damage_is_offline_study'] = True
    render_collection = bpy.data.collections.new(f'RENDER-{key}')
    bpy.context.scene.collection.children.link(render_collection)
    if state == 'intact' and style == 'mapped':
        for src in sources:
            obj = src.copy()
            obj.data = src.data.copy()
            obj.name = src.name.replace('-author-', '-render-')
            render_collection.objects.link(obj)
            obj.parent = root
    else:
        geom = mesh_cells(damage.retained, original=occupancy, core_material=0)
        obj = _derived_mesh(f'GEO-{key}-exposed-solid', geom, render_collection, mats)
        obj.parent = root
    for name, xyz in [('base',(0,0,0)),('top',(0,0,height)),('left',(0,-1,0)),('right',(0,1,0))]:
        socket = bpy.data.objects.new(f'SOCKET-{key}-{name}', None)
        render_collection.objects.link(socket)
        socket.parent = root
        socket.location = xyz
        socket.empty_display_size = .075
        socket['interface'] = 'study-panel-attachment-v1'
    source_collection.hide_render = True
    source_collection.hide_viewport = True
    occupancy_json = {
        'schema':'sidereal.hull-voxel-study.occupancy.v1','style':style,'height_m':height,'state':state,
        'cell_size_m':CELL,'origin_m':[0,0,0], 'roles':ROLES,
        'source':'editable Blender closed solids; evaluated convex surface sampling',
        'height_layout':layout,
        'occupancy_sha256':hashlib.sha256(json.dumps([[*k,v] for k,v in sorted(occupancy.items())],separators=(',',':')).encode()).hexdigest(),
        'source_revision':'r002-continuous-chamfer-shoulder',
        'finish_texel_m': CELL if style == 'voxel' else 2/512,
        'normal_mapping':style != 'voxel',
        'original':[[*k,v] for k,v in sorted(occupancy.items())],
        'retained':[[*k,v] for k,v in sorted(damage.retained.items())],
        'removed':[[*k,v] for k,v in sorted(damage.removed.items())],
        'conservation':len(occupancy)==len(damage.retained)+len(damage.removed),
    }
    (out_dir/f'{key}.occupancy.json').write_text(json.dumps(occupancy_json,separators=(',',':'))+'\n')
    root['occupancy_path'] = str(out_dir/f'{key}.occupancy.json')
    root['original_cell_count'] = len(occupancy)
    root['occupancy_sha256'] = occupancy_json['occupancy_sha256']
    root['removed_cell_count'] = len(damage.removed)
    root['render_vertices'] = sum(len(o.data.vertices) for o in root.children_recursive if o.type == 'MESH')
    root['render_triangles'] = sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in root.children_recursive if o.type == 'MESH')
    root['height_layout_json'] = json.dumps(layout,separators=(',',':'))
    return root


def export_panel(root, path):
    """Export visible specimen and sockets, excluding hidden editable masters."""
    bpy.ops.object.select_all(action='DESELECT')
    root.select_set(True)
    for obj in root.children_recursive:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = root
    bpy.ops.export_scene.gltf(filepath=str(path), export_format='GLB', use_selection=True,
        export_apply=True, export_extras=True, export_yup=True, export_texcoords=True,
        export_normals=True, export_materials='EXPORT', export_cameras=False,
        export_lights=False)
