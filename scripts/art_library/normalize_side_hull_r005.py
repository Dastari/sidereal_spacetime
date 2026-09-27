"""Derive normalized r005 from preserved editable Blender masters; no publication."""
from pathlib import Path
import sys, json, hashlib, subprocess, tomllib
ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT/'assets/art-library/designs/shipyard.hull.side-armor/revisions/r005'
SOURCE = ROOT/'assets/art-library/designs/shipyard.hull.side-armor/revisions/r004/blender-source.blend'
COMPONENTS = ROOT/'assets/art-library/designs/shipyard.hull.side-armor/revisions/r004/bounds-and-anchors.json'
if '--worker' not in sys.argv:
    if OUT.exists(): raise RuntimeError('Preserve existing revision; output already exists')
    OUT.mkdir(parents=True)
    config = tomllib.loads((ROOT/'dev.toml').read_text())
    subprocess.run([config['art']['blender'], '--background', '--threads', '8', '--python-exit-code', '1', '--python', str(Path(__file__).resolve()), '--', '--worker'], cwd=ROOT, check=True)
    raise SystemExit(0)
import bpy, bmesh, math
from mathutils import Vector
bpy.ops.wm.open_mainfile(filepath=str(SOURCE))
bpy.context.preferences.filepaths.save_version=0
scene=bpy.context.scene
source_hash=hashlib.sha256(SOURCE.read_bytes()).hexdigest()
prior=json.loads(COMPONENTS.read_text())
components=[{'slug':r['assetId'],'side':1,'variant':r['variant'],'lights':r['lights'],'legacy':r,'objects':[ob.name for ob in bpy.data.objects if ob.type=='MESH' and ob.name.startswith('GEO-'+r['assetId']+'--')]} for r in prior['parts']]
keep={name for c in components for name in c['objects']}
for ob in list(bpy.data.objects):
    if ob.name not in keep: bpy.data.objects.remove(ob, do_unlink=True)
for c in list(bpy.data.collections):
    if not c.objects: bpy.data.collections.remove(c)
anchors={'HULL_ATTACH':[0,0,0], 'HULL_EDGE_START':[0,-1,0], 'HULL_EDGE_END':[0,1,0], 'HULL_TOP':[0,0,3]}
records=[];exports=[];removed=0
for component in components:
    oldid=component['slug'];newid='part-'+hashlib.sha256((component['legacy']['previousAssetId']+':normalized-side-hull-r005').encode()).hexdigest()[:20]
    side=component['side'];objects=[bpy.data.objects[name] for name in component['objects']]
    collection=bpy.data.collections.new(newid);scene.collection.children.link(collection)
    carrier=next(ob for ob in objects if 'inner-armor-carrier' in ob.name)
    mounting_x=(min if side>0 else max)((carrier.matrix_world@v.co).x for v in carrier.data.vertices)
    for ob in objects:
        for mod in list(ob.modifiers):
            if mod.type=='BOOLEAN' and mod.name.startswith('Retained thruster socket'):
                ob.modifiers.remove(mod);removed+=1
        for c in list(ob.users_collection):c.objects.unlink(ob)
        collection.objects.link(ob)
        matrix=ob.matrix_world.copy()
        for v in ob.data.vertices:
            co=matrix@v.co;co.x=side*(co.x-mounting_x)
            if co.z >= 2.71 - 1e-6: co.z += .0625
            v.co=co
        ob.matrix_world.identity()
        if side<0:
            bm=bmesh.new();bm.from_mesh(ob.data);bmesh.ops.reverse_faces(bm, faces=list(bm.faces));bm.to_mesh(ob.data);bm.free()
        ob.name=ob.name.replace(oldid,newid)
        ob.hide_render=False;ob.hide_viewport=False;ob.hide_set(False)
    bpy.context.view_layer.update()
    deps=bpy.context.evaluated_depsgraph_get();points=[];triangles=0
    for ob in objects:
        evaluated=ob.evaluated_get(deps);mesh=evaluated.to_mesh()
        points.extend([ob.matrix_world@v.co for v in mesh.vertices]);mesh.calc_loop_triangles();triangles+=len(mesh.loop_triangles);evaluated.to_mesh_clear()
    bounds={'min':[min(v[i] for v in points) for i in range(3)], 'max':[max(v[i] for v in points) for i in range(3)]}
    assert abs(bounds['min'][0])<1e-5 and abs(bounds['min'][1]+1)<1e-5 and abs(bounds['max'][1]-1)<1e-5
    assert abs(bounds['min'][2])<1e-5 and abs(bounds['max'][2]-3)<1e-5
    root=bpy.data.objects.new(newid+'--HULL_ATTACH',None);collection.objects.link(root);root['anchor']='HULL_ATTACH';root['asset_id']=newid
    nodes=[root]
    for name,position in anchors.items():
        if name=='HULL_ATTACH':continue
        empty=bpy.data.objects.new(newid+'--'+name,None);collection.objects.link(empty);empty.location=position;empty['anchor']=name;empty.parent=root;nodes.append(empty)
    for ob in objects:ob.parent=root
    bpy.ops.object.select_all(action='DESELECT')
    for ob in objects+nodes:ob.select_set(True)
    directory=OUT/newid;directory.mkdir()
    path=directory/'model.glb'
    bpy.ops.export_scene.gltf(filepath=str(path),use_selection=True,export_format='GLB',export_apply=True,export_tangents=True,export_extras=True)
    exports.extend(objects+nodes)
    lights=[]
    for light in component.get('lights',[]):
        light=json.loads(json.dumps(light));light['position'][0]=side*(light['position'][0]-mounting_x);light['direction'][0]*=side;lights.append(light)
    records.append({'assetId':newid,'previousAssetId':component['legacy']['previousAssetId'],'previousNormalizedAssetId':oldid,'variant':component['variant'],'previousSide':component['legacy']['previousSide'],
       'bounds':bounds,'anchors':anchors,'nodePrefix':'GEO-'+newid+'--','attachmentRoot':newid+'--HULL_ATTACH','url':f'{newid}/model.glb','sha256':hashlib.sha256(path.read_bytes()).hexdigest(),
       'triangles':triangles,'lights':lights,'legacyMountingX':component['legacy']['legacyMountingX']})
