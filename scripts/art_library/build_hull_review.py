"""Blender-authored review kit. Visual surfaces and solid occupancy are separate."""
from pathlib import Path
import bpy,sys,math,json,hashlib
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2];sys.path.insert(0,str(ROOT/'scripts'))
from voxelize_blender import voxelize
OUT=Path(sys.argv[sys.argv.index('--')+1]);OUT.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
def material(name,color,metal=.0,rough=.5,emission=0,alpha=1):
 m=bpy.data.materials.new(name);m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,alpha);p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough;p.inputs['Alpha'].default_value=alpha
 if emission:p.inputs['Emission Color'].default_value=(*color,1);p.inputs['Emission Strength'].default_value=emission
 if alpha<1:m.surface_render_method='DITHERED'
 return m
dark=material('Graphite seals',(.025,.045,.065),.4,.37);red=material('Service red',(.38,.045,.028),.2);metal=material('Titanium hardware',(.31,.36,.4),.7,.31);glass=material('Blue laminated glazing',(.055,.21,.29),.05,.13,0,.32);cyan=material('Canopy marker emitter',(.06,.7,1),.1,.3,1.8);proxy_mat=material('Opaque occupancy only',(.4,.4,.4));proxy_mat['voxel_material_id']=1
paints={}
for state in ['clean','worn','damaged']:
 for marked in [False,True]:
  m=material(state+(' nameplate' if marked else ' hull paint'),(.7,.72,.78),.35);p=m.node_tree.nodes.get('Principled BSDF');nodes=m.node_tree.nodes;links=m.node_tree.links
  for suffix,socket in [('marked-base' if marked else 'base','Base Color'),('roughness','Roughness'),('normal',None)]:
   n=nodes.new('ShaderNodeTexImage');n.image=bpy.data.images.load(str(OUT/'maps'/f'{state}-{suffix}.png'),check_existing=True);n.image.pack()
   if suffix!='base' and suffix!='marked-base':n.image.colorspace_settings.name='Non-Color'
   if socket:links.new(n.outputs['Color'],p.inputs[socket])
   else:
    normal=nodes.new('ShaderNodeNormalMap');normal.inputs['Strength'].default_value=.55;links.new(n.outputs['Color'],normal.inputs['Color']);links.new(normal.outputs['Normal'],p.inputs['Normal'])
  paints[state,marked]=m
