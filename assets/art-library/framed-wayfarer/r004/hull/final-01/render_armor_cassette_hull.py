"""Managed neutral CPU views of exact armor-cassette GLBs and their joins."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tomllib

ROOT = Path(__file__).resolve().parents[2]


def render(directory):
    import bpy
    from mathutils import Vector
    base = Path(directory); target = base / 'renders'; target.mkdir(exist_ok=False)
    manifest = json.loads((base / 'models.json').read_text())
    records = {r['slug']: r for r in manifest['models']}
    service = 'armor-red-service-w200-h300'; vent = 'armor-vent-w200-h300'
    left, right = 'armor-plain-pair-left-w200-h300', 'armor-plain-pair-right-w200-h300'
    pair = [(left, (0, -1, 0)), (right, (0, 1, 0))]
    shots = [
        ('single-service', [(service, (0, 0, 0))], (.25, 0, 1.5), (7, -4, 3.7), 4.3, 'all'),
        ('single-vent', [(vent, (0, 0, 0))], (.25, 0, 1.5), (7, -4, 3.7), 4.3, 'all'),
        ('joined-plain-bay', pair, (.25, 0, 1.5), (7, -4, 3.7), 5.8, 'all'),
        ('joined-seam-close', pair, (.28, 0, 1.5), (7, -2, 2.2), 1.5, 'all'),
        ('bow-armor', [('front-bow-bumper', (0, 0, 0))], (2, .30, .775), (6, 7, 4), 5.4, 'all'),
        ('shoulder-armor', [('front-shoulder-transition', (0, 0, 0))], (.4, 1, 1.5), (7, 4, 3.7), 4.3, 'all'),
        ('bow-exploded-liner', [('front-bow-bumper', (0, 0, 0))], (2, .70, .775), (6, 7, 5), 5.4, 'explode'),
    ]
    if manifest['stage'] == 'complete-family-independent-review-candidate':
        def joined(variant, port=False):
            suffix = '-port' if port else ''
            return [(f'armor-{variant}-pair-{role}-w200-h300{suffix}', (0, offset, 0))
                    for role, offset in [('left', -1), ('right', 1)]]
        shots = [(f'joined-{variant}-bay', joined(variant), (.25, 0, 1.5), (7, -4, 3.7), 5.8, 'all')
                 for variant in ('red-service', 'utility', 'identity')]
        shots += [
            ('joined-identity-port', joined('identity', True), (-.25, 0, 1.5), (-7, 4, 3.7), 5.8, 'port'),
            ('single-identity-port', [('armor-identity-w200-h300-port', (0, 0, 0))],
             (-.25, 0, 1.5), (-7, 4, 3.7), 4.3, 'port'),
            ('fixed-width-examples', [(f'armor-plain-w{width}-h300', (0, y, 0))
                                      for width, y in [('050', -2.5), ('100', -1.25), ('200', .75)]],
             (.25, -.375, 1.5), (8, -3, 4), 7, 'all'),
            ('fixed-height-examples', [(f'armor-plain-w200-h{height}', (0, y, 0))
                                       for height, y in [('075', -2.5), ('150', 0), ('225', 2.5)]],
             (.25, 0, 1.125), (8, -2, 4), 8.2, 'all'),
            ('sill-and-transom', [('front-sill-straight', (0, 0, 0)), ('front-bow-transom', (2.5, 0, 0))],
             (2.25, .125, .5625), (0, -7, 4), 5.8, 'all'),
            ('diagonal-sill', [('front-sill-diagonal45', (0, 0, 0))],
             (1, 1, .5625), (5, -5, 4), 3.8, 'all'),
            ('diagonal-cheek', [('front-diagonal-cheek', (0, 0, 0))],
             (2, 1, .775), (6, 7, 4), 5.7, 'all'),
        ]
    captures = []
    for name, items, center, camera_offset, scale, mode in shots:
        bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
        # Each view imports exact GLBs, including packed 2k maps. Release the
        # previous view's orphaned image/material/mesh datablocks before import.
        bpy.data.orphans_purge(do_recursive=True)
        for slug, offset in items:
            before = set(bpy.context.scene.objects)
            bpy.ops.import_scene.gltf(filepath=str(base / records[slug]['path']))
            imported = set(bpy.context.scene.objects) - before
            for obj in imported:
                if obj.parent not in imported:
                    obj.location += Vector(offset)
                    if mode == 'port': obj.scale.x = -1
                if mode == 'explode' and '--ARMOR' in obj.name: obj.location += Vector((0, .75, 0))
        center = Vector(center)
        bpy.ops.object.camera_add(location=center + Vector(camera_offset))
        camera = bpy.context.object; camera.name = 'CAMERA-neutral-native-review'
        camera.rotation_euler = (center - camera.location).to_track_quat('-Z', 'Y').to_euler()
        camera.data.type = 'ORTHO'; camera.data.ortho_scale = scale
        scene = bpy.context.scene; scene.camera = camera; scene.render.engine = 'CYCLES'
        scene.cycles.device = 'CPU'; scene.cycles.samples = 64; scene.cycles.use_denoising = False
        scene.render.resolution_x = 1200; scene.render.resolution_y = 1000
        scene.render.resolution_percentage = 100; scene.render.film_transparent = True
        scene.view_settings.view_transform = 'AgX'; scene.view_settings.look = 'AgX - Medium High Contrast'
        scene.world.use_nodes = True
        scene.world.node_tree.nodes['Background'].inputs['Color'].default_value = (.18, .20, .24, 1)
        scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value = .6
        for number, (offset, power, size) in enumerate([((4, -5, 7), 1100, 5), ((-3, 5, 4), 700, 4), ((5, 6, 2), 500, 4)]):
            bpy.ops.object.light_add(type='AREA', location=center + Vector(offset))
            light = bpy.context.object; light.name = f'LIGHT-neutral-review-{number}'
            light.data.energy = power; light.data.shape = 'DISK'; light.data.size = size
            light.rotation_euler = (center - light.location).to_track_quat('-Z', 'Y').to_euler()
        path = target / (name + '.png'); scene.render.filepath = str(path)
        bpy.ops.render.render(write_still=True)
        captures.append({'name': name, 'path': str(path.relative_to(base)),
                         'sha256': hashlib.sha256(path.read_bytes()).hexdigest(),
                         'models': [{'slug': s, 'sha256': records[s]['sha256'], 'translationM': p} for s, p in items],
                         'groupMode': mode, 'armorExplosionM': [0, .75, 0] if mode == 'explode' else None,
                         'placementReflectionX': mode == 'port',
                         'cameraPosition': list(camera.location), 'cameraTarget': list(center),
                         'orthographicScale': scale, 'viewport': [1200, 1000],
                         'renderer': f'Blender {bpy.app.version_string} / Cycles CPU / 64 samples / no denoising / AgX medium-high',
                         'scope': 'Fresh exact GLB imports. Neutral native source review; no live state or synthesized art.'})
        (target / 'captures.json').write_text(json.dumps(captures, indent=2) + '\n')


if __name__ == '__main__':
    if '--' in sys.argv:
        render(sys.argv[sys.argv.index('--') + 1])
    else:
        parser = argparse.ArgumentParser(description=__doc__); parser.add_argument('directory')
        args = parser.parse_args(); base = Path(args.directory).resolve()
        cfg = tomllib.loads((ROOT / 'dev.toml').read_text())
        command = [cfg['art']['blender'], '--background', '--factory-startup', '--threads', '4',
                   '--python-exit-code', '1', '--python', str(Path(__file__).resolve()), '--', str(base)]
        with (base / 'render.log').open('w') as log:
            result = subprocess.run(command, cwd=ROOT, stdout=log, stderr=subprocess.STDOUT)
        print((base / 'render.log').read_text()[-3500:]); raise SystemExit(result.returncode)
