from pathlib import Path
import bpy,sys,math,json,hashlib,shutil
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2];sys.path.insert(0,str(ROOT/'scripts'))
from voxelize_blender import voxelize
OUT=Path(sys.argv[sys.argv.index('--')+1]);OUT.mkdir(parents=True,exist_ok=True)
SOURCE=ROOT/'.runtime/art-library/hull/r004/context/review-assembly.blend'
bpy.ops.wm.open_mainfile(filepath=str(SOURCE))
REMOVED={'pilot-r004-vestibule-wall-19','pilot-r004-vestibule-wall-20','pilot-r004-airlock-frame-21'}
for pid in REMOVED:
 node=bpy.data.objects.get(pid)
 if node:
  for child in list(node.children_recursive):bpy.data.objects.remove(child,do_unlink=True)
  bpy.data.objects.remove(node,do_unlink=True)

dark=bpy.data.materials['Graphite seals'];metal=bpy.data.materials['Titanium hardware'];red=bpy.data.materials['Service red'];cyan=bpy.data.materials['Canopy marker emitter'];amber=bpy.data.materials['Amber marker'];proxy_mat=bpy.data.materials['Opaque occupancy only']
paints={(state,marked):bpy.data.materials[state+(' nameplate' if marked else ' hull paint')] for state in ['clean','worn','damaged'] for marked in [False,True]};pale=paints['clean',False]
def linear_color(c):return c/12.92 if c<=.04045 else ((c+.055)/1.055)**2.4
outer_red=red.copy();outer_red.name='Outer service paint / palette 15 sRGB 8e345b';outer_red.use_fake_user=True;outer_red.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value=(*[linear_color(int('8e345b'[i:i+2],16)/255) for i in [0,2,4]],1)
active=[]
def poly(name,xy,z0,z1,mat,bevel=0):
 n=len(xy);verts=[(x,y,z) for z in [z0,z1] for x,y in xy];faces=[tuple(reversed(range(n))),tuple(range(n,n*2))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
 mesh=bpy.data.meshes.new(name);mesh.from_pydata(verts,[],faces);mesh.update();o=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(o);o.data.materials.append(mat);uv=mesh.uv_layers.new(name='PanelUV')
 for f in mesh.polygons:
  # Every broad face gets an independent, unmirrored 0..1 panel UV.
  coords=[mesh.vertices[mesh.loops[i].vertex_index].co for i in f.loop_indices];axes=sorted(range(3),key=lambda a:max(v[a] for v in coords)-min(v[a] for v in coords),reverse=True)[:2]
  if abs(f.normal.z)<.5:axes=[axes[0] if axes[0]!=2 else axes[1],2]
  if abs(f.normal.z)<.5:axes=[axes[0] if axes[0]!=2 else axes[1],2]
  for i,v in zip(f.loop_indices,coords):uv.data[i].uv=[(v[a]-min(w[a] for w in coords))/max(.00001,max(w[a] for w in coords)-min(w[a] for w in coords)) for a in axes]
 if bevel:
  b=o.modifiers.new('Authored edge chamfer','BEVEL');b.width=bevel;b.segments=1
  no=o.modifiers.new('Weighted panel normals','WEIGHTED_NORMAL');no.keep_sharp=True
 active.append(o);return o
def box(name,lo,hi,mat,bevel=.012):return poly(name,[(lo[0],lo[1]),(hi[0],lo[1]),(hi[0],hi[1]),(lo[0],hi[1])],lo[2],hi[2],mat,bevel)
def beam(name,a,b,width,depth,mat):
 a,b=Vector(a),Vector(b);delta=b-a
 o=box(name,(-width/2,-depth/2,-delta.length/2),(width/2,depth/2,delta.length/2),mat,.008);o.location=(a+b)/2;o.rotation_euler=delta.to_track_quat('Z','Y').to_euler();return o

def loft(name,points,top,mat):
 n=len(points);m=bpy.data.meshes.new(name);m.from_pydata(points+top,[],[tuple(reversed(range(n))),tuple(range(n,n*2))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]);m.update();o=bpy.data.objects.new(name,m);bpy.context.collection.objects.link(o);m.materials.append(mat)
 uv=m.uv_layers.new(name='AuthoredSurfaceUV')
 for f in m.polygons:
  coords=[m.vertices[m.loops[i].vertex_index].co for i in f.loop_indices];axes=sorted(range(3),key=lambda a:max(v[a] for v in coords)-min(v[a] for v in coords),reverse=True)[:2]
  if abs(f.normal.z)<.5:axes=[axes[0] if axes[0]!=2 else axes[1],2]
  for i,v in zip(f.loop_indices,coords):uv.data[i].uv=[(v[a]-min(w[a] for w in coords))/max(.00001,max(w[a] for w in coords)-min(w[a] for w in coords)) for a in axes]
 active.append(o);return o
def pane(name,a,b,c,d,mat,thickness=.045):
 normal=(Vector(b)-Vector(a)).cross(Vector(d)-Vector(a)).normalized()*thickness/2
 return loft(name,[tuple(Vector(p)-normal) for p in [a,b,c,d]],[tuple(Vector(p)+normal) for p in [a,b,c,d]],mat)

components=[c for c in json.loads((ROOT/'.runtime/art-library/hull/r004/components.json').read_text()) if c['slug']!='vestibule-wall']
for c in components:shutil.copytree(ROOT/'.runtime/art-library/hull/r004'/c['slug'],OUT/c['slug'],dirs_exist_ok=True)
shutil.copytree(ROOT/'.runtime/art-library/hull/r004/maps',OUT/'maps',dirs_exist_ok=True)
proxy_col=bpy.data.collections.new('R006-OUTER-OCCUPANCY');bpy.context.scene.collection.children.link(proxy_col)
def tri(w):return [(0,0),(w,0),(0,2)]
def outer_panel(name,a,b,z0,z1,mat):
 # Quad on an exterior edge; material panels end on the module's mating planes.
 aa,bb=Vector(a),Vector(b);u=(bb-aa).normalized();normal=Vector((u.y,-u.x,0))*.012
 aa+=normal;bb+=normal
 return pane(name,aa+Vector((0,0,z0)),bb+Vector((0,0,z0)),bb+Vector((0,0,z1)),aa+Vector((0,0,z1)),mat,.025)
def bay_surface(name,a,b,t0,t1,z0,z1,mat,offset=.04):
 a,b=Vector(a),Vector(b);u=(b-a).normalized();n=Vector((u.y,-u.x,0));aa=a.lerp(b,t0)+n*offset;bb=a.lerp(b,t1)+n*offset
 o=pane(name,aa+Vector((0,0,z0)),bb+Vector((0,0,z0)),bb+Vector((0,0,z1)),aa+Vector((0,0,z1)),mat,.025)
 # Readable outward sign: front viewer sees increasing along-edge coordinate left to right.
 if 'nameplate' in mat.name:
  for f in o.data.polygons:
   for idx in f.loop_indices:o.data.uv_layers.active.data[idx].uv.x=1-o.data.uv_layers.active.data[idx].uv.x
 return o
def low_bay(a,b,variant):
 # Dedicated low-height variant, not a squeezed copy of a tall side cabinet.
 # Native ribs keep their physical width; reduced center details stay below glazing.
 length=(Vector(b)-Vector(a)).length;rib=.15/length
 bay_surface('GEO-Dark service bay backing',a,b,.015,.985,.08,1.46,dark,.02)
 for t0,t1 in [(.025,.025+rib),(.975-rib,.975)]:
  bay_surface('GEO-Pale structural rib',a,b,t0,t1,.10,1.45,pale,.10)
  bay_surface('GEO-Rib dark coupling',a,b,t0+.01,t1-.01,.52,.65,dark,.12)
 # Top and bottom replaceable plate courses carry the side-armor cadence around bends.
 for i in range(5):
  t0=.12+i*.152;t1=t0+.13
  for z0,z1 in [(.08,.19),(1.34,1.46)]:bay_surface('GEO-Studless edge course',a,b,t0,t1,z0,z1,pale,.08)
 bay_surface('GEO-Dark fixture belt',a,b,.12,.88,1.13,1.31,dark,.07)
 bay_surface('GEO-Cyan fixture housing',a,b,.56,.85,1.14,1.30,metal,.09)
 bay_surface('GEO-Recessed cyan lens',a,b,.595,.815,1.185,1.255,cyan,.107)
 bay_surface('GEO-Amber low marker housing',a,b,.13,.32,.27,.40,dark,.09)
 bay_surface('GEO-Amber low marker',a,b,.16,.29,.305,.365,amber,.11)
 if variant=='nameplate':
  bay_surface('GEO-WAYFARER framed plate',a,b,.13,.87,.45,1.05,paints['clean',True],.065)
 elif variant=='service':
  bay_surface('GEO-Low red service panel',a,b,.15,.85,.45,1.055,outer_red,.065)
  bay_surface('GEO-Service handle',a,b,.73,.78,.65,.86,metal,.09)
  for t in [.2,.8]:bay_surface('GEO-Service fastener',a,b,t,t+.02,.51,.55,metal,.085)
 else:
  bay_surface('GEO-Pale low vent surround',a,b,.13,.87,.45,1.05,pale,.065)
  bay_surface('GEO-Dark inset vent well',a,b,.23,.77,.56,.95,dark,.082)
  for i in range(6):
   t=.255+i*.082;bay_surface('GEO-Vent vertical slot rib',a,b,t,t+.018,.585,.925,metal,.096)
for slug in ['outer-shoulder-transition','outer-roof-collar','outer-diagonal-cheek','outer-bow-bumper']:
 active=[];d=OUT/slug;d.mkdir(exist_ok=True)
 if slug=='outer-shoulder-transition':
  height=lambda y:2.9375-1.375*y/2
  low=poly('PROXY-lower-layer',tri(.75),0,1.25,proxy_mat)
  upper=loft('PROXY-upper-layer',[(x,y,1.25) for x,y in tri(.625)],[(x,y,height(y)) for x,y in tri(.625)],proxy_mat)
  collar_xy=[(0,0),(.375,0),(0,.5)]
 elif slug=='outer-roof-collar':
  height=lambda y:2.9375-1.375*y/2;collar_xy=[(0,0),(.375,0),(0,.5)]
  collar=loft('PROXY-roof-collar',[(x,y,height(y)) for x,y in collar_xy],[(x,y,height(y)+.375*(1-y/.5)) for x,y in collar_xy],proxy_mat)
 elif slug=='outer-diagonal-cheek':
  xy=[(2,0),(4,0),(1,2),(0,2)];poly('PROXY-cheek',[(2.0625,0),(4,0),(1,2),(.0625,2)],0,1.5625,proxy_mat)
 else:
  xy=[(0,0),(4,0),(3.75,.5),(.25,.5)];poly('PROXY-bumper',xy,0,1.5625,proxy_mat)
 proxies=active[:];bpy.context.view_layer.update();sample=voxelize(proxies,.0625);(d/'samples.json').write_text(json.dumps(sample))
 for o in proxies:
  for col in list(o.users_collection):col.objects.unlink(o)
  proxy_col.objects.link(o);o.hide_render=True;o.hide_set(True);o['component_id']=slug;o['representation']='Separate opaque exterior shell proxy'
 active=[]
 if slug=='outer-shoulder-transition':
  poly('GEO-Lower external structure',tri(.75),0,1.25,dark)
  loft('GEO-Tapered upper structural spine',[(x,y,1.25) for x,y in tri(.625)],[(x,y,height(y)) for x,y in tri(.625)],dark)
  # Tall transition carries an upper service frame; low band shares the bow family.
  a=Vector((.75,0,0));b=Vector((0,2,0))
  # The lower profile step is only 1.25m high; use a compact framed service recess.
  bay_surface('GEO-Shoulder lower pale surround',a,b,.055,.945,.12,1.16,pale,.05)
  bay_surface('GEO-Shoulder dark inset service well',a,b,.20,.80,.31,.91,dark,.07)
  for i in range(6):
   t=.235+i*.095;bay_surface('GEO-Shoulder service vent rib',a,b,t,t+.027,.35,.87,metal,.088)
  for t0,t1 in [(.055,.13),(.87,.945)]:bay_surface('GEO-Shoulder pale vertical rib',a,b,t0,t1,.08,1.23,pale,.10)
  bay_surface('GEO-Shoulder amber marker',a,b,.16,.30,.17,.24,amber,.105)
  a=Vector((.625,0,0));b=Vector((0,2,0));n=Vector((2,.625,0)).normalized()*.04
  # Upper stepped structural framing follows native taper height without stretching details.
  aa=a.lerp(b,.06)+n;bb=a.lerp(b,.94)+n
  pane('GEO-Upper taper pale surround',aa+Vector((0,0,1.35)),bb+Vector((0,0,1.35)),bb+Vector((0,0,height(bb.y)-.06)),aa+Vector((0,0,height(aa.y)-.06)),pale,.03)
  bay_surface('GEO-Shoulder upper dark service inset',a,b,.18,.57,1.56,2.02,dark,.075)
  bay_surface('GEO-Shoulder cyan fixture box',a,b,.20,.56,1.65,1.89,metal,.095)
  bay_surface('GEO-Shoulder recessed cyan lens',a,b,.235,.525,1.705,1.835,cyan,.11)
  # Sloped top weather skin with inset fasteners, distinct from replaceable side armor.
  topxy=[(.02,.05),(.59,.05),(.03,1.87)]
  loft('GEO-Shoulder taper top skin',[(x,y,height(y)-.02) for x,y in topxy],[(x,y,height(y)+.018) for x,y in topxy],pale)
 elif slug=='outer-roof-collar':
  loft('GEO-Stepped roof junction collar',[(x,y,height(y)) for x,y in collar_xy],[(x,y,height(y)+.375*(1-y/.5)) for x,y in collar_xy],pale)
 elif slug=='outer-diagonal-cheek':
  poly('GEO-Exterior diagonal structural core',xy,0,1.48,dark)
  a=Vector((4,0,0));b=Vector((1,2,0))
  low_bay(a,a.lerp(b,.5),'service');low_bay(a.lerp(b,.5),b,'vent')
  # Top skin is an external fender below the glazing sill, never interior deck.
  top=[(2.04,.04),(3.87,.04),(1.0,1.94),(.09,1.94)];poly('GEO-Diagonal fender top',top,1.49,1.55,pale,.01)
  mid=a.lerp(b,.50);normal=Vector((2,3,0)).normalized()*.025
  beam('GEO-Cheek amber running lamp',mid+normal+Vector((0,0,.73)),mid+normal+Vector((0,0,.78)),.22,.04,amber)
 else:
  poly('GEO-Forward impact structure',xy,0,1.48,dark)
  # Front edge direction is chosen so the external inscription reads normally.
  low_bay((2,.5,0),(.25,.5,0),'nameplate');low_bay((3.75,.5,0),(2,.5,0),'vent')
  poly('GEO-Nose top lip',[(.04,.04),(3.96,.04),(3.72,.46),(.28,.46)],1.49,1.55,pale,.008)
 visuals=active[:]
 for o in visuals:o['component_id']=slug;o['review_revision']=6;o['representation']='Native separate external structural shell'
 bpy.context.view_layer.update();vs=[o.matrix_world@Vector(v) for o in visuals for v in o.bound_box];bounds={'min':[min(v[i] for v in vs) for i in range(3)],'max':[max(v[i] for v in vs) for i in range(3)]}
 for state in ['clean','worn','damaged']:
  bpy.ops.object.select_all(action='DESELECT')
  for o in visuals:
   o.select_set(True)
   for slot in o.material_slots:
    if slot.material.name.startswith(('clean','worn','damaged')):slot.material=paints[state,'nameplate' in slot.material.name]
  bpy.context.view_layer.objects.active=visuals[0];bpy.ops.export_scene.gltf(filepath=str(d/(state+'.glb')),export_format='GLB',use_selection=True,export_apply=True)
 for o in visuals:
  for slot in o.material_slots:
   if slot.material.name.startswith(('clean','worn','damaged')):slot.material=paints['clean','nameplate' in slot.material.name]
 col=bpy.data.collections.new(slug);bpy.context.scene.collection.children.link(col)
 for o in visuals:
  for old in list(o.users_collection):old.objects.unlink(o)
  col.objects.link(o);o.hide_render=True;o.hide_set(True)
 components.append({'slug':slug,'id':'part-'+hashlib.sha256(('hull-pilot-r6-'+slug).encode()).hexdigest()[:20],'category':'roof' if slug=='outer-roof-collar' else 'superstructure','bounds':bounds,'nominal_dimensions_m':[bounds['max'][i]-bounds['min'][i] for i in range(3)],'collection':slug,'layer':'Exterior armor; not cabin walls'})
context=json.loads((ROOT/'.runtime/art-library/hull/r004/context/wayfarer-final.json').read_text());selected=set(json.loads((ROOT/'.runtime/art-library/hull/r004/context/blender-context-manifest.json').read_text())['included_placement_ids']);placements=[p for p in context['parts'] if p['id'] in selected and p['id'] not in REMOVED];added=[]
def place(slug,x,y,flipped=False):
 comp=next(c for c in components if c['slug']==slug);pid=f'pilot-r005-{slug}-'+('port' if flipped else 'starboard' if slug!='outer-bow-bumper' else 'center')
 p={'id':pid,'assetId':comp['id'],'position':[x,y,-.25],'rotation':0,'flipped':flipped,'removedCells':[]};placements.append(p);added.append(p)
 node=bpy.data.objects.new(pid,None);bpy.context.scene.collection.objects.link(node);node.location=p['position'];node.scale.x=-1 if flipped else 1
 for src in bpy.data.collections[slug].objects:
  o=src.copy();o.data=src.data;bpy.context.scene.collection.objects.link(o);o.parent=node;o.hide_render=False;o.hide_set(False);o['placed_object_id']=pid
place('outer-shoulder-transition',5,9);place('outer-shoulder-transition',-5,9,True)
place('outer-roof-collar',5,9);place('outer-roof-collar',-5,9,True)
place('outer-diagonal-cheek',1,11);place('outer-diagonal-cheek',-1,11,True)
place('outer-bow-bumper',-2,13)
(OUT/'components.json').write_text(json.dumps(components,indent=2));(OUT/'wayfarer.json').write_text(json.dumps({'schema':'sidereal.assembly-draft.v1','id':'pilot-section-review-r006','name':'Separate outer armor / unsigned r006','parts':placements},indent=2));(OUT/'new-placements.json').write_text(json.dumps(added,indent=2))
socket=bpy.data.objects.new('SOCKET-Future bridge door',None);bpy.context.scene.collection.objects.link(socket);socket.location=(0,8.8125,1.25);socket.rotation_euler.x=math.pi/2;socket.empty_display_type='ARROWS';socket.empty_display_size=.3;socket['purpose']='Future separate door mount; no door geometry or authority';socket['clear_width_m']=1.25;socket['structural_height_m']=2.125
scene=bpy.context.scene;scene['review_scope']='R006 side-themed outer armor and one Y9 future doorway; vestibule walls and aft frame removed. Floor, roofs and pilot equipment retained.';scene.render.resolution_x=1400;scene.render.resolution_y=1100;scene.cycles.samples=48;scene.render.film_transparent=True
camera=scene.camera;target=Vector((0,10,1));camera.location=(-12,23,13);camera.data.ortho_scale=15;camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler()
def roofs(show):
 for o in scene.objects:
  if o.parent and ('pilot-roof' in o.parent.name or 'vestibule-roof' in o.parent.name or 'outer-roof-collar' in o.parent.name):o.hide_render=not show
roofs(True);bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'pilot-kit.blend'));scene.render.filepath=str(OUT/'blender-closed.png');bpy.ops.render.render(write_still=True)
roofs(False);scene.render.filepath=str(OUT/'cutout.png');bpy.ops.render.render(write_still=True)
bpy.ops.object.select_all(action='DESELECT')
for o in scene.objects:
 if o.type=='MESH' and not o.hide_render:o.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(OUT/'assembly.glb'),export_format='GLB',use_selection=True,export_apply=True)
camera.location=(0,10,20);camera.rotation_euler=(Vector((0,10,0))-camera.location).to_track_quat('-Z','Y').to_euler();scene.render.filepath=str(OUT/'blender-top.png');bpy.ops.render.render(write_still=True)
camera.location=(-16,10,4);camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler();scene.render.filepath=str(OUT/'blender-side.png');bpy.ops.render.render(write_still=True)
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'pilot-kit.blend'));print('R006_READY',flush=True)
