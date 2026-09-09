import bpy, bmesh, math, json, sys, hashlib, random
from pathlib import Path
from mathutils import Vector
OUT=Path(sys.argv[sys.argv.index('--')+1]);OUT.mkdir(parents=True,exist_ok=True)
FLOOR=Path('packages/content/src/construction-floor-interfaces.json'); floor=json.loads(FLOOR.read_text())
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
S=bpy.context.scene;S.unit_settings.system='METRIC';S.unit_settings.scale_length=1
mats={}
# Shared tangent normal microtexture: normal detail without adding relief polygons.
im=bpy.data.images.new('roof-enamel-micro-normal',width=128,height=128,alpha=True);im.colorspace_settings.name='Non-Color';rng=random.Random(12);pix=[]
for y in range(128):
 for x in range(128):
  nx=rng.uniform(-.026,.026);ny=rng.uniform(-.026,.026);nz=math.sqrt(1-nx*nx-ny*ny);pix.extend((.5+nx*.5,.5+ny*.5,.5+nz*.5,1))
im.pixels.foreach_set(pix);im.filepath_raw=str(OUT/'enamel-normal.png');im.file_format='PNG';im.save();im.pack()
def mat(k,c,rough=.35,metal=0,emit=0,normal=False):
 m=bpy.data.materials.new('MAT-roof-'+k);m.use_nodes=True;m.use_backface_culling=True;n=m.node_tree.nodes.get('Principled BSDF');n.inputs['Base Color'].default_value=(*c,1);n.inputs['Roughness'].default_value=rough;n.inputs['Metallic'].default_value=metal
 if emit:n.inputs['Emission Color'].default_value=(*c,1);n.inputs['Emission Strength'].default_value=emit
 if normal:
  tex=m.node_tree.nodes.new('ShaderNodeTexImage');tex.image=im;nm=m.node_tree.nodes.new('ShaderNodeNormalMap');nm.inputs['Strength'].default_value=.28;m.node_tree.links.new(tex.outputs['Color'],nm.inputs['Color']);m.node_tree.links.new(nm.outputs['Normal'],n.inputs['Normal'])
 m.diffuse_color=(*c,1);mats[k]=m
mat('structural-core',(.06,.085,.12),.43,.45);mat('pale-enamel',(.51,.57,.66),.30,.025,normal=True);mat('dark-service',(.023,.033,.058),.40,.15);mat('wine-paint',(.22,.027,.045),.31,.04,normal=True);mat('steel',(.31,.40,.49),.24,.8);mat('cyan',(.003,.65,1),.26,.03,2.2);mat('amber',(.90,.36,.035),.32,.03,1.1);mat('ceiling',(.36,.44,.52),.41,.025,normal=True)

# Flat ceiling panel seams are authored texture detail. The pressure/contact face remains planar.
cm=mats['ceiling'];cn=cm.node_tree.nodes.get('Principled BSDF');size=256
images={}
for name in ['ceiling-basecolor','ceiling-normal','ceiling-roughness']:
 img=bpy.data.images.new(name,width=size,height=size,alpha=True)
 if name!='ceiling-basecolor':img.colorspace_settings.name='Non-Color'
 images[name]=img
pixels={k:[]for k in images}
def groove(u,v):
 edge=min(u,1-u,v,1-v)
 return -math.exp(-((edge-.035)/.008)**2)*.0012
for y in range(size):
 for x in range(size):
  u=(x+.5)/size;v=(y+.5)/size;edge=min(u,1-u,v,1-v);slot=math.exp(-((edge-.035)/.009)**2);grain=rng.uniform(-.003,.003)
  pixels['ceiling-basecolor'].extend((.40-slot*.16+grain,.47-slot*.17+grain,.55-slot*.18+grain,1))
  step=1/size;dx=(groove(u+step,v)-groove(u-step,v))/(step*2);dy=(groove(u,v+step)-groove(u,v-step))/(step*2);vec=Vector((-dx,-dy,1)).normalized()
  pixels['ceiling-normal'].extend(tuple(.5+n*.5 for n in vec)+(1,));r=.4+slot*.18;pixels['ceiling-roughness'].extend((r,r,r,1))
