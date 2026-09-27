"""Reproduce captured RH Babylon matrices in editable modular Blender source.

Use the Blender executable configured in dev.toml, background, two CPU threads,
and --python-exit-code 1. Arguments after -- are INPUT_DIRECTORY OUTPUT_DIRECTORY.
These diagnostic native renders are not in-game or playback evidence.
"""
import bpy
import hashlib
import json
import shutil
import sys
from pathlib import Path
from mathutils import Matrix, Vector

ROOT = Path(__file__).resolve().parents[2]
args = sys.argv[sys.argv.index('--') + 1:]
if len(args) != 2:
    raise RuntimeError('Supply captured matrix input directory and new output directory')
INPUT, OUT = (Path(arg).resolve() for arg in args)
OUT.mkdir(parents=True, exist_ok=False)
CHARACTER = ROOT / 'assets/art-library/designs/crew.base-and-outfits/revisions/r008/candidate'
EQUIPMENT = ROOT / 'assets/art-library/designs/crew.animation.aim/revisions/r003/equipment'
manifest = json.loads((CHARACTER / 'manifest.json').read_text())
capture = json.loads((INPUT / 'manifest.json').read_text())
samples = [json.loads((INPUT / (entry['name'] + '.json')).read_text())
           for entry in capture['samples']]


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def json_file(path, value):
    if path.exists():
        raise RuntimeError(f'Refusing to overwrite {path}')
    path.write_text(json.dumps(value, indent=2) + '\n')


def column_matrix(values):
    return Matrix([[values[column * 4 + row] for column in range(4)] for row in range(4)])


# Exact transform convention used by the previous native pose reproduction.
C = Matrix(((-1, 0, 0, 0), (0, 0, 1, 0), (0, 1, 0, 0), (0, 0, 0, 1)))
B = Matrix(((1, 0, 0, 0), (0, 0, 1, 0), (0, -1, 0, 0), (0, 0, 0, 1)))
bpy.ops.wm.open_mainfile(filepath=str(CHARACTER / 'blender-source.blend'))
bpy.context.preferences.filepaths.save_version = 0
scene = bpy.context.scene
rig = next(obj for obj in bpy.data.objects if obj.type == 'ARMATURE')
rig.animation_data.action = None
for track in rig.animation_data.nla_tracks:
    track.mute = True
for bone in rig.pose.bones:
    bone.rotation_mode = 'QUATERNION'
parts = [obj for obj in bpy.data.objects if obj.type == 'MESH' and obj.get('component_id')]
assets = sorted({sample['asset'] for sample in samples})
with bpy.data.libraries.load(str(EQUIPMENT / 'handheld-source.blend'), link=False) as (available, selected):
    selected.objects = [name for name in available.objects
                        if name in assets or name in ['GEO-' + asset for asset in assets]
                        or name in ['Grip.Secondary.' + asset for asset in assets]]
for obj in selected.objects:
    scene.collection.objects.link(obj)
weapons = {asset: bpy.data.objects[asset] for asset in assets}
for obj in bpy.data.objects:
    if obj.type in ['MESH', 'FONT', 'CURVE']:
        obj.hide_render = True
        obj.hide_set(True)

# Controlled CPU lighting, no raster/AI substitutions or screen-space effects.
for obj in list(bpy.data.objects):
    if obj.type in ['LIGHT', 'CAMERA']:
        bpy.data.objects.remove(obj, do_unlink=True)
world = bpy.data.worlds.new('Pose review neutral world')
world.use_nodes = True
world.node_tree.nodes['Background'].inputs[0].default_value = (.12, .15, .20, 1)
world.node_tree.nodes['Background'].inputs[1].default_value = .45
scene.world = world
for name, position, power, size, color in [
    ('key', (3, -4, 5), 450, 4, (1, .94, .88)),
    ('fill', (-3, -2, 3), 180, 4, (.68, .80, 1)),
    ('rim', (1, 3, 4), 220, 3, (.53, .69, 1)),
]:
    data = bpy.data.lights.new('Pose review ' + name, 'AREA')
    data.energy, data.shape, data.size, data.color = power, 'DISK', size, color
    obj = bpy.data.objects.new('Pose review ' + name, data)
    scene.collection.objects.link(obj)
    obj.location = position
    obj.rotation_euler = (Vector((0, 0, 1)) - obj.location).to_track_quat('-Z', 'Y').to_euler()
