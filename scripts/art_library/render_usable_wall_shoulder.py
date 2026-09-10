"""Actual same-placement native multi-bay context, with preserved partitions."""
import bpy
import hashlib
import json
import math
from pathlib import Path
import sys
from mathutils import Matrix,Vector
ROOT=Path(__file__).resolve().parents[2]
OUT=Path(sys.argv[sys.argv.index('--')+1])
bpy.ops.wm.open_mainfile(filepath=str(OUT/'blender-source.blend'))
for obj in bpy.data.objects: obj.hide_render=True
manifest=json.loads((OUT/'delivery-manifest.json').read_text())
original={p['sourcePlacedId']:p for p in json.loads((ROOT/'assets/art-library/designs/shipyard.structure.wayfarer-airlock-inlet/revisions/r000/a003/replacement-mapping.json').read_text())['preserveOriginalPlacements']}
origin=Vector((-5,8,0)); new=[]; old=[]; pins=[]
for part in manifest['parts']:
    if part['sourcePlacedId'] not in ['wall--2-4','wall--3-4']: continue
    for obj in bpy.data.collections['CANDIDATE-'+part['id']].objects:
        obj.location+=Vector(part['originalPlacement']['position'])-origin
        new.append(obj)
for ident in ['floor--2-4','wall--2-4','wall--3-4','superstructure--3-4','pilot-r004-corner-buttress-18','pilot-r005-outer-shoulder-transition-port','pilot-r005-outer-roof-collar-port','pilot-r004-floor-square-00','pilot-r004-hull-straight-09']:
    part=original[ident]; visual=part['visual']; placement=part['originalPlacement']
    path=ROOT/'assets/runtime'/visual['url'].removeprefix('/assets/') if visual else ROOT/'assets/runtime/assembly/parts.glb'
    sha=visual['sha256'] if visual else hashlib.sha256(path.read_bytes()).hexdigest()
    prefix=visual.get('nodePrefix') if visual else 'GEO-'+part['assetId']+'--'
    assert hashlib.sha256(path.read_bytes()).hexdigest()==sha
    before=set(bpy.data.objects);bpy.ops.import_scene.gltf(filepath=str(path));imported=set(bpy.data.objects)-before
    keep=[obj for obj in imported if obj.type=='MESH' and (not prefix or obj.name.startswith(prefix))]
    assert keep,ident
    transform=Matrix.Translation(Vector(placement['position'])-origin)@Matrix.Rotation(placement['rotation'],4,'Z')@Matrix.Diagonal(Vector((-1 if placement['flipped'] else 1,1,1,1)))
    for obj in keep:
        matrix=obj.matrix_world.copy();obj.parent=None;obj.matrix_world=transform@matrix
        obj.hide_render=False
        if ident.startswith('wall-'):old.append(obj)
    for obj in imported-set(keep):bpy.data.objects.remove(obj,do_unlink=True)
    pins.append({'placedId':ident,'path':str(path.relative_to(ROOT)),'sha256':sha,'nodePrefix':prefix,'originalPlacement':placement})
    if '--structural-pockets' in sys.argv and ident.startswith(('pilot-r005-outer-shoulder-transition-','pilot-r005-outer-roof-collar-')):
        old.extend(keep)
        candidate_dir=ROOT/'assets/art-library/designs/shipyard.hull.shoulder-construction-interface/revisions/r000/a003'
        candidate_manifest=json.loads((candidate_dir/'delivery-manifest.json').read_text())
        kind='shoulder' if 'shoulder-transition' in ident else 'collar'
        asset=next(a for a in candidate_manifest['exports'] if a['id']==kind)
        candidate_path=candidate_dir/asset['file'];assert hashlib.sha256(candidate_path.read_bytes()).hexdigest()==asset['sha256']
        before=set(bpy.data.objects);bpy.ops.import_scene.gltf(filepath=str(candidate_path));added=set(bpy.data.objects)-before
        native=[obj for obj in added if obj.type=='MESH']
        for obj in native:
            matrix=obj.matrix_world.copy();obj.parent=None;obj.matrix_world=transform@matrix;new.append(obj)
        for obj in added-set(native):bpy.data.objects.remove(obj,do_unlink=True)
        pins.append({'placedId':ident,'candidatePath':str(candidate_path.relative_to(ROOT)),'sha256':asset['sha256'],'originalPlacement':placement,'stage':'corrected-only native structural pocket'})

scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=24;scene.cycles.use_denoising=False
scene.render.resolution_x=1400;scene.render.resolution_y=1000;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.view_settings.view_transform='AgX'
scene.world=bpy.data.worlds.new('Multi bay review');scene.world.use_nodes=True
scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.055,.08,.13,1)
scene.world.node_tree.nodes['Background'].inputs[1].default_value=.4
for name,position,energy in [('Key',(4,-4,6),1800),('Fill',(3,5,4),1400),('Rim',(-3,0,5),1100)]:
    data=bpy.data.lights.new(name,'AREA');data.energy=energy;data.size=5
    obj=bpy.data.objects.new(name,data);scene.collection.objects.link(obj);obj.location=position
    obj.rotation_euler=(Vector((0,0,1))-obj.location).to_track_quat('-Z','Y').to_euler()
data=bpy.data.cameras.new('Native fixed placement sidebay');data.type='ORTHO';data.ortho_scale=6.2
camera=bpy.data.objects.new('Native fixed placement sidebay',data);scene.collection.objects.link(camera);scene.camera=camera
camera.location=(6,-6,5);camera.rotation_euler=(Vector((1,.7,1.2))-camera.location).to_track_quat('-Z','Y').to_euler()
for stage in ['original','corrected']:
    for obj in old:obj.hide_render=stage=='corrected'
    for obj in new:obj.hide_render=stage=='original'
    scene.render.filepath=str(OUT/(('shoulder-a003-' if '--structural-pockets' in sys.argv else 'shoulder-a002-')+stage+'.png'));bpy.ops.render.render(write_still=True)
(OUT/('capture-context-a003.json' if '--structural-pockets' in sys.argv else 'capture-context-a002.json')).write_text(json.dumps({'schema':'sidereal.native-side-bay-render.v1','sourcePins':pins,'reviewOriginM':list(origin),'cameraM':list(camera.location),'lookAtM':[1,.7,1.2],'orthoScaleM':6.2,'sourcePlacementChanges':0,'evidence':'Actual native Blender context; no installed-game claim; roofs omitted only for inspection.'},indent=2)+'\n')