for name,img in images.items():
 img.pixels.foreach_set(pixels[name]);img.filepath_raw=str(OUT/(name+'.png'));img.file_format='PNG';img.save();img.pack();tex=cm.node_tree.nodes.new('ShaderNodeTexImage');tex.image=img
 if name=='ceiling-basecolor':cm.node_tree.links.new(tex.outputs['Color'],cn.inputs['Base Color'])
 elif name=='ceiling-roughness':cm.node_tree.links.new(tex.outputs['Color'],cn.inputs['Roughness'])
 else:
  norm=cm.node_tree.nodes.new('ShaderNodeNormalMap');cm.node_tree.links.new(tex.outputs['Color'],norm.inputs['Color']);cm.node_tree.links.new(norm.outputs['Normal'],cn.inputs['Normal'])

masters=bpy.data.collections.new('AUTHORING-NATIVE-ROOF');S.collection.children.link(masters)
objects={};roots={};current=None

def signedarea(p):return sum(p[i][0]*p[(i+1)%len(p)][1]-p[(i+1)%len(p)][0]*p[i][1]for i in range(len(p)))/2

def clip(p,a,b,offset=0):
 dx=b[0]-a[0];dy=b[1]-a[1];limit=offset*math.hypot(dx,dy)
 def d(q):return dx*(q[1]-a[1])-dy*(q[0]-a[0])-limit
 out=[]
 for i,u in enumerate(p):
  v=p[(i+1)%len(p)];du=d(u);dv=d(v)
  if du>=-1e-10:out.append(u)
  if (du>=0)!=(dv>=0):
   t=du/(du-dv);out.append((u[0]+(v[0]-u[0])*t,u[1]+(v[1]-u[1])*t))
 return out

def inset(p,dist):
 out=p
 for a,b in zip(p,p[1:]+p[:1]):out=clip(out,a,b,dist)
 return out

def prism(name,p,lo,hi,material,bevel=0,bottommat=None):
 p=list(p)
 while len(p)>=3:
  keep=[]
  for i,b in enumerate(p):
   a=p[i-1];c=p[(i+1)%len(p)];cr=(b[0]-a[0])*(c[1]-b[1])-(b[1]-a[1])*(c[0]-b[0])
   if math.dist(a,b)>1e-6 and abs(cr)>1e-9:keep.append(b)
  if len(keep)==len(p):break
  p=keep
 if len(p)<3 or signedarea(p)<1e-8:return
 if name.startswith('perimeter-rail') and min(math.dist(a,b)for a,b in zip(p,p[1:]+p[:1]))<.012:return
 n=len(p);v=[(x,y,z)for z in [lo,hi]for x,y in p];f=[tuple(range(n-1,-1,-1)),tuple(range(n,n*2))]+[(i,(i+1)%n,(i+1)%n+n,i+n)for i in range(n)]
 mesh=bpy.data.meshes.new('mesh-'+current+'-'+name);mesh.from_pydata(v,[],f);mesh.update();o=bpy.data.objects.new('GEO-'+current+'--'+name,mesh);masters.objects.link(o);o.parent=roots[current];objects[current].append(o);mesh.materials.append(mats[material])
 if bottommat:mesh.materials.append(mats[bottommat]);mesh.polygons[0].material_index=1
 uv=mesh.uv_layers.new(name='UVMap')
 for face in mesh.polygons:
  axis=max(range(3),key=lambda i:abs(face.normal[i]));dims=[i for i in range(3)if i!=axis]
  for li in face.loop_indices:
   co=mesh.vertices[mesh.loops[li].vertex_index].co;uv.data[li].uv=(co[dims[0]]*(1 if bottommat and face.index==0 else 3),co[dims[1]]*(1 if bottommat and face.index==0 else 3))
 if bevel:
  m=o.modifiers.new('Native shallow enamel bevel','BEVEL');m.width=bevel;m.segments=2
  m=o.modifiers.new('Weighted corner normals','WEIGHTED_NORMAL');m.keep_sharp=True
 return o

def rect(x0,y0,x1,y1):return[(x0,y0),(x1,y0),(x1,y1),(x0,y1)]
def segmentbox(a,b,width):
 dx=b[0]-a[0];dy=b[1]-a[1];L=math.hypot(dx,dy);nx=-dy/L*width/2;ny=dx/L*width/2
 return [(a[0]-nx,a[1]-ny),(b[0]-nx,b[1]-ny),(b[0]+nx,b[1]+ny),(a[0]+nx,a[1]+ny)]