bpy.ops.object.select_all(action='DESELECT')
for ob in exports:ob.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(OUT/'kit.glb'),use_selection=True,export_format='GLB',export_apply=True,export_tangents=True,export_extras=True)
bpy.ops.file.pack_all();bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'blender-source.blend'))
# Actual render of the same authored meshes: white vent, red service, white plain.
chosen=[]
for variant in ['vent','red-service','plain-service']:
    chosen.append(next(r for r in records if r['variant']==variant and r['previousSide']==1))
for ob in bpy.data.objects:
    if ob.type=='MESH':ob.hide_render=True
for index,record in enumerate(chosen):
    root=bpy.data.objects[record['assetId']+'--HULL_ATTACH'];root.location.y=(index-1)*2
    for ob in root.children:
        if ob.type=='MESH':ob.hide_render=False
# Ground/backing plane, only in render; never exported as a module.
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.03));ground=bpy.context.object;ground.name='REVIEW-GROUND'
mat=bpy.data.materials.new('REVIEW-neutral-ground');mat.diffuse_color=(.025,.035,.05,1);ground.data.materials.append(mat)
world=bpy.data.worlds.new('Review neutral environment');world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.18,.22,.3,1);world.node_tree.nodes['Background'].inputs[1].default_value=.5;scene.world=world
for pos,power,size in [((7,-5,8),1800,7),((4,7,5),1300,6),((-3,0,6),900,5)]:
    data=bpy.data.lights.new('REVIEW-area','AREA');data.energy=power;data.shape='DISK';data.size=size
    ob=bpy.data.objects.new('REVIEW-area',data);scene.collection.objects.link(ob);ob.location=pos;ob.rotation_euler=(Vector((0,0,1.5))-ob.location).to_track_quat('-Z','Y').to_euler()
data=bpy.data.cameras.new('REVIEW-camera');camera=bpy.data.objects.new('REVIEW-camera',data);scene.collection.objects.link(camera);camera.location=(10,-7,5.5);target=Vector((.4,0,1.4));camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler();data.type='ORTHO';data.ortho_scale=8.7;scene.camera=camera
scene.render.engine='CYCLES';scene.cycles.samples=24;scene.cycles.use_denoising=False;scene.render.resolution_x=1400;scene.render.resolution_y=820;scene.render.resolution_percentage=100;scene.render.film_transparent=False;scene.render.image_settings.file_format='PNG';scene.render.filepath=str(OUT/'blender-contact-row.png');bpy.ops.render.render(write_still=True)
validation={'schema':'sidereal.side-hull-normalized.v1','source':str(SOURCE.relative_to(ROOT)),'sourceSha256':source_hash,'revision':5,
 'frame':{'x':'outward','y':'tangent','z':'up','mountingPlaneX':0,'spanMeters':2,'heightMeters':3},
 'removedThrusterBooleanModifiers':removed,'parts':records,'kitSha256':hashlib.sha256((OUT/'kit.glb').read_bytes()).hexdigest(),
 'blenderSha256':hashlib.sha256((OUT/'blender-source.blend').read_bytes()).hexdigest(),
 'claims':{'surfacesRescaled':False,'pressureSealQualified':False,'collisionRatingsApproved':False,'published':False,'ownerApproved':False}}
(OUT/'bounds-and-anchors.json').write_text(json.dumps(validation,indent=2)+'\n')
(OUT/'review.md').write_text('Normalized editable r004 side armor into r005 with no whole-mesh scaling. Top region vertices at Z>=2.71m raised62.5mm toextend the upper backing/border to3m; lower details retained. Newasset IDs preserve r004 and installed r003 ships. Every carrier has mountingX0,tangentY-1..1,baseZ0,topZ3m. The white vent, red service and white plain-service contact row is an actual Blender render of these surfaces at the same mounting plane. No browser/game integration or artistic sign-off is claimed.\n')
print(json.dumps({'parts':len(records),'removedBooleans':removed,'kitSha256':validation['kitSha256'],'output':str(OUT)}))
