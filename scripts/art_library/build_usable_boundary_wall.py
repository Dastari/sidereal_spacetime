"""Native outward wall family; reserved geometry, not placement compensation."""
import bpy
import hashlib
import json
import math
from pathlib import Path
import sys
from mathutils import Matrix, Vector

ROOT = Path(__file__).resolve().parents[2]
OUT = Path(sys.argv[sys.argv.index('--') + 1])
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.unit_settings.system = 'METRIC'
scene.render.engine = 'CYCLES'
scene.cycles.device = 'CPU'
scene.cycles.samples = 20
scene.cycles.use_denoising = False
scene.render.resolution_x = 1200
scene.render.resolution_y = 1000
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'
scene.view_settings.view_transform = 'AgX'
source = ROOT / 'assets/art-library/designs/shipyard.hull.side-armor/revisions/r003/blender-source.blend'
assert hashlib.sha256(source.read_bytes()).hexdigest() == '70c57b06a2c170c28840e0566f077d3561e0b40c4f5e978d36940273ceec1abd'
with bpy.data.libraries.load(str(source), link=False) as (src, dst):
    dst.materials = list(src.materials)
mats = {}
for role in ['pale', 'dark', 'black', 'steel', 'red', 'cyan', 'amber']:
    found = [mat for mat in dst.materials if mat and (mat.name == role or mat.name.endswith('-'+role) or mat.name.lower().startswith(role))]
    assert found, role
    mats[role] = found[0]
parts = {'straight-2m': [], 'outer-corner': []}
cores = []


def box(part, label, lo, hi, material, bevel=0, contact=False):
    bpy.ops.mesh.primitive_cube_add(size=1, location=tuple((a+b)/2 for a,b in zip(lo,hi)))
    obj = bpy.context.object
    obj.name = 'GEO-usable-wall-'+part+'--'+label
    obj.dimensions = tuple(b-a for a,b in zip(lo,hi))
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(mats[material])
    if bevel:
        modifier = obj.modifiers.new('Authored inset edge bevel', 'BEVEL')
        modifier.width = bevel
        modifier.segments = 3
        modifier = obj.modifiers.new('Weighted planar normals', 'WEIGHTED_NORMAL')
        modifier.keep_sharp = True
    obj['interface_role'] = 'continuous-native-contact' if contact else 'native-surface-detail'
    parts[part].append(obj)
    if contact:
        cores.append({'part': part, 'node': obj.name, 'minM': lo, 'maxM': hi})
    return obj


# Canonical run X0..2. Usable floor is Y>=0; every above-deck wall detail
# remains Y<=0. Bearing overlaps are separate contacts within the floor/roof.
box('straight-2m', 'pressure-body', [0,-.25,0], [2,-.025,2.75], 'steel', contact=True)
box('straight-2m', 'floor-bearing', [0,-.0625,.03125], [2,.0625,.125], 'steel', contact=True)
box('straight-2m', 'roof-bearing', [0,-.0625,2.703125], [2,.0625,2.75], 'steel', contact=True)
for x in [.04,1.015]:
    box('straight-2m', 'interior-enamel-'+str(x), [x,-.042,.26], [x+.945,-.009,2.43], 'pale', .012)
    box('straight-2m', 'recessed-lower-line-'+str(x), [x+.075,-.010,.47], [x+.85,-.007,.489], 'dark', .003)
for x in [.014,.975,1.946]:
    box('straight-2m', 'vertical-frame-'+str(x), [x,-.044,.19], [x+.040,-.003,2.62], 'dark', .009)
box('straight-2m', 'deck-kick', [.012,-.038,.1875], [1.988,-.003,.255], 'dark', .010)
box('straight-2m', 'head-rail', [.012,-.047,2.435], [1.988,-.003,2.64], 'dark', .012)
box('straight-2m', 'head-recess', [.14,-.010,2.487], [.83,-.006,2.58], 'black', .012)
box('straight-2m', 'cyan-status', [.18,-.006,2.519], [.79,-.002,2.55], 'cyan', .006)
box('straight-2m', 'wine-service', [1.19,-.049,1.39], [1.71,-.004,1.85], 'red', .018)
box('straight-2m', 'service-handle-recess', [1.59,-.005,1.51], [1.65,-.001,1.72], 'black', .008)
for x in [.10,.91,1.09,1.89]:
    for z in [.31,2.35]:
        box('straight-2m', 'flush-fastener-'+str((x,z)), [x-.015,-.010,z-.015], [x+.015,-.005,z+.015], 'steel', .004)
# Native exterior mounting surface remains within structural reservation;
# an armor asset starts outward ofY=-.25 and has independent identity/ratings.

