"""Render static palette previews from the exact published r005 native GLB.

Run: blender --background --factory-startup --threads 4 --python-exit-code 1
     --python scripts/art_library/render_armor_thumbnails.py
No meshes, materials, transforms or visual revision pins are changed.
"""
from pathlib import Path
import hashlib
import json

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'assets/art-library/framed-wayfarer/r005/library-02/hull.glb'
TARGET = SOURCE.parent.parent / 'thumbnails-r001'
CATALOG = ROOT / 'apps/dashboard/src/shipyard/layout/armor-kit-r005.json'


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def render():
    import bpy
    from mathutils import Vector
    catalog = json.loads(CATALOG.read_text())
    if sha(SOURCE) != catalog['librarySha256']:
        raise ValueError('Native armor source revision differs')
    TARGET.mkdir(parents=True, exist_ok=True)
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    bpy.ops.import_scene.gltf(filepath=str(SOURCE))
    meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    for obj in meshes:
        obj.hide_render = True
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = 32
    scene.cycles.use_denoising = False
    scene.render.resolution_x = 256
    scene.render.resolution_y = 256
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGBA'
    scene.view_settings.view_transform = 'AgX'
    scene.world.use_nodes = True
    scene.world.node_tree.nodes['Background'].inputs['Color'].default_value = (.35, .4, .5, 1)
    scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value = .7
    bpy.ops.object.camera_add()
    camera = bpy.context.object
    camera.data.type = 'ORTHO'
    camera.data.lens = 50
    scene.camera = camera
    lights = []
    for offset, energy in [((3, -5, 6), 1000), ((-4, -2, 3), 750), ((2, 4, 5), 1200)]:
        bpy.ops.object.light_add(type='AREA')
        light = bpy.context.object
        light.data.energy = energy
        light.data.size = 5
        lights.append((light, Vector(offset)))
    records = []
    for asset in catalog['assets']:
        objects = [o for o in meshes if o.name.startswith(asset['visual']['nodePrefix'])]
        if not objects:
            raise ValueError(f"No native geometry for {asset['id']}")
        for obj in objects:
            obj.hide_render = False
        points = [o.matrix_world @ Vector(p) for o in objects for p in o.bound_box]
        low = Vector(tuple(min(p[i] for p in points) for i in range(3)))
        high = Vector(tuple(max(p[i] for p in points) for i in range(3)))
        center = (low + high) / 2
        # Native source front is -Y. Show face, backing depth and upper surface.
        camera.location = center + Vector((4, -8, 4.5)).normalized() * 20
        camera.rotation_euler = (center - camera.location).to_track_quat('-Z', 'Y').to_euler()
        bpy.context.view_layer.update()
        inverse = camera.matrix_world.inverted()
        projected = [inverse @ p for p in points]
        camera.data.ortho_scale = max(max(p[i] for p in projected) - min(p[i] for p in projected) for i in (0, 1)) * 1.18
        for light, offset in lights:
            light.location = center + offset
            light.rotation_euler = (center - light.location).to_track_quat('-Z', 'Y').to_euler()
        path = TARGET / (asset['id'] + '.png')
        scene.render.filepath = str(path)
        bpy.ops.render.render(write_still=True)
        records.append({'id': asset['id'], 'file': path.name, 'sha256': sha(path),
                        'nodePrefix': asset['visual']['nodePrefix'], 'meshCount': len(objects)})
        for obj in objects:
            obj.hide_render = True
    manifest = {'schema': 'sidereal.armor-thumbnails.v1', 'sourceSha256': sha(SOURCE),
                'renderer': f'Blender {bpy.app.version_string} Cycles CPU 32 samples AgX',
                'size': [256, 256], 'assets': records}
    (TARGET / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')


if __name__ == '__main__':
    render()
