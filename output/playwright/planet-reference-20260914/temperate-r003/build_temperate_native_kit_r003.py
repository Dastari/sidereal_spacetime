"""Native continental Temperate3 candidate, retaining reviewed Ocean7 PBR assets."""
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
# Two authored untextured ordinary PBR stone strata; existing Ocean7 water,
# maps and all original material definitions remain byte-for-byte unchanged.
for name,color in [('warm-coastal-stratum',(.43,.28,.16)),('sunlit-coastal-stratum',(.60,.43,.25))]:
 mat=bpy.data.materials.new(name);mat.use_nodes=True;p=mat.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Roughness'].default_value=.89;materials.append(mat);kit['materials'].append(dict(name=name,linearColor=list(color),roughness=.89))

# Ocean7 authored finish roles10/11coastal feather,12sand,13rock,14shadow,15green.
landforms=[]
contours=[
 [(-1.65,-.41),(-1.29,-.70),(-.86,-.66),(-.57,-.97),(-.08,-.87),(.22,-.60),(.72,-.76),(1.19,-.52),(1.62,-.11),(1.41,.27),(1.07,.32),(.78,.76),(.36,.99),(-.10,.73),(-.44,.94),(-.71,.58),(-1.13,.70),(-1.41,.25),(-1.72,.05)],
 [(-1.52,-.77),(-1.02,-.90),(-.54,-.62),(-.13,-.88),(.32,-.77),(.44,-.37),(.85,-.41),(1.23,-.13),(1.52,.39),(1.22,.81),(.75,.72),(.27,1.03),(-.12,.79),(-.53,1.03),(-.80,.60),(-1.21,.64),(-1.61,.23),(-1.29,-.12)],
 [(-1.65,-.21),(-1.33,-.63),(-.94,-.52),(-.50,-.83),(-.17,-.58),(.32,-.74),(.61,-.40),(1.13,-.42),(1.58,-.14),(1.31,.38),(.84,.58),(.41,.83),(-.13,.65),(-.57,.91),(-.94,.67),(-1.39,.74),(-1.59,.34)]]