# Exterior convex corner occupies the quadrant OUTSIDE both usable edges.
# Contact ears overlap adjacent native cores only, not the usable quadrant.
box('outer-corner', 'corner-core', [-.21875,-.21875,0], [0,0,2.75], 'steel', contact=True)
box('outer-corner', 'run-x-contact', [0,-.21875,.03125], [.03125,-.025,2.71875], 'steel', contact=True)
box('outer-corner', 'run-y-contact', [-.21875,0,.03125], [-.025,.03125,2.71875], 'steel', contact=True)
box('outer-corner', 'floor-corner-bearing', [-.0625,-.0625,.03125], [.0625,.0625,.125], 'steel', contact=True)
box('outer-corner', 'roof-corner-bearing', [-.0625,-.0625,2.703125], [.0625,.0625,2.734375], 'steel', contact=True)
box('outer-corner', 'outer-x-enamel', [-.25,-.225,.23], [-.20,-.04,2.53], 'dark', .012)
box('outer-corner', 'outer-y-enamel', [-.225,-.25,.23], [-.04,-.20,2.53], 'dark', .012)
for z in [.35,2.38]:
    box('outer-corner', 'outer-corner-trim-'+str(z), [-.25,-.24,z], [-.217,-.225,z+.06], 'pale', .008)

# Union native continuous contact meshes to avoid duplicate coplanar top/foot
# surfaces. Preserve editable source pieces separately; proxies are not visuals.
for part, objects in parts.items():
    contacts = [obj for obj in objects if obj.get('interface_role') == 'continuous-native-contact']
    native = contacts[0].copy()
    native.data = contacts[0].data.copy()
    native.name = 'GEO-usable-wall-'+part+'--continuous-body'
    scene.collection.objects.link(native)
    for operand in contacts[1:]:
        modifier = native.modifiers.new('Native union '+operand.name, 'BOOLEAN')
        modifier.operation = 'UNION'
        modifier.solver = 'EXACT'
        modifier.object = operand
        bpy.context.view_layer.objects.active = native
        bpy.ops.object.modifier_apply(modifier=modifier.name)
    for original in contacts:
        original.hide_render = True
        original.hide_set(True)
        objects.remove(original)
    objects.append(native)

# Legacy source frames are authored exports, not changes to placed transforms.
# The canonical2mrun maps to the existing fixed origin atX±4.6875,Y=-6.
adapters = {
    'straight-port-legacy': Matrix.Translation(Vector((-.3125,1,0))) @ Matrix.Rotation(-math.pi/2,4,'Z'),
    'straight-starboard-legacy': Matrix.Translation(Vector((.3125,-1,0))) @ Matrix.Rotation(math.pi/2,4,'Z'),
}
for name, transform in adapters.items():
    parts[name] = []
    for original in parts['straight-2m']:
        obj = original.copy()
        obj.data = original.data.copy()
        obj.name = original.name.replace('straight-2m', name)
        scene.collection.objects.link(obj)
        obj.matrix_world = transform @ original.matrix_world
        parts[name].append(obj)

for name, objects in parts.items():
    collection = bpy.data.collections.new('NATIVE-'+name)
    scene.collection.children.link(collection)
    for obj in objects:
        for old_collection in list(obj.users_collection):
            old_collection.objects.unlink(obj)
        collection.objects.link(obj)
proxy_collection = bpy.data.collections.new('SEPARATE-CONTACT-PROXIES')
scene.collection.children.link(proxy_collection)
for core in cores:
    obj = bpy.data.objects[core['node']].copy()
    obj.data = obj.data.copy()
    obj.name = 'PROXY-'+core['node']
    proxy_collection.objects.link(obj)
    obj.hide_render = True
    obj.hide_set(True)
    obj.display_type = 'WIRE'
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'blender-source.blend'))
exports = []
for name, objects in parts.items():
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects:
        obj.select_set(True)
    path = OUT/(name+'.glb')
    bpy.ops.export_scene.gltf(filepath=str(path), export_format='GLB', use_selection=True,
                            export_apply=True, export_texcoords=True, export_normals=True, export_tangents=True)
    exports.append({'id': name, 'file': path.name, 'sha256': hashlib.sha256(path.read_bytes()).hexdigest(),
                    'nodePrefix': 'GEO-usable-wall-'+name+'--', 'editableComponents': len(objects),
                    'canonicalSourceTransform': [list(row) for row in adapters[name]] if name in adapters else None})
(OUT/'contact-proxies.json').write_text(json.dumps({'cores': cores, 'status': 'Compare native export before authority use'}, indent=2)+'\n')
(OUT/'delivery-manifest.json').write_text(json.dumps({
    'schema': 'sidereal.usable-boundary-wall.v1', 'status': 'awaiting-native-qualification',
    'ownerFinalSignoff': None, 'parts': exports, 'sourceMaterialBlend': str(source.relative_to(ROOT)),
    'sourceMaterialSha256': hashlib.sha256(source.read_bytes()).hexdigest(),
    'floorTopM': .1875, 'roofUndersideM': 2.6875,
    'usableInterior': 'CanonicalY>=0 above floor top and below roof underside; cornerX>=0 andY>=0',
    'structuralEnvelopeM': {'runLength': 2, 'outwardThickness': .25, 'height': 2.75},
    'bearingContacts': [{'minZ': .03125, 'maxZ': .125}, {'minZ': 2.703125, 'maxZ': 2.75}],
    'armorMounts': [{'positionM': [x,-.25,1.35], 'outwardNormal': [0,-1,0],
                     'family': 'outward-structural-armor.v1', 'rating': None} for x in [.25,1.75]],
    'originalPlacementChanges': 0, 'installed': False,
}, indent=2)+'\n')

