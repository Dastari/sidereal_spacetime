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
dark=material('Graphite seals',(.065,.055,.105),.4,.37);red=material('Service red',(.38,.045,.028),.2);metal=material('Titanium hardware',(.31,.36,.4),.7,.31);glass=material('Blue laminated glazing',(.055,.21,.29),.05,.13,0,.32);cyan=material('Canopy marker emitter',(.06,.7,1),.1,.3,1.8);proxy_mat=material('Opaque occupancy only',(.4,.4,.4));proxy_mat['voxel_material_id']=1
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

amber=material('Amber marker', (1,.29,.025),.0,.35,2)
pale=paints['clean',False]
proxies=bpy.data.collections.new('OCCUPANCY-PROXIES-OPAQUE');bpy.context.scene.collection.children.link(proxies)
def loft(name,points,top,mat):
 n=len(points);m=bpy.data.meshes.new(name);m.from_pydata(points+top,[],[tuple(reversed(range(n))),tuple(range(n,n*2))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]);m.update();o=bpy.data.objects.new(name,m);bpy.context.collection.objects.link(o);m.materials.append(mat);active.append(o);return o
def pane(name,a,b,c,d,mat,thickness=.045):
 normal=(Vector(b)-Vector(a)).cross(Vector(d)-Vector(a)).normalized()*thickness/2
 return loft(name,[tuple(Vector(p)-normal) for p in [a,b,c,d]],[tuple(Vector(p)+normal) for p in [a,b,c,d]],mat)
def framed(a,b,c,d):
 pane('GEO-Swept laminated glazing',a,b,c,d,glass)
 for k,(u,v) in enumerate([(a,b),(b,c),(c,d),(d,a)]):
  beam('GEO-Canopy structural seal',u,v,.13,.14,dark)
  if k==2:beam('GEO-Cyan glazing gasket',Vector(u)+Vector((0,0,-.022)),Vector(v)+Vector((0,0,-.022)),.022,.028,cyan)
 beam('GEO-Intermediate glazing mullion',Vector(a).lerp(Vector(b),.5),Vector(d).lerp(Vector(c),.5),.07,.09,metal)
