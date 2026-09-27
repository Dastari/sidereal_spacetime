"""Retained native inward doorway mechanism preflight; fresh revisions only.
blender -b -t 2 --python scripts/art_library/build_doorway250.py -- NEW_OUTPUT
Authors the frozen r002 gasket-stroke-channel request. Native qualification scripts
and immutable review evidence are retained beside each authored revision.
"""
import bpy,bmesh,json,math,hashlib,shutil,sys
from pathlib import Path
from mathutils import Matrix,Vector
ROOT=Path(__file__).resolve().parents[2];OUT=Path(sys.argv[sys.argv.index('--')+1]).resolve();assert not OUT.exists();OUT.mkdir(parents=True)
SPEC=ROOT/'packages/content/src/ship-tileset-doorway-spec.v1.json';sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest();assert sha(SPEC)=='e276e0d5290ca0fb417cb6519911cf41c37833f2c15d58f6ad076e541b216ef9';spec=json.loads(SPEC.read_text())
for src in spec['sources']:assert sha(ROOT/src['path'])==src['sha256'],src['path']
shutil.copy2(SPEC,OUT/SPEC.name);shutil.copy2(__file__,OUT/'recipe.py')
base=ROOT/'assets/art-library/designs/shipyard.structure.boundary-kit/revisions'
bpy.ops.wm.open_mainfile(filepath=str(base/'r001/boundary-kit.blend'))
T=Matrix.Translation((0,0,-.1875))@Matrix.Diagonal((1,-1,1,1));keep=[o for o in bpy.data.objects if o.type=='MESH' and o.name.startswith('GEO-door-leaf--')];records={}
def transform(o):
 m=T@o.matrix_world.copy();old=o.name
 if o.modifiers:
  assert not o.data.shape_keys
  dg=bpy.context.evaluated_depsgraph_get();o.data=bpy.data.meshes.new_from_object(o.evaluated_get(dg),preserve_all_data_layers=True,depsgraph=dg);o.modifiers.clear()
 else:o.data=o.data.copy()
 o.data.transform(m,shape_keys=True);o.data.flip_normals();o.parent=None;o.matrix_world=Matrix.Identity(4);o.hide_render=False;o.hide_set(False)
 o.name=old.replace('GEO-door-','GEO-inward-door-');o['source_object']=old;o['approval']='unapproved';o['transform']='world x,-y,z-.1875; exactly once';o['physicalQualification']='pending'
 o.data.update();bm=bmesh.new();bm.from_mesh(o.data);assert all(e.is_manifold for e in bm.edges),o.name;assert bm.calc_volume(signed=True)>0,o.name;bm.free()
 assert not o.modifiers,[(o.name,m.name) for m in o.modifiers]
 records[o.name]={'source':old,'sourceWorldThenTransform':[list(row) for row in m],'materials':[m.name for m in o.data.materials],'vertices':len(o.data.vertices),'triangles':sum(len(p.vertices)-2 for p in o.data.polygons),'shapeKeys':[] if not o.data.shape_keys else [k.name for k in o.data.shape_keys.key_blocks]}
for o in keep:transform(o)
for o in list(bpy.data.objects):
 if o not in keep:bpy.data.objects.remove(o,do_unlink=True)
with bpy.data.libraries.load(str(base/'r002/boundary-kit.blend'),link=False) as (src,dst):dst.objects=['GEO-door-perimeter-seal--surface','GEO-door-frame-seal-seat--surface']
new=list(dst.objects)
for o in new:
 for col in list(o.users_collection):col.objects.unlink(o)
 bpy.context.scene.collection.objects.link(o)