active=[]
def poly(name,xy,z0,z1,mat,bevel=0):
 n=len(xy);verts=[(x,y,z) for z in [z0,z1] for x,y in xy];faces=[tuple(reversed(range(n))),tuple(range(n,n*2))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
 mesh=bpy.data.meshes.new(name);mesh.from_pydata(verts,[],faces);mesh.update();o=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(o);o.data.materials.append(mat);uv=mesh.uv_layers.new(name='PanelUV')
 for f in mesh.polygons:
  # Every broad face gets an independent, unmirrored 0..1 panel UV.
  coords=[mesh.vertices[mesh.loops[i].vertex_index].co for i in f.loop_indices];axes=sorted(range(3),key=lambda a:max(v[a] for v in coords)-min(v[a] for v in coords),reverse=True)[:2]
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
components=[]
for slug in ['floor-square','floor-corner45','hull-straight','hull-diagonal45','hull-diagonal2to1','bow-transom','canopy-straight','canopy-diagonal45','roof-square','roof-corner45']:
 active=[];d=OUT/slug;d.mkdir(exist_ok=True);floor=slug.startswith('floor');roof=slug.startswith('roof');canopy=slug.startswith('canopy');diag='diagonal' in slug;corner='corner' in slug;wide='2to1' in slug;width=4 if wide else 2;height=.1875 if floor or roof else 1.3125 if canopy else 1.125
 xy=[(0,0),(2,0),(0,2)] if corner else [(0,0),(width,0),(width,2),(0,2)] if floor or roof else [(0,0),(width,2),(width-(.75 if wide else .375),2),(0,.375)] if diag else [(0,0),(2,0),(2,.375),(0,.375)]
 # Dedicated watertight coarse solid: windows block occupancy, never sampled alpha glass.
 proxy=poly('PROXY-'+slug,xy,0,height,proxy_mat);bpy.context.view_layer.update();sample=voxelize([proxy],.0625);(d/'samples.json').write_text(json.dumps(sample));bpy.data.objects.remove(proxy,do_unlink=True);active=[]
 paint=paints['clean',slug=='bow-transom']
 if canopy:
  a=Vector((.0625,.1875,0));b=Vector((width-.1875,2-.1875,0)) if diag else Vector((1.9375,.1875,0))
  if diag:a=Vector((.09375,.28125,0));b=Vector((1.71875,1.90625,0))
  for z in [.0625,height-.0625]:beam('Canopy structural rail',a+Vector((0,0,z)),b+Vector((0,0,z)),.13,.18,metal)
  for t in [0,.5,1]:
   p=a.lerp(b,t);beam('Canopy mullion',p,p+Vector((0,0,height)),.12,.16,dark)
  delta=b-a;normal=Vector((-delta.y,delta.x,0)).normalized();corners=[a+normal*.035,b+normal*.035,b-normal*.035,a-normal*.035]
  poly('Window laminated pane',[(p.x,p.y) for p in corners],.12,height-.12,glass,.004)
  beam('Canopy edge emission',a+normal*.10+Vector((0,0,height-.12)),b+normal*.10+Vector((0,0,height-.12)),.022,.025,cyan)
 else:
  poly('Sealed studless '+slug,xy,0,height,paint,.018 if not floor else .008)
  if not floor and not roof:
   # Panel detail follows the diagonal face, inside its mating envelope.
   a=Vector((0,0,0));b=Vector((width,2 if diag else 0,0));n=Vector((-b.y,b.x,0)).normalized();a+=n*.025;b+=n*.025
   for z in [.14,.94]:beam('Inset horizontal seam',a.lerp(b,.045)+Vector((0,0,z)),a.lerp(b,.955)+Vector((0,0,z)),.028,.018,dark)
   if slug!='bow-transom':
    p=a.lerp(b,.65)+n*.01
    beam('Red access cartridge',p+Vector((0,0,.32)),p+Vector((0,0,.73)),.27,.032,red)
    for t in [.15,.22,.29,.36]:
     p=a.lerp(b,t)+n*.012;beam('Recessed ventilation slot',p+Vector((0,0,.43)),p+Vector((0,0,.66)),.018,.018,dark)
  elif roof:
   # Longitudinal removable access cap with visible seams.
   cap=[(.18,.18),(1.68,.18),(.18,1.68)] if corner else [(.18,.18),(1.82,.18),(1.82,1.82),(.18,1.82)]
   poly('Inset roof access plate',cap,height-.04,height-.025,paints['clean',False],.007)
 visuals=active[:]
 for o in visuals:o['component_id']=slug;o['representation']='native visual';o['review_revision']=1
 bpy.context.view_layer.update();verts=[o.matrix_world@Vector(v) for o in visuals for v in o.bound_box];bounds={'min':[min(v[i] for v in verts) for i in range(3)],'max':[max(v[i] for v in verts) for i in range(3)]}
 # One primitive per material after GLTF export, retain named editable Blender parts.
 def export(path):
  bpy.ops.object.select_all(action='DESELECT')
  for o in visuals:o.select_set(True)
  bpy.context.view_layer.objects.active=visuals[0]
  bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_apply=True,export_yup=True,export_materials='EXPORT')
 export(d/'clean.glb')
 for state in ['worn','damaged']:
  for o in visuals:
   for slot in o.material_slots:
    if slot.material.name.startswith('clean'):slot.material=paints[state,slug=='bow-transom']
  export(d/f'{state}.glb')
  for o in visuals:
   for slot in o.material_slots:
    if slot.material.name.startswith(state):slot.material=paints['clean',slug=='bow-transom']
 # Group masters outside render; linked copies create exact grid assembly below.
 collection=bpy.data.collections.new(slug);bpy.context.scene.collection.children.link(collection)
 for o in visuals:
  for c in list(o.users_collection):c.objects.unlink(o)
  collection.objects.link(o);o.hide_render=True;o.hide_set(True)
 components.append({'slug':slug,'id':'part-'+hashlib.sha256(('hull-pilot-r1-'+slug).encode()).hexdigest()[:20],'category':'floor' if floor else 'roof' if roof else 'wall','bounds':bounds,'nominal_dimensions_m':[width,2 if floor or roof or diag else .375,height],'interfaces':'2 m end stations; quarter-turn placement; diagonals authored into mesh; 0.375 m shell; no arbitrary 45 degree object rotation','collection':collection.name})