for t in floor['parts']:
 current=t['id'];objects[current]=[];r=bpy.data.objects.new('ROOT-'+current,None);masters.objects.link(r);roots[current]=r;p=[tuple(v/32 for v in xy)for xy in t['footprint']]
 # Exact un-beveled structural backing closes every nominal shared edge, including acute tips.
 core=prism('continuous-backing',p,0,.125,'structural-core',bottommat='ceiling')
 q=inset(p,.065);prism('inset-top-tray',q,.124,.140,'dark-service',.002)
 # Individually clipped broad enamel panels with bounded visual seam width. No implicit new floor grid.
 xmin=min(x for x,y in p);xmax=max(x for x,y in p);ymin=min(y for x,y in p);ymax=max(y for x,y in p)
 for ix in range(math.ceil(xmax)):
  for iy in range(math.ceil(ymax)):
   c=rect(ix+.025,iy+.025,min(ix+.975,xmax-.025),min(iy+.975,ymax-.025))
   for a,b in zip(q,q[1:]+q[:1]):c=clip(c,a,b)
   if len(c)>=3 and signedarea(c)>.035:prism(f'enamel-panel-{ix}-{iy}',c,.138,.180,'pale-enamel',.006)
 # Recess-looking closed service hatch at polygon centroid, clipped to fit small triangular pieces.
 cx=sum(x for x,y in p)/len(p);cy=sum(y for x,y in p)/len(p)
 patch=rect(cx-.21,cy-.19,cx+.21,cy+.19)
 for a,b in zip(inset(p,.16),inset(p,.16)[1:]+inset(p,.16)[:1]):patch=clip(patch,a,b)
 if len(patch)>=3 and signedarea(patch)>.025:
  prism('closed-service-hatch',patch,.139,.186,'wine-paint',.002)
  for i in range(3):
   sl=rect(cx-.145,cy-.105+i*.083,cx+.145,cy-.087+i*.083)
   for a,b in zip(patch,patch[1:]+patch[:1]):sl=clip(sl,a,b)
   prism('hatch-recess-mark-'+str(i),sl,.1858,.1875,'dark-service',.0003)
 if len(patch)>=3 and signedarea(patch)>.025:
  for k in [-1,1]:
   latch=rect(cx-.13,cy+k*.15-.009,cx+.13,cy+k*.15+.009)
   for u,v in zip(patch,patch[1:]+patch[:1]):latch=clip(latch,u,v,.006)
   prism('hatch-latch-'+str(k),latch,.185,.1875,'steel',.0005)
 # Exact footprint remains untouched: shallow split edge rails lie inside it.
 for i,(a,b)in enumerate(zip(p,p[1:]+p[:1])):
  dx=b[0]-a[0];dy=b[1]-a[1];L=math.hypot(dx,dy)
  if L<.3:continue
  nx=-dy/L;ny=dx/L
  for j in range(max(1,math.ceil(L))):
   ta=.05+j*(L-.1)/max(1,math.ceil(L));tb=.05+(j+1)*(L-.1)/max(1,math.ceil(L))-.018
   aa=(a[0]+dx*ta/L+nx*.033,a[1]+dy*ta/L+ny*.033);bb=(a[0]+dx*tb/L+nx*.033,a[1]+dy*tb/L+ny*.033)
   strip=segmentbox(aa,bb,.036)
   for u,v in zip(p,p[1:]+p[:1]):strip=clip(strip,u,v,.008)
   prism(f'perimeter-rail-{i}-{j}',strip,.125,.171,'steel',.002)
 # One compact status marker, not a light per tile. Emits but exports no actual light.
 a,b=p[0],p[1];L=math.dist(a,b);w=min(.13,L*.18);cx=(a[0]+b[0])/2;cy=(a[1]+b[1])/2+.11
 prism('status-marker',rect(cx-w/2,cy-.012,cx+w/2,cy+.012),.180,.185,'cyan',.001)
 # Underside has an actual continuous face at Z=0; micro normal detail only, no below-ceiling protrusion.