bpy.context.view_layer.update()
for o in new:transform(o)
# Replace only the two penetrating straps with connected authored elbows.
oldstraps=[o for o in keep if 'hinge-strap' in o.name];metal=oldstraps[0].data.materials[0]
for o in oldstraps:keep.remove(o);records.pop(o.name,None);bpy.data.objects.remove(o,do_unlink=True)
for zi,z0 in enumerate([.3925,1.7725]):
 xs=[.3125,.3245,.392,.4025];ys=[.0625,.0845,.0965]
 occupied={(0,0),(0,1),(1,1),(2,1),(2,0)};vs=[];ids={};faces=[]
 def face(points):
  row=[]
  for v in points:
   v=tuple(v)
   if v not in ids:ids[v]=len(vs);vs.append(v)
   row.append(ids[v])
  faces.append(row)
 for ix,iy in occupied:
  xa,xb=xs[ix:ix+2];ya,yb=ys[iy:iy+2];za,zb=z0,z0+.1
  for z in [za,zb]:face([(xa,ya,z),(xb,ya,z),(xb,yb,z),(xa,yb,z)])
  for dx,dy,a,b in [(-1,0,(xa,yb),(xa,ya)),(1,0,(xb,ya),(xb,yb)),(0,-1,(xa,ya),(xb,ya)),(0,1,(xb,yb),(xa,yb))]:
   if (ix+dx,iy+dy) not in occupied:face([(*a,za),(*b,za),(*b,zb),(*a,zb)])
 mesh=bpy.data.meshes.new('MESH-native-connected-elbow-'+str(zi));mesh.from_pydata(vs,[],faces);mesh.materials.append(metal)
 bm=bmesh.new();bm.from_mesh(mesh);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));assert all(e.is_manifold for e in bm.edges);bm.to_mesh(mesh);bm.free();mesh.update();uv=mesh.uv_layers.new(name='UVMap')
 for f in mesh.polygons:
  axes=[a for a in range(3) if a!=max(range(3),key=lambda a:abs(f.normal[a]))]
  for li in f.loop_indices:
   v=mesh.vertices[mesh.loops[li].vertex_index].co;uv.data[li].uv=(v[axes[0]],v[axes[1]])
 o=bpy.data.objects.new('GEO-inward-door-leaf--connected-elbow-'+str(zi),mesh);bpy.context.scene.collection.objects.link(o);o['source_object']='new-connected-elbow-'+str(zi);o['approval']='unapproved';o['physicalQualification']='pending';keep.append(o)
 records[o.name]={'source':'new native connected hinge correction','materials':[metal.name],'vertices':len(vs),'triangles':sum(len(f)-2 for f in faces),'shapeKeys':[],'hingeAxisPointM':[.3125,.0625,z0],'leafContactPatch':{'xM':[.392,.4025],'yM':.0625,'zM':[z0,z0+.1]}}

allmeshes=keep+new
for o in list(bpy.data.objects):
 if o not in allmeshes:bpy.data.objects.remove(o,do_unlink=True)
S=bpy.context.scene;S.unit_settings.system='METRIC';S.unit_settings.scale_length=1
for c in list(S.collection.children):
 if not c.objects and not c.children:bpy.data.collections.remove(c)
leaf=keep;gasket=next(o for o in new if 'perimeter' in o.name);seat=next(o for o in new if 'seat' in o.name)
# New native machined full-height frame. Exact orthogonal cells construct
# one closed surface, with explicit seat, gasket stroke and hinge relief voids.
with bpy.data.libraries.load(str(ROOT/'assets/art-library/designs/shipyard.structure.inset-boundary-wall/revisions/r005/blender-source.blend'),link=False) as (src,dst):dst.materials=[n for n in src.materials if n.startswith('MAT-Frontier-side-hull-')]
fmats=[next(m for m in dst.materials if m.name.startswith('MAT-Frontier-side-hull-'+r)) for r in ['pale','dark','steel','red','cyan']]
voids=[((.25,.0625,.002),(.375,.25,2.248)),((.365,.0625,0),(1.635,.0845,2.26)),((.345,.045,0),(.375,.0625,2.28)),((1.625,.045,0),(1.655,.0625,2.28)),((.375,.045,2.25),(1.625,.0625,2.28))]
xs=sorted(set([0,2,.375,1.625]+[b[a][0] for b in voids for a in [0,1]]));ys=sorted(set([0,.25]+[b[a][1] for b in voids for a in [0,1]]));zs=sorted(set([0,3,2.25]+[b[a][2] for b in voids for a in [0,1]]))
cells=set()
for i in range(len(xs)-1):
 for j in range(len(ys)-1):
  for k in range(len(zs)-1):
   p=((xs[i]+xs[i+1])/2,(ys[j]+ys[j+1])/2,(zs[k]+zs[k+1])/2)
   if .375<p[0]<1.625 and p[2]<2.25:continue
   if any(all(lo[a]<p[a]<hi[a] for a in range(3)) for lo,hi in voids):continue
   cells.add((i,j,k))
verts=[];vids={};faces=[];matids=[]
def face(points,material):
 row=[]
 for v in points:
  v=tuple(round(n,12) for n in v)
  if v not in vids:vids[v]=len(verts);verts.append(v)
  row.append(vids[v])
 faces.append(row);matids.append(material)