components=[]
slugs=['floor-square','floor-corner45','hull-straight','hull-diagonal45','bow-transom','canopy-side','canopy-side-left','canopy-diagonal45','canopy-nose','corner-buttress','vestibule-wall','rear-partition','airlock-frame','pilot-roof']
for slug in slugs:
 active=[];d=OUT/slug;d.mkdir(exist_ok=True);proxy_objs=[]
 if slug.startswith('floor'):
  xy=[(0,0),(2,0),(0,2)] if 'corner' in slug else [(0,0),(2,0),(2,2),(0,2)]
  proxy_objs=[poly('PROXY-'+slug,xy,0,.1875,proxy_mat)]
 elif slug in ['hull-straight','bow-transom','hull-diagonal45']:
  xy=[(0,0),(2,2),(1.625,2),(0,.375)] if 'diagonal' in slug else [(0,0),(2,0),(2,.375),(0,.375)]
  proxy_objs=[poly('PROXY-'+slug,xy,0,1.125,proxy_mat)]
 elif slug.startswith('canopy'):
  if slug=='canopy-side':a=(0,.1875,0);b=(1.922335,.1875,0);d0=(0,.8125,1.3125);c=(1.66345,.8125,1.3125)
  elif slug=='canopy-side-left':a=(.077665,.1875,0);b=(2,.1875,0);d0=(.33655,.8125,1.3125);c=(2,.8125,1.3125)
  elif slug=='canopy-nose':a=(.077665,.1875,0);b=(1.922335,.1875,0);d0=(.33655,.8125,1.3125);c=(1.66345,.8125,1.3125)
  else:a=(-.077665,.1875,0);b=(1.8125,2.077665,0);d0=(-.33655,.8125,1.3125);c=(1.1875,2.33655,1.3125)
  # Coarse pane proxy excludes shared end seals; visible frames own the seam.
  pa=Vector(a).lerp(Vector(b),.07);pb=Vector(b).lerp(Vector(a),.07);pc=Vector(c).lerp(Vector(d0),.07);pd=Vector(d0).lerp(Vector(c),.07)
  proxy_objs=[pane('PROXY-'+slug,pa,pb,pc,pd,proxy_mat,.0625)]
 elif slug=='corner-buttress':
  xy=[(.0,.0),(2,0),(2,1.6875),(1.6875,2),(0,2)];proxy_objs=[poly('PROXY-'+slug,xy,0,2.625,proxy_mat)]
 elif slug in ['vestibule-wall','rear-partition']:
  xlo=.375 if slug=='vestibule-wall' else 0; xhi=1.625
  proxy_objs=[box('PROXY-'+slug,(xlo,0,0),(xhi,.375,2.4375),proxy_mat,0)]
 elif slug=='airlock-frame':
  proxy_objs=[box('PROXY-jamb-L',(0,0,0),(.375,.375,2.4375),proxy_mat,0),box('PROXY-jamb-R',(1.625,0,0),(2,.375,2.4375),proxy_mat,0),box('PROXY-header',(.375,0,2.125),(1.625,.375,2.4375),proxy_mat,0)]
 else:
  xy=[(.625,0),(5.375,0),(5.375,1.7411),(3.7411,3.375),(2.2589,3.375),(.625,1.7411)]
  proxy_objs=[poly('PROXY-'+slug,xy,0,.1875,proxy_mat)]
 bpy.context.view_layer.update();sample=voxelize(proxy_objs,.0625);(d/'samples.json').write_text(json.dumps(sample))
 for o in proxy_objs:
  for col in list(o.users_collection):col.objects.unlink(o)
  proxies.objects.link(o);o.hide_render=True;o.hide_set(True);o['component_id']=slug
 active=[]
 if slug.startswith('floor'):
  poly('GEO-Deck tile',xy,0,.1875,metal,.008)
  inset=[(.025,.025),(1.955,.025),(.025,1.955)] if 'corner' in slug else [(.025,.025),(1.975,.025),(1.975,1.975),(.025,1.975)]
  poly('GEO-Deck plate',inset,.17,.185,pale,.005)
 elif slug in ['hull-straight','hull-diagonal45','bow-transom']:
  poly('GEO-Violet structural sill',xy,0,1.125,dark,.025)
  # Armor outer panel remains on module's exterior plane.
  n=Vector((-1,1,0)).normalized() if 'diagonal' in slug else Vector((0,1,0));aa=Vector((0,0,0));bb=Vector((2,2 if 'diagonal' in slug else 0,0));aa+=n*.008;bb+=n*.008
  p0=aa.lerp(bb,.035)+Vector((0,0,.13));p1=aa.lerp(bb,.965)+Vector((0,0,.13));p2=p1+Vector((0,0,.78));p3=p0+Vector((0,0,.78))
  panel=pane('GEO-Replaceable pale armor',p0,p1,p2,p3,paints['clean',slug=='bow-transom'],.08)
  uv=panel.data.uv_layers.new(name='DecalUV')
  for face in panel.data.polygons:
   for idx,co in zip(face.loop_indices,[(0,0),(1,0),(1,1),(0,1)]):uv.data[idx].uv=co
  for t in [.05,.95]:
   q=aa.lerp(bb,t)+Vector((0,0,.99));beam('GEO-Shoulder amber marker',q,q+Vector((0,0,.055)),.16,.07,amber)
  if slug!='bow-transom':
   for t in [.15,.24,.33,.42]:
    q=aa.lerp(bb,t)+Vector((0,0,.38));beam('GEO-Inset panel slit',q,q+Vector((0,0,.29)),.035,.09,dark)
 elif slug.startswith('canopy'):framed(a,b,c,d0)
 elif slug=='corner-buttress':
  poly('GEO-Chamfered corner spine',xy,0,2.47,dark,.045)
  for x0,x1,z0,z1 in [(.12,1.87,.12,1.43),(.12,1.87,1.52,2.43)]:
   box('GEO-Outer replaceable armor',(x0,1.91,z0),(min(x1,1.60),2.015,z1),pale,.035)
  for zz0,zz1 in [(.12,1.43),(1.52,2.43)]:box('GEO-Outer shoulder armor',(1.96,.13,zz0),(2.04,1.55,zz1),pale,.025)
  box('GEO-Corner pale cap',(.13,.13,2.47),(1.80,1.72,2.59),pale,.045)
  box('GEO-Recessed roof ventilation well',(.78,.4,2.58),(1.55,1.57,2.60),dark,.015)
  for yy in [.5,.65,.8,.95,1.1,1.25,1.4]:box('GEO-Vent louvre',(.83,yy,2.6),(1.5,yy+.045,2.625),metal,.008)
  box('GEO-Red service door',(2.04,.43,.48),(2.12,1.4,1.49),red,.035)
  box('GEO-Service door handle',(2.12,.55,.97),(2.15,.72,1.12),metal,.008)
  box('GEO-Recessed indicator housing',(.30,2.015,1.65),(.62,2.06,2.28),dark,.012)
  box('GEO-Cyan status',(.39,2.06,1.94),(.50,2.075,2.10),cyan,.005)
  box('GEO-Amber lower marker',(1.30,2.015,.25),(1.51,2.055,.40),amber,.005)
  for xx in [.2,1.73]:
   for zz in [.25,1.28,1.65,2.3]:box('GEO-Panel fastener',(min(xx,1.5),2.015,zz),(min(xx,1.5)+.045,2.035,zz+.045),metal,.003)
 elif slug in ['vestibule-wall','rear-partition']:
  box('GEO-Vestibule structural partition',(xlo,0,0),(xhi,.375,2.4375),dark,.012)
  box('GEO-Vestibule pale panel',(xlo+.04,-.008,.16),(xhi-.04,.383,2.25),pale,.012)
 elif slug=='airlock-frame':
  for lo,hi in [((0,0,0),(.375,.375,2.4375)),((1.625,0,0),(2,.375,2.4375)),((.375,0,2.125),(1.625,.375,2.4375))]:box('GEO-Airlock jamb',lo,hi,dark,.012)
  for xx in [.10,1.79]:
   box('GEO-Airlock jamb armor',(xx,.012,.1),(xx+.11,.36,2.26),pale,.008)
   box('GEO-Doorway cyan guide',(xx+.03,.006,.79),(xx+.07,.022,1.64),cyan,.004)
 else:
  poly('GEO-Swept removable cockpit roof',xy,0,.1875,dark,.016)
  for xx in [1.0,3.1]:box('GEO-Roof inset pale shoulders',(xx,.17,.12),(xx+1.7,1.36,.19),pale,.018)
  box('GEO-Roof central service plate',(2.15,.2,.16),(3.85,2.78,.20),metal,.018)
 visuals=active[:]
 for o in visuals:o['component_id']=slug;o['representation']='native Blender visual';o['review_revision']=2
 bpy.context.view_layer.update();verts=[o.matrix_world@Vector(v) for o in visuals for v in o.bound_box];bounds={'min':[min(v[i] for v in verts) for i in range(3)],'max':[max(v[i] for v in verts) for i in range(3)]}
 for state in ['clean','worn','damaged']:
  for o in visuals:
   for slot in o.material_slots:
    if slot.material.name.startswith(('clean','worn','damaged')):slot.material=paints[state,'nameplate' in slot.material.name]
  bpy.ops.object.select_all(action='DESELECT')
  for o in visuals:o.select_set(True)
  bpy.context.view_layer.objects.active=visuals[0];bpy.ops.export_scene.gltf(filepath=str(d/(state+'.glb')),export_format='GLB',use_selection=True,export_apply=True)
 for o in visuals:
  for slot in o.material_slots:
   if slot.material.name.startswith(('clean','worn','damaged')):slot.material=paints['clean','nameplate' in slot.material.name]
 collection=bpy.data.collections.new(slug);bpy.context.scene.collection.children.link(collection)
 for o in visuals:
  for col in list(o.users_collection):col.objects.unlink(o)
  collection.objects.link(o);o.hide_render=True;o.hide_set(True)
 components.append({'slug':slug,'id':'part-'+hashlib.sha256(('hull-pilot-r2-'+slug).encode()).hexdigest()[:20],'category':'floor' if slug.startswith('floor') else 'roof' if slug=='pilot-roof' else 'wall','bounds':bounds,'nominal_dimensions_m':[bounds['max'][i]-bounds['min'][i] for i in range(3)],'collection':slug})