# Exact assembly with stable per-object identifiers. The rear is a connection to the existing cabin.
placements=[]
def place(slug,x,y,z=0,rotation=0):
 c=next(c for c in components if c['slug']==slug);pid=f'pilot-review-{slug}-{len(placements):02}'
 placements.append({'id':pid,'assetId':c['id'],'position':[x,y,z],'rotation':rotation,'flipped':False,'removedCells':[]})
 root=bpy.data.objects.new(pid,None);bpy.context.collection.objects.link(root);root.location=(x,y,z);root.rotation_euler.z=rotation
 for src in bpy.data.collections[slug].objects:
  o=src.copy();o.data=src.data;bpy.context.collection.objects.link(o);o.hide_render=False;o.hide_set(False);o.parent=root;o['placed_object_id']=pid
for y,xs in [(5,[-5,-3,-1,1,3]),(7,[-3,-1,1])]:
 for x in xs:
  place('floor-square',x,y);place('roof-square',x,y,2.625)
for x,y,r in [(3,7,0),(-3,7,math.pi/2)]:
 place('floor-corner45',x,y,0,r);place('roof-corner45',x,y,2.625,r)
for x,y,r in [(5,5,math.pi/2),(-5,7,-math.pi/2)]:
 place('hull-straight',x,y,.1875,r);place('canopy-straight',x,y,1.3125,r)
for x,y,r in [(5,7,math.pi/2),(-3,9,math.pi)]:
 place('hull-diagonal45',x,y,.1875,r);place('canopy-diagonal45',x,y,1.3125,r)
for x in [3,1,-1]:place('bow-transom' if x==1 else 'hull-straight',x,9,.1875,math.pi);place('canopy-straight',x,9,1.3125,math.pi)
# Isolated shallow diagonal sample, included in placement checks.
place('hull-diagonal2to1',7,5,.1875)
# Existing approved pilot equipment retained at the original coordinates for crew scale.
catalog=json.loads((ROOT/'assets/runtime/assembly/catalog.json').read_text());draft=json.loads((ROOT/'assets/runtime/assembly/wayfarer.json').read_text())
for assetid in ['part-c0b6b036f5b3dd8bd2f3','part-d9f37a5f7ea6e8d13254']:
 entry=next(a for a in catalog['assets'] if a['id']==assetid);p=next(p for p in draft['parts'] if p['assetId']==assetid);placements.append(p)
 path=ROOT/'assets/runtime/assembly'/entry['visual']['url'].split('/assets/assembly/')[-1]
 before=set(bpy.data.objects);bpy.ops.import_scene.gltf(filepath=str(path));added=set(bpy.data.objects)-before
 root=bpy.data.objects.new(p['id'],None);bpy.context.collection.objects.link(root);root.location=p['position'];root.rotation_euler.z=p['rotation']
 for o in added:
  if o.parent not in added:o.parent=root
(OUT/'components.json').write_text(json.dumps(components,indent=2));(OUT/'wayfarer.json').write_text(json.dumps({'schema':'sidereal.assembly-draft.v1','id':'pilot-section-review-r001','name':'Pilot bay / unsigned r001','parts':placements},indent=2))
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=24;scene.cycles.use_denoising=False;scene.render.resolution_x=1400;scene.render.resolution_y=1000;scene.render.resolution_percentage=100;scene.render.image_settings.file_format='PNG';scene.render.film_transparent=True
scene.world.color=(.25,.25,.25)
for loc,power,size in [((2,7,12),2200,8),((-7,10,7),1700,7),((1,0,6),1300,6)]:
 bpy.ops.object.light_add(type='AREA',location=loc);o=bpy.context.object;o.data.energy=power;o.data.shape='DISK';o.data.size=size;o.rotation_euler=(Vector((0,7,1))-o.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add(location=(-12,18,12));camera=bpy.context.object;camera.data.type='ORTHO';camera.data.ortho_scale=16;scene.camera=camera
camera.rotation_euler=(Vector((0,7,1))-camera.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'pilot-kit.blend'))
def render(name):scene.render.filepath=str(OUT/name);bpy.ops.render.render(write_still=True)
render('blender-closed.png')
for o in scene.objects:
 if o.parent and 'roof-' in o.parent.name:o.hide_render=True
render('cutout.png')
camera.location=(0,7,20);camera.rotation_euler=(0,0,0);camera.rotation_euler=(Vector((0,7,0))-camera.location).to_track_quat('-Z','Y').to_euler();render('blender-top.png')
# Preserve open default view, original per-part meshes, materials, packed maps and assembly identities.
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'pilot-kit.blend'))
print('HULL_REVIEW_COMPLETE',flush=True)
