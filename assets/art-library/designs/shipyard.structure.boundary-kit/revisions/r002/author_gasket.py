import bpy,bmesh,math,json,sys,hashlib
from pathlib import Path
from mathutils import Vector
OUT=Path(sys.argv[sys.argv.index('--')+1]);OUT.mkdir(parents=True,exist_ok=True)
BASE=Path('assets/art-library/designs/shipyard.structure.boundary-kit/revisions/r001')
bpy.ops.wm.open_mainfile(filepath=str((BASE/'boundary-kit.blend').resolve()))
S=bpy.context.scene
# Additive candidate only. Original r001 native meshes/modifiers are left intact.
new=bpy.data.collections.new('AUTHORING-ADDITIVE-DOOR-SEAL-R002');S.collection.children.link(new)
rubber=bpy.data.materials.new('MAT-door-elastomer');rubber.use_nodes=True;rubber.use_backface_culling=True;n=rubber.node_tree.nodes.get('Principled BSDF');n.inputs['Base Color'].default_value=(.014,.024,.032,1);n.inputs['Roughness'].default_value=.62;n.inputs['Metallic'].default_value=0
steel=bpy.data.materials.get('MAT-boundary-steel');newmat=steel.copy();newmat.name='MAT-gasket-contact-seat';newmat.use_backface_culling=True;newmat.node_tree.nodes.get('Principled BSDF').inputs['Roughness'].default_value=.32

def uv(mesh):
 layer=mesh.uv_layers.new(name='UVMap')
 for face in mesh.polygons:
  axis=max(range(3),key=lambda i:abs(face.normal[i]));dims=[i for i in range(3)if i!=axis]
  for li in face.loop_indices:
   co=mesh.vertices[mesh.loops[li].vertex_index].co;layer.data[li].uv=(co[dims[0]],co[dims[1]])

def mesh_object(name,vertices,faces,mat):
 me=bpy.data.meshes.new(name+'-mesh');me.from_pydata(vertices,[],faces);me.update();bm=bmesh.new();bm.from_mesh(me);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(me);bm.free();me.update();me.materials.append(mat);uv(me);ob=bpy.data.objects.new(name,me);new.objects.link(ob);return ob

# X/Z contours in the inherited leaf-local coordinates; same pivot as original leaf.
# Deployed outer boundary overhangs the leaf face onto fixed frame seats, not into the aperture.
outer=[(.0525,.1875),(1.3225,.1875),(1.3225,2.4475),(.0525,2.4475)]
inner=[(.0775,.2135),(1.2975,.2135),(1.2975,2.4215),(.0775,2.4215)]
retracted=[(.0685,.1955),(1.3065,.1955),(1.3065,2.4295),(.0685,2.4295)]
# Negative local Y is outside the rigid front face: no inaccessible backing pocket.
verts=[(x,y,z)for y in [-.009,0]for contour in [outer,inner]for x,z in contour]
faces=[]
for i in range(4):
 j=(i+1)%4
 faces.extend([(i,j,j+4,i+4),(8+i,12+i,12+j,8+j),(i,8+i,8+j,j),(4+i,4+j,12+j,12+i)])
ring=mesh_object('GEO-door-perimeter-seal--surface',verts,faces,rubber);ring.location=(.3125,-.0625,0)
ring.shape_key_add(name='Basis');key=ring.shape_key_add(name='SealRetracted')
for yi,y in enumerate([-.022,0]):
 for ci,contour in enumerate([retracted,inner]):
  for i,(x,z)in enumerate(contour):key.data[yi*8+ci*4+i].co=(x,y,z)
ring.data.shape_keys.key_blocks['SealRetracted'].slider_min=0;ring.data.shape_keys.key_blocks['SealRetracted'].slider_max=1
ring['interface']='Leaf-mounted face gasket;0deployed only at closed hinge;1retracted before hinge motion;no authority or pressure rating'

# Fixed contact strips outside the exact clear aperture. No threshold crosses the floor opening.
boxes=[('left',(.345,-.0625,.1875),(.375,-.045,2.4675)),('right',(1.625,-.0625,.1875),(1.655,-.045,2.4675)),('top',(.375,-.0625,2.4375),(1.625,-.045,2.4675))]
vs=[];fs=[]
for name,lo,hi in boxes:
 off=len(vs);vs += [(x,y,z)for z in [lo[2],hi[2]]for y in [lo[1],hi[1]]for x in [lo[0],hi[0]]]
 fs += [tuple(off+i for i in f)for f in [(0,2,3,1),(4,5,7,6),(0,1,5,4),(2,6,7,3),(0,4,6,2),(1,3,7,5)]]