camera_data = bpy.data.cameras.new('Pose review camera')
camera_data.type = 'ORTHO'
camera = bpy.data.objects.new('Pose review camera', camera_data)
scene.collection.objects.link(camera)
scene.camera = camera
scene.render.engine = 'CYCLES'
scene.cycles.device = 'CPU'
scene.cycles.samples = 24
scene.cycles.use_denoising = False
scene.render.resolution_x = 600
scene.render.resolution_y = 800
scene.render.resolution_percentage = 100
scene.render.film_transparent = True
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGBA'
scene.view_settings.view_transform = 'AgX'


def apply_sample(sample, save_action=False):
    rig.animation_data.action = None
    scene.frame_set(1)
    inv_rig = rig.matrix_world.inverted()
    # Pose bones are returned in parent-before-child order for this pinned rig.
    for bone in rig.pose.bones:
        if bone.name not in sample['bones']:
            raise RuntimeError(f'Missing captured joint {bone.name}')
        bone.matrix = inv_rig @ C @ column_matrix(sample['bones'][bone.name])
        bpy.context.view_layer.update()
    errors = {}
    for bone in rig.pose.bones:
        expected = C @ column_matrix(sample['bones'][bone.name])
        actual = rig.matrix_world @ bone.matrix
        errors[bone.name] = max(abs(actual[r][c] - expected[r][c])
                                for r in range(4) for c in range(4))
    if max(errors.values()) > 2e-5:
        raise RuntimeError(f'Native pose differs from captured matrices: {errors}')
    equipped = set(sample['equippedComponents'].values())
    covers = {region for entry in manifest['components'] if entry['id'] in equipped
              for region in entry['covers']}
    keys = set(manifest['baseGroups'][sample['body']]) | equipped
    hair = sample.get('hairStyle', 'ponytail' if sample['body'] == 'female' else 'swept')
    if not sample['equippedComponents'].get('helmet') and hair != 'none':
        keys.add('hair-' + hair)
    elif sample['equippedComponents'].get('helmet') in [
            'captain-helmet', 'security-helmet', 'mechanic-helmet', 'engineer-helmet']:
        keys.add('hair-helmet-liner')
    shown = []
    for obj in parts:
        key = obj['component_id']
        visible = key in keys and not (key.startswith('base-') and key.split('-')[-1] in covers)
        obj.hide_render = not visible
        obj.hide_set(not visible)
        if visible:
            shown.append(obj)
    for asset, weapon in weapons.items():
        visible = asset == sample['asset']
        for child in weapon.children:
            child.hide_render = not visible
            child.hide_set(not visible)
            if visible and child.type == 'MESH':
                shown.append(child)
        weapon.hide_set(not visible)
    weapon = weapons[sample['asset']]
    weapon.matrix_world = C @ column_matrix(sample['equipment']) @ B
    bpy.context.view_layer.update()
    if save_action:
        action = bpy.data.actions.new('R003-DIAGNOSTIC-' + sample['name'])
        action.use_fake_user = True
        action['source_sample'] = sample['name'] + '.json'
        action['meaning'] = 'Captured settled runtime pose; not an authored playback clip'
        rig.animation_data.action = action
        for bone in rig.pose.bones:
            bone.keyframe_insert('location', frame=1, group=bone.name)
            bone.keyframe_insert('rotation_quaternion', frame=1, group=bone.name)
            bone.keyframe_insert('scale', frame=1, group=bone.name)
    return shown, errors, sorted(keys)


def render(sample, view, shown):
    directions = {'three-quarter': (3, -6, 2.2), 'front': (0, -6, .6),
                  'side': (-6, 0, 1.25), 'top': (0, -.001, 6)}
    # A stable character-scale frame; fit actual evaluated rig + held-item bounds
    # in camera space so the barrel is not clipped by a pose change.
    target = Vector((0, -.12, .96))
    camera.location = target + Vector(directions[view])
    camera.rotation_euler = (target - camera.location).to_track_quat('-Z', 'Y').to_euler()
    bpy.context.view_layer.update()
    depsgraph = bpy.context.evaluated_depsgraph_get()
    points = [obj.matrix_world @ Vector(corner) for obj in shown
              for corner in obj.evaluated_get(depsgraph).bound_box]
    view_inv = camera.matrix_world.inverted()
    camera_points = [view_inv @ point for point in points]
    low = [min(p[i] for p in camera_points) for i in range(2)]
    high = [max(p[i] for p in camera_points) for i in range(2)]
    offset = Vector(((low[0] + high[0]) / 2, (low[1] + high[1]) / 2, 0))
    camera.location += camera.matrix_world.to_3x3() @ offset
    aspect = scene.render.resolution_x / scene.render.resolution_y
    camera.data.ortho_scale = max((high[1] - low[1]), (high[0] - low[0]) / aspect) * 1.14
    path = OUT / (sample['name'] + '-' + view + '.png')
    if path.exists():
        raise RuntimeError(f'Refusing to overwrite {path}')
    scene.render.filepath = str(path)
    bpy.ops.render.render(write_still=True)
    return {'file': path.name, 'sha256': sha(path), 'view': view,
            'camera_world': [list(row) for row in camera.matrix_world],
            'ortho_scale': camera.data.ortho_scale}


