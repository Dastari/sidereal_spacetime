"""Additive native quarter-floor junction plugs; Blender source, not runtime geometry."""
import bpy, bmesh, json, math, sys
from pathlib import Path
from mathutils import Vector
ROOT=Path.cwd(); OUT=Path(sys.argv[sys.argv.index('--')+1]) if '--' in sys.argv else ROOT/'.runtime/construction-enclosure-audit/reproduce-r006';OUT.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
S=bpy.context.scene
native=ROOT/'assets/runtime/assembly/floor/r002/kit.glb'
bpy.ops.import_scene.gltf(filepath=str(native))
all_imported=list(S.objects)
base=next(o for o in all_imported if o.type=='MESH' and o.name.startswith('GEO-part-0b833a4f3016609e9b96--floor'))
base_mesh=base.data.copy(); base_world=base.matrix_world.copy()
for o in all_imported:bpy.data.objects.remove(o,do_unlink=True)
fixtures=bpy.data.collections.new('REVIEW-native-floor-context');S.collection.children.link(fixtures)
models=bpy.data.collections.new('AUTHORED-floor-junction-parts');S.collection.children.link(models)
cutters=bpy.data.collections.new('SOURCE-contact-cutters');S.collection.children.link(cutters)
def clean(o):
 bm=bmesh.new();bm.from_mesh(o.data);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=1e-8);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(o.data);bm.free();o.data.update()
def obj(name,verts,faces,collection):
 me=bpy.data.meshes.new(name+'-mesh');me.from_pydata(verts,[],faces);me.update();o=bpy.data.objects.new(name,me);collection.objects.link(o);clean(o);return o
def box(name,lo,hi,collection):
 vs=[(x,y,z)for z in [lo[2],hi[2]]for y in [lo[1],hi[1]]for x in [lo[0],hi[0]]]
 return obj(name,vs,[(0,2,3,1),(4,5,7,6),(0,1,5,4),(2,6,7,3),(0,4,6,2),(1,3,7,5)],collection)
floors=[]
for i,(x,y)in enumerate([(-1,-1),(-1,0),(0,-1),(0,0)]):
 o=bpy.data.objects.new('REVIEW-quarter-floor-'+str(i),base_mesh.copy());fixtures.objects.link(o);o.matrix_world=base_world;o.location+=Vector((x,y,0));clean(o);floors.append(o)
def difference(o,c,name):
 bpy.context.view_layer.objects.active=o
 mod=o.modifiers.new(name,'BOOLEAN');mod.operation='DIFFERENCE';mod.solver='EXACT';mod.object=c
 bpy.ops.object.modifier_apply(modifier=mod.name)
mat=bpy.data.materials.new('MAT-floor-junction-contact');mat.use_nodes=True;mat.use_backface_culling=True
bs=mat.node_tree.nodes.get('Principled BSDF');bs.inputs['Base Color'].default_value=(.075,.10,.12,1);bs.inputs['Metallic'].default_value=.08;bs.inputs['Roughness'].default_value=.46
parts=[]
derived=json.loads((Path(__file__).resolve().parent/'native-derived-meshes.json').read_text())
for variant in ['interior-four-quarter','partition-four-quarter','door-strip-reserved']:
 # Exact native CSG fitting is preserved as a separate operand derivation. The
 # Blender source retains the editable new contact mesh, native context and PBR.
 data=derived[variant]
 name='GEO-floor-junction-'+variant+'--surface';me=bpy.data.meshes.new(name+'-mesh');me.from_pydata(data['vertices'],[],data['triangles']);me.update();o=bpy.data.objects.new(name,me);models.objects.link(o)
 o.data.materials.clear();o.data.materials.append(mat)
 uv=o.data.uv_layers.new(name='UVMap')
 for p in o.data.polygons:
  axis=max(range(3),key=lambda i:abs(p.normal[i]));dims=[i for i in range(3)if i!=axis]
  for li in p.loop_indices:
   co=o.data.vertices[o.data.loops[li].vertex_index].co;uv.data[li].uv=(co[dims[0]],co[dims[1]])
 o['native_source']='Pinned r002 quarter floors; additive contact subtraction against r005 exact authored wedges where applicable'
 o['status']='Staged geometric candidate only; no pressure rating or publication approval';parts.append(o)
for o in cutters.objects:o.hide_render=True;o.hide_set(True)
# Export only the three actual authored closure variants, keeping native local origin at the junction.
bpy.ops.object.select_all(action='DESELECT')
for o in parts:o.select_set(True)
bpy.context.view_layer.objects.active=parts[0]
bpy.ops.export_scene.gltf(filepath=str(OUT/'kit.glb'),export_format='GLB',use_selection=True,export_normals=True,export_tangents=True,export_materials='EXPORT',export_cameras=False,export_lights=False)
# Source stores both independently editable final meshes and retained actual fitting context/cutters.
for o in parts[1:]:o.hide_render=True;o.hide_set(True)
S.render.engine='CYCLES';S.cycles.device='CPU';S.cycles.samples=32;S.cycles.use_denoising=False;S.render.threads_mode='FIXED';S.render.threads=4;S.view_settings.view_transform='AgX';S.world=bpy.data.worlds.new('Review Space');S.world.color=(.12,.12,.12)
def area(name,pos,power,size):
 d=bpy.data.lights.new(name,'AREA');d.energy=power;d.shape='DISK';d.size=size;o=bpy.data.objects.new(name,d);S.collection.objects.link(o);o.location=pos;o.rotation_euler=(Vector((0,0,.18))-o.location).to_track_quat('-Z','Y').to_euler()
area('Review key',(.1,-.15,.3),4,.25);area('Review fill',(-.1,.1,.2),1,.15)
d=bpy.data.cameras.new('Review camera');cam=bpy.data.objects.new('Review camera',d);S.collection.objects.link(cam);S.camera=cam;d.type='ORTHO';d.clip_start=.0001;d.clip_end=10
S.render.resolution_x=1000;S.render.resolution_y=800;S.render.resolution_percentage=100
cam.location=(.025,-.035,.24);target=Vector((0,0,.181));cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler();d.ortho_scale=.045
for mode in ['before','after']:
 parts[0].hide_render=mode=='before';S.render.filepath=str(OUT/f'junction-{mode}.png');bpy.ops.render.render(write_still=True)
for f in floors:f.hide_render=True
parts[0].hide_render=False;S.render.film_transparent=True;cam.location=(.032,-.04,.26);target=Vector((0,0,.095));cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler();d.ortho_scale=.21;S.render.filepath=str(OUT/'junction-cutout.png');bpy.ops.render.render(write_still=True)
for f in floors:f.hide_render=False
S.render.film_transparent=False;cam.location=(.025,-.035,.24);target=Vector((0,0,.181));cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler();d.ortho_scale=.045
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'boundary-kit.blend'))
report={'parts':[{'name':o.name,'vertices':len(o.data.vertices),'polygons':len(o.data.polygons)}for o in parts],'scope':'Four r002 quarter tiles only; interior and r005 eight-quarter-T partition context variants','status':'Candidate pending actual GLB contact and room audit','floorTopM':.1875,'profileEnvelopeM':[[-.006,-.006,0],[.006,.006,.1875]]}
(OUT/'native-report.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report))