S.render.engine='CYCLES';S.cycles.device='CPU';S.cycles.samples=48;S.cycles.use_denoising=False;S.render.threads_mode='FIXED';S.render.threads=4
S.view_settings.view_transform='AgX';S.world.color=(.06,.08,.12)
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'roof-kit.blend'))
export=bpy.data.collections.new('DERIVED-EXPORT');S.collection.children.link(export);exported=[];stats={}
for slug,obs in objects.items():
 copies=[]
 for ob in obs:
  mesh=bpy.data.meshes.new_from_object(ob.evaluated_get(bpy.context.evaluated_depsgraph_get()));cp=bpy.data.objects.new('EXPORT-'+ob.name,mesh);export.objects.link(cp);copies.append(cp)
 bpy.ops.object.select_all(action='DESELECT')
 for ob in copies:ob.select_set(True)
 bpy.context.view_layer.objects.active=copies[0];bpy.ops.object.join();o=copies[0];o.name='GEO-roof-'+slug+'--surface'
 tri=o.modifiers.new('Export triangles','TRIANGULATE');bpy.ops.object.modifier_apply(modifier=tri.name)
 bm=bmesh.new();bm.from_mesh(o.data);bmesh.ops.dissolve_degenerate(bm,dist=1e-5,edges=list(bm.edges));bm.to_mesh(o.data);bm.free();o.data.update();exported.append(o)
 stats[slug]={'nodePrefix':o.name,'triangles':len(o.data.polygons),'vertices':len(o.data.vertices),'materialSlots':len(o.data.materials),'bounds':{'min':[min(v.co[i]for v in o.data.vertices)for i in range(3)],'max':[max(v.co[i]for v in o.data.vertices)for i in range(3)]}}
bpy.ops.object.select_all(action='DESELECT')
for o in exported:o.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(OUT/'kit.glb'),export_format='GLB',use_selection=True,export_apply=True,export_yup=True,export_texcoords=True,export_normals=True,export_tangents=True,export_materials='EXPORT')
(OUT/'geometry-report.json').write_text(json.dumps(stats,indent=2))
for o in exported:bpy.data.objects.remove(o,do_unlink=True)
# Evidence board: twelve source objects, whole pieces shown without camera cropping.
for i,(slug,r)in enumerate(roots.items()):r.location=((i%4)*4.7,(i//4)*5.0,0)
def light(name,pos,power,size):
 d=bpy.data.lights.new(name,'AREA');d.energy=power;d.shape='DISK';d.size=size;o=bpy.data.objects.new(name,d);S.collection.objects.link(o);o.location=pos;o.rotation_euler=(Vector((8,6,0))-o.location).to_track_quat('-Z','Y').to_euler()
light('KEY',(5,-6,15),2400,10);light('FILL',(18,10,12),1900,9)
d=bpy.data.cameras.new('review-camera');cam=bpy.data.objects.new('review-camera',d);S.collection.objects.link(cam);S.camera=cam;d.type='ORTHO'
def capture(name,pos,target,scale,w,h,transparent=False):
 cam.location=pos;cam.rotation_euler=(Vector(target)-cam.location).to_track_quat('-Z','Y').to_euler();d.ortho_scale=scale;S.render.resolution_x=w;S.render.resolution_y=h;S.render.resolution_percentage=100;S.render.image_settings.file_format='PNG';S.render.image_settings.color_mode='RGBA';S.render.film_transparent=transparent;S.render.filepath=str(OUT/name);bpy.ops.render.render(write_still=True)
capture('all-shapes-top.png',(8,7,24),(8,7,0),24,1600,1200)
capture('all-shapes-oblique.png',(24,-22,35),(8,7,0),27,1600,1200)
for slug,obs in objects.items():
 for o in obs:o.hide_render=slug!='square-2m'
roots['square-2m'].location=(0,0,0)
capture('square-close.png',(3,-4,3),(1,1,.1),3.3,1000,900,True)
# A real underside view with flipped module, keeping datums in source intact.
roots['square-2m'].rotation_euler.x=math.pi
capture('underside-close.png',(3,-4,3),(1,-1,-.08),3.3,1000,900,True)
roots['square-2m'].rotation_euler.x=0
for slug,obs in objects.items():
 for allobs in objects.values():
  for ob in allobs:ob.hide_render=True
 for ob in obs:ob.hide_render=False
 roots[slug].location=(0,0,0);roots[slug].rotation_euler=(0,0,0)
 bounds=stats[slug]['bounds'];cx=(bounds['max'][0]+bounds['min'][0])/2;cy=(bounds['max'][1]+bounds['min'][1])/2;extent=max(bounds['max'][0]-bounds['min'][0],bounds['max'][1]-bounds['min'][1])
 capture('variant-'+slug+'.png',(cx+4,cy-6,7),(cx,cy,.08),extent*1.5,900,700,True)
print('ROOF_CANDIDATE_COMPLETE',json.dumps({'parts':len(stats),'triangles':sum(s['triangles']for s in stats.values())}))