placements=[]
def place(slug,x,y,z=0,rotation=0,flipped=False):
 c=next(c for c in components if c['slug']==slug);pid=f'pilot-r002-{slug}-{len(placements):02}'
 placements.append({'id':pid,'assetId':c['id'],'position':[x,y,z],'rotation':rotation,'flipped':flipped,'removedCells':[]})
 root=bpy.data.objects.new(pid,None);bpy.context.collection.objects.link(root);root.location=(x,y,z);root.rotation_euler.z=rotation;root.scale.x=-1 if flipped else 1
 for src in bpy.data.collections[slug].objects:
  o=src.copy();o.data=src.data;bpy.context.collection.objects.link(o);o.hide_render=False;o.hide_set(False);o.parent=root;o['placed_object_id']=pid
for x,y in [(-3,5),(-1,5),(1,5),(-1,7),(-1,3)]:place('floor-square',x,y)
for x,y,r in [(1,7,0),(-1,7,math.pi/2)]:place('floor-corner45',x,y,0,r)
for x,y,r in [(3,5,math.pi/2),(-3,7,-math.pi/2)]:place('hull-straight',x,y,.1875,r);place('canopy-side' if x>0 else 'canopy-side-left',x,y,1.3125,r)
for x,y,r in [(3,7,math.pi/2),(-1,9,math.pi)]:place('hull-diagonal45',x,y,.1875,r);place('canopy-diagonal45',x,y,1.3125,r)
place('bow-transom',1,9,.1875,math.pi);place('canopy-nose',1,9,1.3125,math.pi)
place('corner-buttress',3,5,.1875);place('corner-buttress',-3,5,.1875,0,True)
place('vestibule-wall',1,3,.1875,math.pi/2);place('vestibule-wall',-1,5,.1875,-math.pi/2)
place('airlock-frame',-1,3,.1875);place('airlock-frame',1,5,.1875,math.pi)
# Rear bridge side partitions, with open central vestibule doorway.
place('rear-partition',-2.625,4.625,.1875);place('rear-partition',1,4.625,.1875)
place('pilot-roof',-3,5,2.625)
catalog=json.loads((ROOT/'assets/runtime/assembly/catalog.json').read_text());draft=json.loads((ROOT/'assets/runtime/assembly/wayfarer.json').read_text())
for p in draft['parts']:
 if p['assetId'] not in ['part-c0b6b036f5b3dd8bd2f3','part-d9f37a5f7ea6e8d13254','part-75910d7a0d27dfc17aaf','part-0f14bf002f4c11854337']:continue
 if any(a['id']==p['id'] for a in placements):continue
 entry=next(a for a in catalog['assets'] if a['id']==p['assetId']);placements.append(p)
 path=ROOT/'assets/runtime/assembly'/entry['visual']['url'].split('/assets/assembly/')[-1]
 before=set(bpy.data.objects);bpy.ops.import_scene.gltf(filepath=str(path));added=set(bpy.data.objects)-before;root=bpy.data.objects.new(p['id'],None);bpy.context.collection.objects.link(root);root.location=p['position'];root.rotation_euler.z=p['rotation']
 for o in added:
  if o.parent not in added:o.parent=root