records = []
for sample in samples:
    shown, errors, keys = apply_sample(sample, save_action=True)
    views = ['three-quarter']
    if sample['name'] in ['male-rifle-raised', 'female-rifle-raised', 'female-pistol-raised']:
        views.extend(['front', 'side'])
    if sample['name'] in ['male-rifle-heavy-up', 'male-rifle-heavy-low-ready']:
        views.append('side')
    if sample['name'] == 'male-rifle-raised':
        views.append('top')
    images = [render(sample, view, shown) for view in views]
    records.append({'name': sample['name'], 'source_sha256': sha(INPUT / (sample['name'] + '.json')),
                    'max_bone_matrix_delta': max(errors.values()), 'bone_matrix_deltas': errors,
                    'visible_component_keys': keys, 'visible_mesh_count': len(shown),
                    'runtime_status': sample['diagnostics']['status'], 'images': images})

# One editable representative scene contains all named settled-pose actions.
# Component visibility and held-item matrix are documented per sample; running
# this recipe reproduces each complete scene instead of assuming an action alone
# also switches equipment and body visibility.
representative = next((sample for sample in samples if sample['name'] == 'male-rifle-raised'), samples[0])
apply_sample(representative)
rig.animation_data.action = bpy.data.actions['R003-DIAGNOSTIC-' + representative['name']]
scene.frame_set(1)
scene['diagnostic_review_kind'] = 'Native reproduction of captured Babylon RH transforms; not in-game evidence'
scene['representative_sample'] = representative['name']
scene['reproduction_script'] = str(Path(__file__).relative_to(ROOT))
scene['all_samples'] = json.dumps([sample['name'] for sample in samples])
text = bpy.data.texts.new('R003-DIAGNOSTIC-POSE-README')
text.write(f'This scene preserves editable r008 meshes/rig and r003 equipment. {len(samples)} R003-DIAGNOSTIC actions contain captured settled bone poses, not playback animation. The active {representative["name"]} scene is representative. Run the archived Python recipe and inputs to reproduce each exact body/equipment/visibility combination. These are CPU Blender diagnostic renders, not gameplay screenshots or final artistic approval.\n')
blend = OUT / 'diagnostic-posed-character.blend'
bpy.ops.wm.save_as_mainfile(filepath=str(blend), compress=True)
shutil.copytree(INPUT, OUT / 'inputs')
shutil.copyfile(Path(__file__), OUT / 'combat_pose_render.py')
shutil.copyfile(ROOT / 'scripts/character_components/combat_pose_capture.ts', OUT / 'combat_pose_capture.ts')
json_file(OUT / 'capture-record.json', {
    'status': 'diagnostic native reproduction; no gameplay/animation/owner acceptance claimed',
    'source_crew_blender': str((CHARACTER / 'blender-source.blend').relative_to(ROOT)),
    'source_crew_blender_sha256': sha(CHARACTER / 'blender-source.blend'),
    'source_equipment_blender': str((EQUIPMENT / 'handheld-source.blend').relative_to(ROOT)),
    'source_equipment_blender_sha256': sha(EQUIPMENT / 'handheld-source.blend'),
    'captured_runtime_crew_sha256': samples[0]['crewSha256'],
    'input_manifest_sha256': sha(INPUT / 'manifest.json'),
    'recipe_sha256': sha(Path(__file__)), 'blender': bpy.app.version_string,
    'renderer': 'Cycles CPU, 2 threads, 24 samples, denoising off, AgX, RGBA 600x800',
    'coordinate_conversion': {'C': [list(row) for row in C], 'B': [list(row) for row in B]},
    'native_source': {'file': blend.name, 'sha256': sha(blend), 'bytes': blend.stat().st_size},
    'sample_count': len(samples), 'samples': records,
    'limitations': ['Settled transforms are not motion playback',
                    'Native lighting/material display differs from Babylon game lighting',
                    'Only listed captured body/equipment states are reproduced',
                    'Selection of an action alone does not change equipment or body visibility'],
})
print('POSE_NATIVE_REPRODUCTION=' + json.dumps({'samples': len(samples),
      'images': sum(len(record['images']) for record in records),
      'maximum_bone_matrix_delta': max(record['max_bone_matrix_delta'] for record in records),
      'editable_source': str(blend), 'sha256': sha(blend)}))