for i,j,k in cells:
 lo=(xs[i],ys[j],zs[k]);hi=(xs[i+1],ys[j+1],zs[k+1])
 for axis in range(3):
  aa=[a for a in range(3) if a!=axis]
  for sign in [-1,1]:
   neighbor=[i,j,k];neighbor[axis]+=sign
   if tuple(neighbor) in cells:continue
   plane=lo[axis] if sign<0 else hi[axis]
   def loop(m=0,depth=0):
    pp=[]
    for u,v in [(lo[aa[0]]+m,lo[aa[1]]+m),(hi[aa[0]]-m,lo[aa[1]]+m),(hi[aa[0]]-m,hi[aa[1]]-m),(lo[aa[0]]+m,hi[aa[1]]-m)]:
     p=[0,0,0];p[axis]=plane-sign*depth;p[aa[0]]=u;p[aa[1]]=v;pp.append(p)
    return pp
   outer=loop();role=1 if axis==1 and plane==0 else 0 if axis==1 else 2
   if axis==1 and plane==.25 and min(hi[a]-lo[a] for a in aa)>.2:
    rim=loop(.02);groove=loop(.025,.01);panel=loop(.035,.003)
    for a,b,role2 in [(outer,rim,0),(rim,groove,1),(groove,panel,0)]:
     for t in range(4):face([a[t],a[(t+1)%4],b[(t+1)%4],b[t]],role2)
    face(panel,0)
   else:face(outer,role)
mesh=bpy.data.meshes.new('MESH-native-machined-doorway-frame');mesh.from_pydata(verts,[],faces)
for m in fmats:mesh.materials.append(m)
for f,mi in zip(mesh.polygons,matids):f.material_index=mi
bm=bmesh.new();bm.from_mesh(mesh);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));assert all(e.is_manifold for e in bm.edges),'frame manifold';assert bm.calc_volume(signed=True)>0;bm.to_mesh(mesh);bm.free();mesh.update();uv=mesh.uv_layers.new(name='UVMap')
for f in mesh.polygons:
 axes=[a for a in range(3) if a!=max(range(3),key=lambda a:abs(f.normal[a]))]
 for li in f.loop_indices:
  p=mesh.vertices[mesh.loops[li].vertex_index].co;uv.data[li].uv=(p[axes[0]],p[axes[1]])
frame=bpy.data.objects.new('GEO-inward-doorway-frame-2m',mesh);S.collection.objects.link(frame);frame['source_object']='new-native-machined-frame';frame['approval']='unapproved';frame['physicalQualification']='pending';allmeshes.append(frame)
records[frame.name]={'source':'new native machined full-height frame','materials':[m.name for m in fmats],'vertices':len(verts),'triangles':sum(len(f)-2 for f in faces),'shapeKeys':[],'explicitVoidBoxesM':voids,'specSha256':sha(SPEC)}

for name,objects in [('frame',[frame]),('leaf',leaf),('gasket',[gasket]),('seat',[seat]),('retained-mechanism',allmeshes)]:
 bpy.ops.object.select_all(action='DESELECT')
 for o in objects:o.select_set(True)
 bpy.context.view_layer.objects.active=objects[0]
 bpy.ops.export_scene.gltf(filepath=str(OUT/(name+'.glb')),export_format='GLB',use_selection=True,export_yup=True,export_tangents=True,export_morph=True,export_extras=True)
H=Vector(spec['retainedMechanismDerivative']['hingeBindM'])
def pose(v,a):return H+Matrix.Rotation(math.radians(a),3,'Z')@(v-H)
def bounds(vv):return {'minM':[min(v[k] for v in vv) for k in range(3)],'maxM':[max(v[k] for v in vv) for k in range(3)]}
poses=[];conflicts=[]
for angle in [0,15,30,45,60,75,90]:
 vv=[]
 for o in leaf+[gasket]:
  vs=[v.co for v in (o.data.shape_keys.key_blocks['SealRetracted'].data if o==gasket else o.data.vertices)]
  pp=[pose(v,angle) for v in vs];vv+=pp
  for v in pp:
   if 1e-6<v.x<.375-1e-6 and 1e-6<v.y<.25-1e-6 and 1e-6<v.z<3-1e-6:conflicts.append({'object':o.name,'angleDegrees':angle,'vertexM':list(v),'conflict':'inside full left jamb'});break
 poses.append({'angleDegrees':angle,'seal':'retracted','hardwareBounds':bounds(vv)})
for o in allmeshes:
 vv=[v.co for v in o.data.vertices];records[o.name]['closedBounds']=bounds(vv)
 if o.data.shape_keys:records[o.name]['morphBounds']={k.name:bounds([v.co for v in k.data]) for k in o.data.shape_keys.key_blocks}
(OUT/'mechanism-preflight.json').write_text(json.dumps({'specSha256':sha(SPEC),'nodes':records,'poses':poses,'jambConflictSamples':conflicts,'dependentFrame':'new machined frame authored; actual motion/contact validation pending','floorContact':'pending exact retained floor measurement','approval':'unapproved'},indent=2)+'\n')
h=bpy.data.objects.new('SOCK-inward-door-hinge',None);S.collection.objects.link(h);h.location=spec['retainedMechanismDerivative']['hingeSocketM'];h['hingeBindM']=list(H);h['axis']=[0,0,1];h['formula']='h+R(p-h); no extra bind translation';h['qualification']='pending'
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'blender-source.blend'))
print('DOORWAY_PREFLIGHT_READY',len(allmeshes),len(conflicts))
