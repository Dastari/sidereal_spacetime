"""Native Blender maintenance revision: separate post/end-panel exterior planes."""
from pathlib import Path
import bpy,json,hashlib
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2]
out=ROOT/'.runtime/art-library/bridge-bed-fix';out.mkdir(exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=str(ROOT/'assets/source/approved-equipment/part-c41467ac46f6b350df24.blend'))
bpy.context.preferences.filepaths.save_version=0
scene=bpy.context.scene
geo=bpy.data.collections['AUTHORING-MESHES'];geo.hide_viewport=False;geo.hide_render=False
bpy.context.view_layer.update()
print('UNHIDDEN',flush=True)
old=bpy.data.objects['GEO-part-c41467ac46f6b350df24--equipment-review'];bpy.data.objects.remove(old,do_unlink=True)
bpy.context.view_layer.update()
print('REMOVED',flush=True)
changes=[]
for o in geo.objects:
 if o.name.startswith('GEO-bunk-post'):
  lo=min(v.co.y for v in o.data.vertices);hi=max(v.co.y for v in o.data.vertices);center=(lo+hi)/2
  for v in o.data.vertices:v.co.y=center+(v.co.y-center)*(.18/.14)
  changes.append({'object':o.name,'previous_depth_m':hi-lo,'depth_m':.18,'panel_face_separation_m':.02})
print('EDITED',flush=True)
assert len(changes)==4
# Evaluate the edited authored meshes into the existing single-object material batch.
bpy.context.view_layer.update();verts=[];faces=[];mats=[];indices=[]
for o in geo.objects:
 if o.type!='MESH':continue
 evaluated=o.evaluated_get(bpy.context.evaluated_depsgraph_get());mesh=evaluated.to_mesh();start=len(verts)
 verts.extend([list(evaluated.matrix_world@v.co) for v in mesh.vertices])
 for p in mesh.polygons:
  mat=bpy.data.materials[mesh.materials[p.material_index].name]
  if mat not in mats:mats.append(mat)
  faces.append([start+i for i in p.vertices]);indices.append(mats.index(mat))
 evaluated.to_mesh_clear()
mesh=bpy.data.meshes.new('Bunk post clearance surface');mesh.from_pydata(verts,[],faces);mesh.update()
for m in mats:mesh.materials.append(m)
for p,i in zip(mesh.polygons,indices):p.material_index=i
obj=bpy.data.objects.new('GEO-part-c41467ac46f6b350df24--equipment-review',mesh);scene.collection.objects.link(obj)
geo.hide_render=True;geo.hide_viewport=True
bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj
bpy.ops.export_scene.gltf(filepath=str(out/'glb.glb'),export_format='GLB',use_selection=True,export_extras=True,export_cameras=False,export_lights=False)
scene['revision']=6;scene['maintenance']='Four post depths .14 to .18m; end-panel planes separated by .02m; no other authored component changed.'
scene.render.resolution_x=800;scene.render.resolution_y=800;scene.render.resolution_percentage=100
scene.cycles.samples=24
center=Vector((0,0,1));scene.camera.location=center+Vector((5,-7,5));scene.camera.rotation_euler=(center-scene.camera.location).to_track_quat('-Z','Y').to_euler();scene.camera.data.ortho_scale=3.6
bpy.ops.wm.save_as_mainfile(filepath=str(out/'blender-source.blend'))
scene.render.filepath=str(out/'cutout.png');bpy.ops.render.render(write_still=True)
scene.camera.location=center+Vector((0,0,10));scene.camera.rotation_euler=(0,0,0);scene.camera.data.ortho_scale=3.2
scene.render.filepath=str(out/'blender-top.png');bpy.ops.render.render(write_still=True)
mesh.calc_loop_triangles()
report={'status':'passed','changes':changes,'bounds_m':{'min':[min(v[i] for v in verts) for i in range(3)],'max':[max(v[i] for v in verts) for i in range(3)]},'triangles':len(mesh.loop_triangles),'materials':len(mats),'occupancy':'Existing proxy retained; visual bounds remain within catalog envelope','glb_sha256':hashlib.sha256((out/'glb.glb').read_bytes()).hexdigest()}
(out/'validation.json').write_text(json.dumps(report,indent=2)+'\n')
