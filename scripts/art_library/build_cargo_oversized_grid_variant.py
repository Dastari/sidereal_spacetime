"""Separate native fitting variant: recess two lock levers25mm; no global scaling."""
import bpy
from pathlib import Path
import hashlib
import json
import sys

ROOT = Path(__file__).resolve().parents[2]
OUT = Path(sys.argv[sys.argv.index('--')+1])
SOURCE = ROOT/'assets/art-library/designs/cargo.reinforced.oversized/revisions/r002/blender-source.blend'
assert hashlib.sha256(SOURCE.read_bytes()).hexdigest() == 'ad014ef3faab889b9582f9c883a04ca384acc1218d902e50c5db056d5fabaa12'
assert not (OUT/'blender-source.blend').exists(), 'Preserve previous attempts'
OUT.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=str(SOURCE))
scene = bpy.context.scene
objects = [o for o in scene.objects if o.type == 'MESH' and o.name.startswith('GEO-') and not o.hide_render]
levers = [o for o in objects if o.name.startswith('GEO-lock-lever')]
assert len(levers) == 2
changes = []
for o in levers:
    before = list(o.location)
    # Preserve pivot parenting, native vertices/modifiers and material slots.
    matrix = o.matrix_world.copy()
    matrix.translation.y += .025
    o.matrix_world = matrix
    changes.append({'object': o.name, 'beforeLocalM': before, 'afterLocalM': list(o.location), 'worldTranslationDeltaM': [0, .025, 0]})
bpy.context.view_layer.update()
deps = bpy.context.evaluated_depsgraph_get()
points = []
for o in objects:
    evaluated = o.evaluated_get(deps)
    mesh = evaluated.to_mesh()
    points.extend(o.matrix_world @ v.co for v in mesh.vertices)
    evaluated.to_mesh_clear()
bounds = {'min': [min(p[i] for p in points) for i in range(3)], 'max': [max(p[i] for p in points) for i in range(3)]}
dimensions = [b-a for a,b in zip(bounds['min'], bounds['max'])]
assert dimensions[0] <= 2 and dimensions[1] <= 4
# Keep old draft gauges separate and explicitly disallow treating them as new authority.
for o in scene.objects:
    if 'proxy' in o.name or 'capacity-envelope' in o.name:
        o['reviewOnly'] = True
        o['authorityQualified'] = False
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'blender-source.blend'))
bpy.ops.object.select_all(action='DESELECT')
copies = []
for o in objects:
    mesh = bpy.data.meshes.new_from_object(o.evaluated_get(deps))
    mesh.transform(o.matrix_world)
    copy = bpy.data.objects.new(o.name+'--export', mesh)
    scene.collection.objects.link(copy)
    copy.select_set(True)
    copies.append(copy)
for o in scene.objects:
    if o.type == 'EMPTY' and o.name.startswith(('SOCK_', 'FX_')):
        o.select_set(True)
bpy.context.view_layer.objects.active = copies[0]
bpy.ops.export_scene.gltf(filepath=str(OUT/'glb.glb'), export_format='GLB', use_selection=True, export_apply=True,
                        export_yup=True, export_materials='EXPORT', export_extras=True)
for o in copies:
    bpy.data.objects.remove(o, do_unlink=True)
scene.render.engine = 'CYCLES'
scene.cycles.device = 'CPU'
scene.cycles.samples = 64
scene.cycles.use_denoising = False
scene.render.threads_mode = 'FIXED'
scene.render.threads = 2
scene.render.resolution_x = 1100
scene.render.resolution_y = 900
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGBA'
scene.render.film_transparent = True
assert scene.camera is not None
scene.render.filepath = str(OUT/'closed-cutout.png')
bpy.ops.render.render(write_still=True)
(OUT/'fitting-review.json').write_text(json.dumps({'schema': 'sidereal.cargo-grid-variant.v1',
    'derivedFrom': 'cargo.reinforced.oversized/r002', 'sourceSha256': hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
    'changes': changes, 'boundsAuthorM': bounds, 'dimensionsM': dimensions,
    'nominalReservationM': [2, 4], 'globalScaleApplied': False,
    'placementRule': 'Translate measured neutral XY center to reservation center, bottom to qualified deck;0/180deg2x4,90/270deg4x2.',
    'authorityCollision': 'Unqualified: old source gauges retained only as historical fitting evidence.',
    'filledStackingApproved': False, 'ownerArtApproval': False,
    'limitations': ['Closed fit only; full door swept-volume requalification pending.', 'Too tall for low carrier; independent qualified support needed.', 'Gameplay capacity/strength remain separate and unchanged.']}, indent=2)+'\n')
print(json.dumps({'dimensionsM': dimensions, 'changedLeverCount': len(changes), 'ownerArtApproval': False}))
