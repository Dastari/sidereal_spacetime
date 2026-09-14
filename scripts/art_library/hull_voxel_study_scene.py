"""Build/export then render real comparison specimens, with staged blast debris."""
from pathlib import Path
import hashlib
import json
import math
import random
import sys

import bpy
from mathutils import Vector

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(HERE))
OUT = Path(sys.argv[sys.argv.index('--') + 1])
STAGE = sys.argv[sys.argv.index('--') + 2]
ONLY = sys.argv[sys.argv.index('--') + 3] if len(sys.argv) > sys.argv.index('--') + 3 else None


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def build():
    from hull_voxel_study_panels import build_panel, export_panel
    from hull_voxel_study_height import height_study_layouts
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.preferences.filepaths.save_version = 0
    scene = bpy.context.scene
    scene.unit_settings.system = 'METRIC'
    scene.unit_settings.scale_length = 1
    jobs = [(style, 3.0, state) for style in ('mapped', 'stepped', 'voxel')
            for state in ('intact', 'breach', 'explosive')]
    jobs += [('stepped', row['height_m'], 'intact') for row in height_study_layouts()
             if row['height_m'] != 3.0]
    jobs += [('stepped', .75, 'explosive')]
    specimens = []
    for index, (style, height, state) in enumerate(jobs):
        panel = build_panel(style, height, state, OUT / 'panels')
        slug = panel.name.removeprefix('PANEL-')
        path = OUT / 'panels' / (slug + '.glb')
        if path.exists():
            raise ValueError('Preserve existing export: ' + str(path))
        export_panel(panel, path)
        objects = [o for o in panel.children_recursive if o.type == 'MESH']
        bpy.context.view_layer.update()
        corners = [o.matrix_world @ Vector(v) for o in objects for v in o.bound_box]
        bounds = [[min(v[i] for v in corners) for i in range(3)],
                  [max(v[i] for v in corners) for i in range(3)]]
        if abs(bounds[0][2]) > 1e-6 or abs(bounds[1][2] - height) > 1e-6:
            raise ValueError('Authored panel height does not match its sockets: ' + slug)
        specimens.append({'slug': slug, 'style': style, 'height_m': height,
                          'state': state, 'bounds_m': bounds, 'cell_m': .0625,
                          'glb': str(path.relative_to(OUT)), 'glb_sha256': sha(path),
                          'occupancy': str(Path(panel['occupancy_path']).relative_to(OUT)),
                          'original_cells': panel['original_cell_count'],
                          'removed_cells': panel['removed_cell_count'],
                          'mesh_count': len(objects),
                          'triangles': sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in objects)})
        # The editable source file presents the derived specimens as a board.
        # Individual GLBs and occupancy stay at their exact attachment origins.
        panel.location = (0, (index % 5) * 2.8, (index // 5) * 3.7)
        print(json.dumps({'built': slug, 'bounds': bounds}), flush=True)
    scene['study_status'] = 'Unapproved offline geometry/material/damage comparison; no authority integration'
    bpy.ops.file.pack_all()
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT / 'study.blend'))
    (OUT / 'specimens.json').write_text(json.dumps(specimens, indent=2) + '\n')
    (OUT / 'height-layouts.json').write_text(json.dumps(height_study_layouts(), indent=2) + '\n')


def aim(ob, target):
    ob.rotation_euler = (Vector(target) - ob.location).to_track_quat('-Z', 'Y').to_euler()


def light(name, position, energy, size, color=(1, 1, 1)):
    bpy.ops.object.light_add(type='AREA', location=position)
    ob = bpy.context.object
    ob.name = 'LIGHT-' + name
    ob.data.energy = energy
    ob.data.size = size
    ob.data.color = color
    aim(ob, (0, 0, 1.5))


def material(name, color, emission=0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    p = m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value = (*color, 1)
    p.inputs['Roughness'].default_value = .7
    if emission:
        p.inputs['Emission Color'].default_value = (*color, 1)
        p.inputs['Emission Strength'].default_value = emission
    return m


def box(name, pos, size, mat):
    bpy.ops.mesh.primitive_cube_add(size=1, location=pos)
    ob = bpy.context.object
    ob.name = 'GEO-' + name
    ob.dimensions = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    ob.data.materials.append(mat)
    return ob


def studio():
    s = bpy.context.scene
    s.render.engine = 'CYCLES'
    s.cycles.device = 'CPU'
    s.cycles.samples = 64
    s.cycles.use_denoising = False
    s.render.image_settings.file_format = 'PNG'
    s.render.image_settings.color_mode = 'RGBA'
    s.render.film_transparent = True
    s.render.resolution_x, s.render.resolution_y = 640, 800
    s.render.resolution_percentage = 100
    s.view_settings.view_transform = 'AgX'
    s.world = bpy.data.worlds.new('Neutral study environment')
    s.world.use_nodes = True
    n = s.world.node_tree.nodes
    env = n.new('ShaderNodeTexEnvironment')
    env.image = bpy.data.images.load(str(ROOT / 'assets/runtime/materials/frontier-workshop.hdr'))
    s.world.node_tree.links.new(env.outputs['Color'], n['Background'].inputs['Color'])
    n['Background'].inputs['Strength'].default_value = .3
    light('key', (5, -4, 7), 750, 5)
    light('fill', (3, 5, 3), 420, 4, (.72, .82, 1))
    light('edge', (-3, 1, 5), 650, 3)
    bpy.ops.object.camera_add(location=(8, -4, 3.8))
    camera = bpy.context.object
    camera.name = 'CAM-hull-technology-comparison'
    camera.data.type = 'ORTHO'
    camera.data.ortho_scale = 3.5
    aim(camera, (.15, 0, 1.5))
    s.camera = camera
    return s, camera


def render_one(specimen):
    slug = specimen['slug']
    target = OUT / 'renders' / (slug + '.png')
    if target.exists():
        return
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(OUT / specimen['glb']))
    s, camera = studio()
    s.render.filepath = str(target)
    bpy.ops.render.render(write_still=True)
    capture = {'renderer': bpy.app.version_string + ' Cycles CPU64 samples',
               'source': specimen['glb'], 'source_sha256': specimen['glb_sha256'],
               'camera': list(camera.location), 'rotation': list(camera.rotation_euler),
               'ortho_scale': camera.data.ortho_scale, 'resolution': [640, 800],
               'stage': 'actual reimported GLB, no painted damage or retouching'}
    (target.with_suffix('.json')).write_text(json.dumps(capture, indent=2) + '\n')
    print(json.dumps({'rendered': slug}), flush=True)