seat=mesh_object('GEO-door-frame-seal-seat--surface',vs,fs,newmat)
S.render.engine='CYCLES';S.cycles.device='CPU';S.cycles.samples=80;S.cycles.use_denoising=False;S.render.threads_mode='FIXED';S.render.threads=4;S.view_settings.view_transform='AgX'
for ob in S.objects:
 if ob.type=='MESH':ob.hide_set(not(ob.name.startswith('GEO-door-frame-2m--')or ob.name.startswith('GEO-door-leaf--')or ob in [ring,seat]))
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'boundary-kit.blend'))
# Additive export keeps untouched r001 dependency byte-for-byte elsewhere.
bpy.ops.object.select_all(action='DESELECT')
for ob in [ring,seat]:ob.hide_set(False);ob.select_set(True)
bpy.context.view_layer.objects.active=ring
bpy.ops.export_scene.gltf(filepath=str(OUT/'kit.glb'),export_format='GLB',use_selection=True,export_apply=False,export_yup=True,export_texcoords=True,export_normals=True,export_tangents=True,export_materials='EXPORT',export_morph=True,export_morph_normal=True,export_morph_tangent=True,export_extras=True)
geometry={'coordinateSpace':'Blender local metres; ring bind X.3125 Y-.0625 Z0','deployedOuterXZ':outer,'innerXZ':inner,'retractedOuterXZ':retracted,'deployedFrontY':-.009,'retractedFrontY':-.022,'backY':0,'fixedSeatBoxes':[{'id':n,'min':lo,'max':hi}for n,lo,hi in boxes],'dependencyGlbSha256':hashlib.sha256((BASE/'kit.glb').read_bytes()).hexdigest(),'rigidLeafUnchanged':True}
(OUT/'geometry.json').write_text(json.dumps(geometry,indent=2)+'\n')
# Actual source rendering. Only current doorway and new surfaces, plus review floor.
for ob in S.objects:
 if ob.type=='MESH':ob.hide_render=not(ob.name.startswith('GEO-door-frame-2m--')or ob.name.startswith('GEO-door-leaf--')or ob in [ring,seat]);ob.hide_set(False)
floorMat=bpy.data.materials.get('MAT-boundary-recess');me=bpy.data.meshes.new('review-floor');me.from_pydata([(-.2,-1.8,.1875),(2.2,-1.8,.1875),(2.2,.7,.1875),(-.2,.7,.1875)],[],[(0,1,2,3)]);me.materials.append(floorMat);floorob=bpy.data.objects.new('REVIEW-floor',me);S.collection.objects.link(floorob)
def light(name,pos,power,size,target=(1,0,1.4)):
 d=bpy.data.lights.new(name,'AREA');d.energy=power;d.shape='DISK';d.size=size;o=bpy.data.objects.new(name,d);S.collection.objects.link(o);o.location=pos;o.rotation_euler=(Vector(target)-o.location).to_track_quat('-Z','Y').to_euler()
light('KEY',(-2,-5,5),850,4);light('FILL',(4,-2,3),450,3);light('BACK',(1,3,4),700,3)
d=bpy.data.cameras.new('review-camera');cam=bpy.data.objects.new('review-camera',d);S.collection.objects.link(cam);S.camera=cam;d.type='ORTHO'
def capture(name,pos,target,scale,w=1000,h=1100,transparent=False):
 cam.location=pos;cam.rotation_euler=(Vector(target)-cam.location).to_track_quat('-Z','Y').to_euler();d.ortho_scale=scale;S.render.resolution_x=w;S.render.resolution_y=h;S.render.resolution_percentage=100;S.render.image_settings.file_format='PNG';S.render.image_settings.color_mode='RGBA';S.render.film_transparent=transparent;S.render.filepath=str(OUT/name);bpy.ops.render.render(write_still=True)
capture('closed-front.png',(3,-6,3.2),(1,0,1.5),3.5)
capture('closed-back.png',(-2,6,3.2),(1,0,1.5),3.5)
capture('closed-contact-detail.png',(-.6,-1,1.2),(.375,-.063,1.1),.23,1100,900)
key.value=1
capture('retracted-front.png',(3,-6,3.2),(1,0,1.5),3.5)
leafroot=bpy.data.objects['ROOT-door-leaf'];leafroot.rotation_euler.z=-math.pi/2;ring.rotation_euler.z=-math.pi/2
capture('open-front.png',(3,-6,4),(1,-.4,1.5),4.2)
capture('open-back.png',(-2,6,3.5),(1,-.4,1.5),4.2)
# Inspectable source subassembly cutout: actual gasket ring and seat, no recoloring.
leafroot.rotation_euler.z=0;ring.rotation_euler.z=0;key.value=0
for ob in S.objects:
 if ob.type=='MESH':ob.hide_render=ob not in [ring,seat]
capture('seal-and-seat-cutout.png',(3,-5,3.5),(1,0,1.35),3.2,1000,1100,True)
print('GASKET_CANDIDATE_COMPLETE')
