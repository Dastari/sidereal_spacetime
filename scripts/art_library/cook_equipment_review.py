"""Render and export actual project-meshed Blender samples; retain editable solids."""
from pathlib import Path
import bpy,bmesh,json,sys,hashlib,math,struct
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'scripts'))
from voxel_visual_surface import welded_surface, bevel_surface
jobs=json.loads(Path(sys.argv[sys.argv.index('--')+1]).read_text())
for job in jobs:
 out=ROOT/job['output'];spec=json.loads((out/'specification.json').read_text())
 for variant in job['variants']:
  dest=out/variant['name'];data=json.loads((dest/'mesh.json').read_text())
  if (dest/'blender-source.blend').exists():raise ValueError('Immutable cooked revision exists')
  bpy.ops.wm.open_mainfile(filepath=str(out/'authoring.blend'));scene=bpy.context.scene
  source=bpy.data.collections['GEO'];source.name='AUTHORING-CLOSED-SOLIDS';source.hide_render=True;source.hide_viewport=True
  if variant['name']=='starboard':
   # Mirror editable source too; source and cooked geometry remain the same variant.
   for o in source.objects:
    for v in o.data.vertices:v.co.x=-v.co.x
    bm=bmesh.new();bm.from_mesh(o.data);bmesh.ops.recalc_face_normals(bm,faces=bm.faces);bm.to_mesh(o.data);bm.free()
  offset_x=(variant['bounds_m']['min'][0]+variant['bounds_m']['max'][0])/2
  for o in source.objects:
   for v in o.data.vertices:v.co.x+=offset_x
  vertices,faces=welded_surface(data)
  mesh=bpy.data.meshes.new('Cooked opaque voxel union');mesh.from_pydata(vertices,[],faces);mesh.update()
  obj=bpy.data.objects.new('GEO-'+data['id']+'--equipment-review',mesh);scene.collection.objects.link(obj)
  for desc in data['palette'][1:]:
   m=bpy.data.materials.new('COOKED-'+desc['name']);m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF')
   for field,socket in [('color','Base Color'),('metallic','Metallic'),('roughness','Roughness'),('emission','Emission Color'),('emissionStrength','Emission Strength')]:p.inputs[socket].default_value=(*desc[field],1) if field in ['color','emission'] else desc[field]
   m['voxel_material_id']=desc['voxelMaterialId'];mesh.materials.append(m)
  for p,m in zip(mesh.polygons,data['materials']):p.material_index=m-1
  # The actual project surface adapter splits T-junctions before eligible convex
  # micro-bevels. Occupied samples remain immutable and separate from this surface.
  colors=mesh.color_attributes.new(name='palette',type='FLOAT_COLOR',domain='CORNER')
  for p in mesh.polygons:
   color=(*data['palette'][p.material_index+1]['color'],1)
   for loop in p.loop_indices:colors.data[loop].color=color
  bpy.context.view_layer.update()
  surface=bevel_surface(obj,data['cellMeters'])
  # Constant PBR materials already carry color; avoid multiplying it by COLOR_0.
  mesh.color_attributes.remove(mesh.color_attributes['palette'])
  obj['design_id']=job['design_id'];obj['catalog_asset_id']=variant['asset_id'];obj['variant']=variant['name'];obj['pitch_m']=data['cellMeters']
  bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj
  bpy.ops.export_scene.gltf(filepath=str(dest/'glb.glb'),export_format='GLB',use_selection=True,export_apply=True,export_extras=True,export_cameras=False,export_lights=False)
  center=Vector([(a+b)/2 for a,b in zip(data['bounds']['min'],data['bounds']['max'])]);size=[b-a for a,b in zip(data['bounds']['min'],data['bounds']['max'])]
  # Show the useful face of narrow wall lockers and longitudinal sofa.
  direction=Vector((-7,-5,math.sqrt(37))) if job['slug'] in ['wall-locker','lounge-sofa'] else Vector((5,-7,math.sqrt(37)))
  if job['slug']=='pilot-seat':direction=Vector((5,7,math.sqrt(37)))
  scene.camera.location=center+direction;scene.camera.rotation_euler=(center-scene.camera.location).to_track_quat('-Z','Y').to_euler();scene.camera.data.ortho_scale=max(size)*1.5
  bpy.ops.wm.save_as_mainfile(filepath=str(dest/'blender-source.blend'))
  scene.render.filepath=str(dest/'cutout.png');bpy.ops.render.render(write_still=True)
  scene.camera.location=center+Vector((0,0,10));scene.camera.rotation_euler=(0,0,0);scene.camera.data.ortho_scale=max(size[0],size[1])*1.25
  scene.render.filepath=str(dest/'blender-top.png');bpy.ops.render.render(write_still=True)
  raw=(dest/'glb.glb').read_bytes();length,kind=struct.unpack_from('<II',raw,12);gltf=json.loads(raw[20:20+length])
  report=json.loads((out/'source-validation.json').read_text());report.update(variant=variant['name'],catalog_asset_id=variant['asset_id'],bounds_m=data['bounds'],triangles=len(data['faces'])*2,vertices=len(mesh.vertices),material_count=len(gltf.get('materials',[])),mesh_count=len(gltf.get('meshes',[])),primitive_count=sum(len(m['primitives']) for m in gltf.get('meshes',[])),external_resources=[b.get('uri') for b in gltf.get('buffers',[]) if b.get('uri')],rendered_geometry='Actual meshChunk opaque union of Blender-authored sampled solids; no raw overlapped faces rendered',camera={'projection':'orthographic','elevation_degrees':35.2643897,'direction':list(direction),'resolution':[768,768],'lighting':'neutral three-area Cycles; AgX; bloom off'},files={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in dest.iterdir() if p.is_file()})
  report['surface']=surface;report['triangles']=surface['triangles']
  assert not report['external_resources']
  assert all(math.isfinite(n) for v in mesh.vertices for n in v.co)
  assert all(p.normal.length>.99 for p in mesh.polygons)
  (dest/'validation.json').write_text(json.dumps(report,indent=2)+'\n')
  print(json.dumps({'rendered':job['slug'],'variant':variant['name'],'triangles':report['triangles']}),flush=True)