def render_blast(specimen):
    target = OUT / 'renders' / 'stepped-blast-debris.png'
    if target.exists():
        return
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(OUT / specimen['glb']))
    s, camera = studio()
    camera.data.ortho_scale = 4.0
    occupancy = json.loads((OUT / specimen['occupancy']).read_text())
    removed = occupancy['removed']
    rng = random.Random(29014)
    selected = rng.sample(removed, min(64, len(removed)))
    fragments = []
    core = material('MAT-debris-cut-metal', (.24, .27, .32))
    red = material('MAT-debris-painted-cover', (.4, .065, .095))
    pale = material('MAT-debris-enamel', (.72, .75, .81))
    for i, cell in enumerate(selected):
        x, y, z, role = cell
        origin = Vector(((x+.5)*.0625, (y+.5)*.0625, (z+.5)*.0625))
        impulse = Vector((rng.uniform(.3, 1.25), (origin.y-.03)*rng.uniform(.7, 1.5), (origin.z-1.5)*rng.uniform(.7, 1.4)))
        ob = box('removed-cell-' + str(i), origin + impulse, (.0625,)*3,
                 red if role == 3 else pale if role == 1 else core)
        ob.rotation_euler = [rng.uniform(-1.2, 1.2) for _ in range(3)]
        fragments.append({'source_cell': cell, 'position_m': list(ob.location),
                          'rotation': list(ob.rotation_euler)})
    # A deliberately staged block-shaped energy burst. It is cosmetic, while
    # every solid fragment above has a distinct cell in the removed-material set.
    amber = material('MAT-blast-amber', (1, .16, .018), 4)
    hot = material('MAT-blast-hot', (1, .7, .2), 6)
    for i in range(22):
        size = rng.choice((.0625, .125, .1875))
        pos = (.55+rng.random()*.4, -.14+rng.random()*.36, 1.4+rng.random()*.38)
        box('cosmetic-energy-' + str(i), pos, (size,)*3, hot if i < 5 else amber)
    light('blast', (1, 0, 1.5), 65, .45, (1, .19, .035))
    s.use_nodes = True
    nodes, links = s.node_tree.nodes, s.node_tree.links
    glare = nodes.new('CompositorNodeGlare')
    glare.glare_type = 'FOG_GLOW'
    glare.quality = 'HIGH'
    glare.threshold = 1.5
    links.new(nodes['Render Layers'].outputs['Image'], glare.inputs['Image'])
    links.new(glare.outputs['Image'], nodes['Composite'].inputs['Image'])
    s.render.filepath = str(target)
    bpy.ops.render.render(write_still=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT / 'blast-staged.blend'))
    (OUT / 'blast-capture.json').write_text(json.dumps({
        'source': specimen['glb'], 'source_sha256': specimen['glb_sha256'],
        'description': 'Staged visual burst, not a simulated detonation or gameplay claim',
        'cell_m': .0625, 'total_removed_cells': len(removed),
        'visible_fragment_cells': fragments,
        'unvisualized_removed_cells': len(removed)-len(fragments),
        'energy_blocks_are_cosmetic': True,
        'renderer': bpy.app.version_string + ' Cycles CPU64 samples',
    }, indent=2) + '\n')


if STAGE == 'build':
    build()
elif STAGE == 'render':
    (OUT / 'renders').mkdir(exist_ok=True)
    specimens = json.loads((OUT / 'specimens.json').read_text())
    for specimen in specimens:
        if ONLY is None or specimen['slug'] == ONLY:
            render_one(specimen)
    if ONLY is None or ONLY == 'blast':
        render_blast(next(s for s in specimens if s['style'] == 'stepped' and s['height_m'] == 3 and s['state'] == 'explosive'))
else:
    raise ValueError('Unknown stage')