(OUT/'components.json').write_text(json.dumps(components,indent=2));(OUT/'wayfarer.json').write_text(json.dumps({'schema':'sidereal.assembly-draft.v1','id':'pilot-section-review-r002','name':'Compact swept pilot bay / unsigned r002','parts':placements},indent=2))
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=24;scene.cycles.use_denoising=False;scene.render.resolution_x=1200;scene.render.resolution_y=1000;scene.render.resolution_percentage=100;scene.render.image_settings.file_format='PNG';scene.render.film_transparent=True;scene.world.color=(.23,.23,.23)
for loc,power,size in [((2,7,12),2200,8),((-7,10,7),1700,7),((1,0,6),1300,6)]:
 bpy.ops.object.light_add(type='AREA',location=loc);o=bpy.context.object;o.data.energy=power;o.data.shape='DISK';o.data.size=size;o.rotation_euler=(Vector((0,6,1))-o.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add(location=(-12,18,12));camera=bpy.context.object;camera.data.type='ORTHO';camera.data.ortho_scale=14;scene.camera=camera;camera.rotation_euler=(Vector((0,6,1))-camera.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'pilot-kit.blend'))
def render(name):scene.render.filepath=str(OUT/name);bpy.ops.render.render(write_still=True)
render('blender-closed.png')
for o in scene.objects:
 if o.parent and 'pilot-roof' in o.parent.name:o.hide_render=True
render('cutout.png')
bpy.ops.object.select_all(action='DESELECT')
for o in scene.objects:
 if o.type=='MESH' and not o.hide_render:o.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(OUT/'assembly.glb'),export_format='GLB',use_selection=True,export_apply=True)
camera.location=(0,6,20);camera.rotation_euler=(Vector((0,6,0))-camera.location).to_track_quat('-Z','Y').to_euler();render('blender-top.png')
camera.location=(-15,6,4);camera.rotation_euler=(Vector((0,6,1))-camera.location).to_track_quat('-Z','Y').to_euler();render('blender-side.png')
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'pilot-kit.blend'))
print('R002_COMPLETE',flush=True)
