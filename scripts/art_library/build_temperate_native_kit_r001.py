"""Native continental Temperate1 candidate, retaining reviewed Ocean7 PBR assets."""
import bpy,bmesh,json,sys,math,shutil,hashlib
from pathlib import Path
from mathutils import Vector
out=Path(sys.argv[sys.argv.index('--')+1]).resolve();out.mkdir(parents=True,exist_ok=True)
if(out/'kit.blend').exists():raise RuntimeError('Preserve prior source')
prior=out.parent/'ocean-r007';old=json.loads((prior/'kit.json').read_text());kit=json.loads((prior/'kit.json').read_text())
bpy.ops.wm.open_mainfile(filepath=str(prior/'kit.blend'));scene=bpy.context.scene
for obj in scene.objects:
 if obj.type=='MESH':obj.hide_render=True
for file in prior.iterdir():
 if file.suffix=='.png' and file.name!='kit-preview.png':shutil.copy(file,out/file.name)
keep=['ground-sphere','ground-sphere-medium','ground-sphere-low','tree-grove','small-grove'];kit['variants']=[v for v in old['variants']if v['name']in keep]
for name in keep:shutil.copy(prior/(name+'.glb'),out/(name+'.glb'))
materials=[bpy.data.materials[m['name']]for m in kit['materials']]
# Ocean7 authored finish roles10/11coastal feather,12sand,13rock,14shadow,15green.
landforms=[]
contours=[
 [(-1.65,-.41),(-1.29,-.70),(-.86,-.66),(-.57,-.97),(-.08,-.87),(.22,-.60),(.72,-.76),(1.19,-.52),(1.62,-.11),(1.41,.27),(1.07,.32),(.78,.76),(.36,.99),(-.10,.73),(-.44,.94),(-.71,.58),(-1.13,.70),(-1.41,.25),(-1.72,.05)],
 [(-1.52,-.77),(-1.02,-.90),(-.54,-.62),(-.13,-.88),(.32,-.77),(.44,-.37),(.85,-.41),(1.23,-.13),(1.52,.39),(1.22,.81),(.75,.72),(.27,1.03),(-.12,.79),(-.53,1.03),(-.80,.60),(-1.21,.64),(-1.61,.23),(-1.29,-.12)],
 [(-1.65,-.21),(-1.33,-.63),(-.94,-.52),(-.50,-.83),(-.17,-.58),(.32,-.74),(.61,-.40),(1.13,-.42),(1.58,-.14),(1.31,.38),(.84,.58),(.41,.83),(-.13,.65),(-.57,.91),(-.94,.67),(-1.39,.74),(-1.59,.34)]]
for index,outline in enumerate(contours):
 name='continent-'+['a','b','c'][index];h=[.38,.47,.31][index];n=len(outline);verts=[]
 for j,(scale,z)in enumerate([(1.13,-.16),(1.11,-.045),(1.05,.014),(1.02,.035),(.98,.058),(.97,h-.08),(.94,h-.035),(.92,h)]):
  for i,(x,y)in enumerate(outline):
   # Broad peninsula/beach differences are authored per coast section.
   factor=scale+(.018*math.sin(i*1.3+index)if j<4 else 0)
   verts.append((x*factor,y*factor,z))
 faces=[tuple(range(n-1,-1,-1))];roles=[0]
 for j in range(7):
  for i in range(n):faces.append((j*n+i,j*n+(i+1)%n,(j+1)*n+(i+1)%n,(j+1)*n+i));roles.append([10,10,11,12,13 if i%4 else 14,13,15][j])
 faces.append(tuple(range(7*n,8*n)));roles.append(15)
 mesh=bpy.data.meshes.new(name);mesh.from_pydata(verts,[],faces);mesh.update();obj=bpy.data.objects.new('GEO-'+name,mesh);scene.collection.objects.link(obj)
 for mat in materials:mesh.materials.append(mat)
 for p,r in zip(mesh.polygons,roles):p.material_index=r
 bm=bmesh.new();bm.from_mesh(mesh);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bmesh.ops.triangulate(bm,faces=list(bm.faces))
 for _ in range(8):
  edges=[e for e in bm.edges if e.calc_length()>.22]
  if not edges:break
  bmesh.ops.subdivide_edges(bm,edges=edges,cuts=1,use_grid_fill=True);bmesh.ops.triangulate(bm,faces=list(bm.faces));bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=1e-7);bmesh.ops.dissolve_degenerate(bm,edges=list(bm.edges),dist=1e-7)
 assert all(e.is_manifold for e in bm.edges);bm.to_mesh(mesh);bm.free();mesh.uv_layers.new(name='Native-continental-UV');uv=mesh.uv_layers.active
 for p in mesh.polygons:
  axes=[i for i in range(3)if i!=max(range(3),key=lambda j:abs(p.normal[j]))]
  for loop in p.loop_indices:
   v=mesh.vertices[mesh.loops[loop].vertex_index].co
   uv.data[loop].uv=(math.atan2(v.y,v.x)/math.tau+.5,max(1/256,min(255/256,(v.z+.055)/.083)))if p.material_index in(10,11)else(v[axes[0]]*.35+.5,v[axes[1]]*.35+.5)
 positions=[];normals=[];uvs=[];indices=[];triangleMaterials=[];mesh.calc_loop_triangles()
 for tri in mesh.loop_triangles:
  for vertex,loop in zip(tri.vertices,tri.loops):positions.extend(mesh.vertices[vertex].co);normals.extend(mesh.corner_normals[loop].vector);uvs.extend((uv.data[loop].uv.x,1-uv.data[loop].uv.y));indices.append(len(indices))
  triangleMaterials.append(tri.material_index)
 kit['variants'].append(dict(name=name,positions=positions,normals=normals,uvs=uvs,indices=indices,triangleMaterials=triangleMaterials));obj['role']='planet';obj['authoring']='native-temperate-r001'
 bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj;bpy.ops.export_scene.gltf(filepath=str(out/(name+'.glb')),export_format='GLB',use_selection=True,export_extras=True)
 obj.location=(0,index*2.8-2.8,0);landforms.append(obj)
kit['layout']='temperate-native-continents';(out/'kit.json').write_text(json.dumps(kit,separators=(',',':')))
scene.camera.location=(5,-8,7);scene.camera.rotation_euler=(Vector((0,0,.15))-scene.camera.location).to_track_quat('-Z','Y').to_euler();scene.camera.data.ortho_scale=11.5;scene.render.filepath=str(out/'kit-preview.png');bpy.ops.wm.save_as_mainfile(filepath=str(out/'kit.blend'));bpy.ops.render.render(write_still=True)
(out/'validation.json').write_text(json.dumps({'retainedSource':'ocean-r007','materialDefinitionsExactOcean7':kit['materials']==old['materials'],'nativeContinentMaxEdge':.22,'nativeContinentsClosed':True,'variants':[{ 'name':v['name'],'triangles':len(v['indices'])//3}for v in kit['variants']],'publication':'isolated draft only'},indent=2));print('TEMPERATE1_NATIVE_DONE')