for objects in parts.values():
    for obj in objects:
        obj.hide_render = True
scene.world = bpy.data.worlds.new('Native wall studio')
scene.world.use_nodes = True
scene.world.node_tree.nodes['Background'].inputs[0].default_value = (.055,.08,.13,1)
scene.world.node_tree.nodes['Background'].inputs[1].default_value = .35
for name, location, energy in [('Key',(4,-3,5),1100),('Fill',(2,5,3),750),('Rim',(-3,1,5),950)]:
    data = bpy.data.lights.new(name,'AREA'); data.energy = energy; data.size = 4
    obj = bpy.data.objects.new(name,data); scene.collection.objects.link(obj); obj.location = location
    obj.rotation_euler = (Vector((0,0,1))-obj.location).to_track_quat('-Z','Y').to_euler()
data = bpy.data.cameras.new('Native wall comparison')
camera = bpy.data.objects.new('Native wall comparison',data)
scene.collection.objects.link(camera); scene.camera = camera; data.type = 'ORTHO'
captures = []


def capture(name, location, target, scale):
    camera.location = location
    camera.rotation_euler = (Vector(target)-camera.location).to_track_quat('-Z','Y').to_euler()
    data.ortho_scale = scale
    scene.render.filepath = str(OUT/(name+'.png'))
    bpy.ops.render.render(write_still=True)
    captures.append({'file': name+'.png', 'cameraM': location, 'targetM': target, 'scaleM': scale,
                     'evidence': 'Actual Blender native source; not installed-game review'})


mapping = json.loads((ROOT/'assets/art-library/designs/shipyard.structure.wayfarer-airlock-inlet/revisions/r000/a003/replacement-mapping.json').read_text())
by_id = {p['sourcePlacedId']: p for p in mapping['preserveOriginalPlacements']}
origin = Vector((-5,-6,0))
context = {}; pins = []
for ident in ['floor--2--3','wall--2--3','equipment-locker--4.7--6','superstructure--3--3']:
    part = by_id[ident]; visual = part['visual']; original = part['originalPlacement']
    path = ROOT/'assets/runtime'/visual['url'].removeprefix('/assets/') if visual else ROOT/'assets/runtime/assembly/parts.glb'
    sha = visual['sha256'] if visual else hashlib.sha256(path.read_bytes()).hexdigest()
    prefix = visual.get('nodePrefix') if visual else 'GEO-'+part['assetId']+'--'
    assert hashlib.sha256(path.read_bytes()).hexdigest() == sha
    before = set(bpy.data.objects); bpy.ops.import_scene.gltf(filepath=str(path))
    imported = set(bpy.data.objects)-before
    keep = [obj for obj in imported if obj.type=='MESH' and (not prefix or obj.name.startswith(prefix))]
    assert keep
    transform = Matrix.Translation(Vector(original['position'])-origin) @ Matrix.Rotation(original['rotation'],4,'Z')
    for obj in keep:
        matrix = obj.matrix_world.copy(); obj.parent = None; obj.matrix_world = transform @ matrix
        obj.name = 'CONTEXT-'+ident+'--'+obj.name
    for obj in imported-set(keep):
        bpy.data.objects.remove(obj,do_unlink=True)
    context[ident] = keep
    pins.append({'placedId': ident, 'path': str(path.relative_to(ROOT)), 'sha256': sha, 'nodePrefix': prefix, 'originalPlacement': original})
for obj in context['superstructure--3--3']:
    obj.hide_render = True
capture('same-placement-original',(4,-4,3.5),(.4,0,1.2),4.5)
for obj in context['wall--2--3']:
    obj.hide_render = True
for obj in parts['straight-port-legacy']:
    obj.location.x += .3125
    obj.hide_render = False
capture('same-placement-corrected',(4,-4,3.5),(.4,0,1.2),4.5)
for obj in context['superstructure--3--3']:
    obj.hide_render = False
capture('same-placement-with-armor',(4,-4,4.5),(.1,0,1.1),4.8)
for obj in parts['straight-port-legacy']:
    obj.hide_render = True; obj.location.x -= .3125
for objects in context.values():
    for obj in objects:
        obj.hide_render = True
for obj in parts['straight-2m'] + parts['outer-corner']:
    obj.hide_render = False
capture('straight-and-corner',(4,5,4),(.55,-.15,1.3),4.5)
(OUT/'capture-context.json').write_text(json.dumps({'captures': captures, 'sourcePins': pins,
    'sourcePlacementChanges': 0, 'reviewOriginM': list(origin),
    'replacement': {'sourcePlacedId': 'wall--2--3', 'sourceOriginM': [-4.6875,-6,0],
                    'candidate': 'straight-port-legacy', 'rotationUnchanged': 0, 'flippedUnchanged': False}}, indent=2)+'\n')
print(json.dumps({'output': str(OUT), 'parts': len(parts), 'originalPlacementChanges': 0}))
