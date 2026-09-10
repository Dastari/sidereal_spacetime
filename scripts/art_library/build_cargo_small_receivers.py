"""Native companion receiver cups for unchanged approved standard-small/red feet."""
import bpy
from mathutils import Vector
from pathlib import Path
import json
import sys

ROOT = Path(__file__).resolve().parents[2]
OUT = Path(sys.argv[sys.argv.index('--')+1])
assert not (OUT/'blender-source.blend').exists()
OUT.mkdir(parents=True, exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
scene = bpy.context.scene
scene.unit_settings.system = 'METRIC'
scene.unit_settings.scale_length = 1
geo = bpy.data.collections.new('GEO')
scene.collection.children.link(geo)
collision = bpy.data.collections.new('COLLISION')
scene.collection.children.link(collision)
collision.hide_render = True
socket_collection = bpy.data.collections.new('SOCKETS')
scene.collection.children.link(socket_collection)
root = bpy.data.objects.new('ASSET-standard-small-receiver-set', None)
geo.objects.link(root)
mat = bpy.data.materials.new('MAT-amber-cargo-restraint')
mat.use_nodes = True
shader = mat.node_tree.nodes.get('Principled BSDF')
shader.inputs['Base Color'].default_value = (.73, .26, .035, 1)
shader.inputs['Metallic'].default_value = .4
shader.inputs['Roughness'].default_value = .3
objects = []
boxes = []
centers = []
for x in [-.21, .21]:
    for y in [-.17, .17]:
        cx, cy = .5+x, .5377499908208847+y
        centers.append([cx, cy])
        for side, lo, hi in [
            ('left', [cx-.027,cy-.027,.09375], [cx-.022,cy+.027,.12175]),
            ('right', [cx+.022,cy-.027,.09375], [cx+.027,cy+.027,.12175]),
            ('front', [cx-.022,cy-.027,.09375], [cx+.022,cy-.022,.12175]),
            ('rear', [cx-.022,cy+.022,.09375], [cx+.022,cy+.027,.12175]),
        ]:
            bpy.ops.mesh.primitive_cube_add(size=1, location=tuple((a+b)/2 for a,b in zip(lo,hi)))
            o = bpy.context.object
            o.name = f'GEO-receiver-{x}-{y}-{side}'
            o.data.name = 'MESH-'+o.name
            o.dimensions = tuple(b-a for a,b in zip(lo,hi))
            bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
            for c in list(o.users_collection):
                c.objects.unlink(o)
            geo.objects.link(o)
            o.data.materials.append(mat)
            o.parent = root
            objects.append(o)
            boxes.append({'id': o.name, 'min': lo, 'max': hi})
        socket = bpy.data.objects.new(f'SOCK-foot-receiver-{x}-{y}', None)
        socket_collection.objects.link(socket)
        socket.location = (cx,cy,.09375)
        socket.parent = root
bpy.ops.object.select_all(action='DESELECT')
root.select_set(True)
for o in [*objects,*socket_collection.objects]:
    o.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(OUT/'receiver-set.glb'), export_format='GLB', use_selection=True, export_apply=True, export_yup=True, export_materials='EXPORT')
for box in boxes:
    source = bpy.data.objects[box['id']]
    proxy = source.copy()
    proxy.data = source.data.copy()
    proxy.name = 'PROXY-'+source.name
    collision.objects.link(proxy)
    proxy.hide_render = True
    proxy.hide_set(True)
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'blender-source.blend'))
(OUT/'interface.json').write_text(json.dumps({'schema':'sidereal.standard-small-restraint.v1',
  'payloadAppearances':['standard-small','standard-small-red'],
  'payloadGlbSha256':['2c7f3a8a9c39ed54af84b5a42694188db99fd94c706071384dec3bf8c394e5bf','9c3e1914626d0149e298d7cdcfe70fe88c64f68df36a761994f4f9dc97453cd6'],
  'carrierCellOriginM':[0,0,0], 'payloadTranslationM':[.5,.5377499908208847,.09375],
  'footCentersM':centers,'clearOpeningM':.044,'footWidthM':.04,'receiverWallHeightM':.028,
  'floorM':.09375,'ceilingM':.625,'payloadHeightM':.5114999413490295,
  'maximumUpwardTravelM':.625-.09375-.5114999413490295,
  'closedRetentionRule':'At fixed relative orientation, payload feet cannot rise above receiver walls while upper frame is locked. Positive2mm lateral clearance per side; no free6DOF cargo simulation.',
  'installationRule':'Offload any upper carriers; unlock/remove upper frame for payload installation/removal; then lock it. No side loading claim.',
  'provisionalGameplayAuthorization':'Parent instruction permitting proposed numeric gameplay balance; not engineering certification or owner art signoff.',
  'collisionBoxes':boxes,'ownerArtApproval':False},indent=2)+'\n')
# Evidence rig only. Native receiver visuals were exported before adding reference payload.
bpy.ops.import_scene.gltf(filepath=str(ROOT/'assets/art-library/designs/cargo.standard.small/revisions/r003/glb.glb'))
payload = [o for o in scene.objects if o not in [root,*objects,*socket_collection.objects] and o.type=='MESH' and not o.name.startswith('PROXY')]
payload_set = set(payload)
for o in payload:
    if o.parent not in payload_set:
        o.location += Vector((.5,.5377499908208847,.32))
# Deliberately exploded vertically to expose actual feet and receiver openings.
def aim(o,p):o.rotation_euler=(Vector(p)-o.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add(location=(1.7,-1.6,1.6))
camera=bpy.context.object;aim(camera,(.5,.5,.4));camera.data.type='ORTHO';camera.data.ortho_scale=1.4;scene.camera=camera
for pos,power,size in [((0,-2,4),450,3),((-2,1,2),220,3),((2,2,3),500,2)]:
    bpy.ops.object.light_add(type='AREA',location=pos);o=bpy.context.object;o.data.energy=power;o.data.size=size;aim(o,(.5,.5,.4))
scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=48;scene.cycles.use_denoising=False
scene.render.threads_mode='FIXED';scene.render.threads=2;scene.render.resolution_x=1100;scene.render.resolution_y=900;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA';scene.render.film_transparent=True
scene.view_settings.view_transform='AgX';scene.render.filepath=str(OUT/'exploded-receiver-proof.png')
bpy.ops.render.render(write_still=True)
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'exploded-review.blend'))