for index,outline in enumerate(contours):
 # Selected long coast sections have native eroded coves and unequal promontories.
 original=outline;outline=[]
 for i,(x,y) in enumerate(original):
  nx,ny=original[(i+1)%len(original)];outline.append((x,y))
  if i in(1,4,7,10,13):
   outline.extend([((x*.62+nx*.38)*.93,(y*.62+ny*.38)*.93),((x*.40+nx*.60)*.79,(y*.40+ny*.60)*.79),((x*.23+nx*.77)*.97,(y*.23+ny*.77)*.97)])

 name='continent-'+['a','b','c'][index];h=[.22,.27,.19][index];n=len(outline);verts=[]
 for j,(scale,z)in enumerate([(1.13,-.16),(1.11,-.045),(1.05,.014),(1.02,.035),(.98,.058),(.97,h-.08),(.94,h-.035),(.92,h)]):
  for i,(x,y)in enumerate(outline):
   # Broad peninsula/beach differences are authored per coast section.
   factor=scale+((.026+.028*math.sin(i*.71))*math.sin(i*1.3+index)if j<4 else 0)
   selected=(x< -1.05 or (x>.93 and y<.42) or (y<-.65 and -.7<x<.3))
   if selected and j<3:factor+=[.14,.17,.07][j]*(.65+.35*math.sin(i*.9+index)**2)
   zz=z
   if selected and j in(4,5,6):zz+=.024*math.sin(i*.91+index)*(1 if j<6 else .4)
   verts.append((x*factor,y*factor,zz))
 faces=[tuple(range(n-1,-1,-1))];roles=[0]
 for j in range(7):
  for i in range(n):
   x,y=outline[i];selected=(x< -1.05 or(x>.93 and y<.42))
   faces.append((j*n+i,j*n+(i+1)%n,(j+1)*n+(i+1)%n,(j+1)*n+i));roles.append((16 if j==4 else 17)if selected and j in(4,5)else[10,10,11,12,13 if i%4 else 14,13,15][j])
 faces.append(tuple(range(7*n,8*n)));roles.append(15)
 # Closed unequal inland terraces and stepped coastal buttresses. These
 # solids overlap roots with the main cap; no planar facade or height texture.
 def ledge(cx,cy,sx,sy,top,root):
  poly=[(-.95,-.42),(-.51,-.80),(-.12,-.65),(.26,-.89),(.75,-.50),(.93,-.12),(.67,.32),(.86,.53),(.21,.82),(-.16,.58),(-.63,.72),(-.88,.23)]
  start=len(verts);count=len(poly)
  for z,f in [(root,1.09),(top-.07,1.03),(top-.055,.94),(top-.012,.94),(top,.89)]:
   verts.extend((cx+x*sx*f,cy+y*sy*f,z)for x,y in poly)
  faces.append(tuple(start+i for i in range(count-1,-1,-1)));roles.append(13)
  for j in range(4):
   for i in range(count):faces.append((start+j*count+i,start+j*count+(i+1)%count,start+(j+1)*count+(i+1)%count,start+(j+1)*count+i));roles.append(15 if j in(1,3)else 13 if i%4 else 14)
  faces.append(tuple(start+4*count+i for i in range(count)));roles.append(15)
 for cx,cy,sx,sy,dh in[(-.75,.10,.56,.48,.10),(.15,.32,.55,.41,.16),(.80,-.18,.40,.31,.07)]:ledge(cx,cy,sx,sy,h+dh,h-.04)
 for cx,cy,sx,sy,top in[(-1.32,-.24,.31,.28,h*.56),(.95,.38,.31,.28,h*.72),(-.40,-.68,.29,.23,h*.42)]:ledge(cx,cy,sx,sy,top,-.08)
 # Unequal exposed cliff buttresses break selected long coast sectors.
 # Their offset ledges and tapered roots avoid another concentric contour band.
 for k,(cx,cy,sx,sy,top)in enumerate([(-1.46,-.43,.20,.15,h+.025),(-1.62,-.22,.12,.17,h*.81),(-1.42,.36,.17,.14,h*.64),(-1.25,.49,.11,.12,h*.91),(1.27,-.26,.17,.15,h+.03),(1.43,-.04,.13,.12,h*.67),(.97,-.44,.16,.11,h*.76),(-.38,-.78,.15,.11,h*.51)]):
  poly=[(-1,-.42),(-.30,-.85),(.42,-.68),(.88,-.22),(.73,.40),(.12,.73),(-.61,.51)]
  start=len(verts);count=len(poly)
  for z,f,dx,dy in[(-.10,1.25,-.03,.02),(top*.44,1.15,0,0),(top*.51,.89,.025,-.01),(top-.016,.84,.025,-.01),(top,.75,.025,-.01)]:verts.extend((cx+x*sx*f+dx,cy+y*sy*f+dy,z)for x,y in poly)
  faces.append(tuple(start+i for i in range(count-1,-1,-1)));roles.append(13)
  for j in range(4):
   for i in range(count):faces.append((start+j*count+i,start+j*count+(i+1)%count,start+(j+1)*count+(i+1)%count,start+(j+1)*count+i));roles.append(16 if j==0 else 17 if j in(1,2)else 15)
  faces.append(tuple(start+4*count+i for i in range(count)));roles.append(15 if k%3 else 17)
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
 kit['variants'].append(dict(name=name,positions=positions,normals=normals,uvs=uvs,indices=indices,triangleMaterials=triangleMaterials));obj['role']='planet';obj['authoring']='native-temperate-r003'
 bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj;bpy.ops.export_scene.gltf(filepath=str(out/(name+'.glb')),export_format='GLB',use_selection=True,export_extras=True)
 obj.location=(0,index*2.8-2.8,0);landforms.append(obj)
kit['layout']='temperate-native-continents';(out/'kit.json').write_text(json.dumps(kit,separators=(',',':')))
scene.camera.location=(5,-8,7);scene.camera.rotation_euler=(Vector((0,0,.15))-scene.camera.location).to_track_quat('-Z','Y').to_euler();scene.camera.data.ortho_scale=11.5;scene.render.filepath=str(out/'kit-preview.png');bpy.ops.wm.save_as_mainfile(filepath=str(out/'kit.blend'));bpy.ops.render.render(write_still=True)
(out/'validation.json').write_text(json.dumps({'retainedSource':'ocean-r007','materialDefinitionsExactOcean7':kit['materials'][:len(old['materials'])]==old['materials'],'nativeContinentMaxEdge':.22,'nativeContinentsClosed':True,'variants':[{ 'name':v['name'],'triangles':len(v['indices'])//3}for v in kit['variants']],'publication':'isolated draft only'},indent=2));print('TEMPERATE3_NATIVE_DONE')
