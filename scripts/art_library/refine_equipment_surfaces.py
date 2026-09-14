"""Reference detail pass. Native Blender surfaces are the visual deliverable.
The prior placement proxy is copied separately; it never replaces undamaged art.
"""
from pathlib import Path
import bpy,bmesh,json,math,sys,shutil,hashlib,struct,ast
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2]
jobs=json.loads(Path(sys.argv[sys.argv.index('--')+1]).read_text())
for job in jobs:
 out=ROOT/job['output'];previous=ROOT/job.get('base_output',job['previous_output']);slug=job['slug']
 if (out/'authoring.glb').exists():continue
 if (out/'authoring.blend').exists():
  backup=out/'failed-export-attempt';backup.mkdir(exist_ok=True)
  shutil.move(out/'authoring.blend',backup/'authoring.blend')
 bpy.ops.wm.open_mainfile(filepath=str(previous/'authoring.blend'));scene=bpy.context.scene
 bpy.context.preferences.filepaths.save_version=0
 geo=bpy.data.collections['GEO'];geo.hide_viewport=False;geo.hide_render=False
 mats={int(m['voxel_material_id']):m for m in bpy.data.materials if 'voxel_material_id' in m and not m.name.startswith('COOKED')}
 palette=ast.literal_eval(next(n.value for n in ast.parse((ROOT/'scripts/art_library/build_equipment_review.py').read_text()).body if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='PALETTE' for t in n.targets)))
 for key,(name,color,metal,rough,emission) in palette.items():
  if key in mats:continue
  m=bpy.data.materials.new('MAT-'+name);m.use_nodes=True;m['voxel_material_id']=key
  def linear(v):return v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4
  rgb=tuple(linear(int(color[i:i+2],16)/255) for i in [0,2,4]);p=m.node_tree.nodes['Principled BSDF']
  p.inputs['Base Color'].default_value=(*rgb,1);p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough;p.inputs['Emission Color'].default_value=(*rgb,1);p.inputs['Emission Strength'].default_value=emission;mats[key]=m
 mats[15].node_tree.nodes['Principled BSDF'].inputs['Emission Strength'].default_value=.22
 mats[6].node_tree.nodes['Principled BSDF'].inputs['Emission Strength'].default_value=2.8
 mats[14].node_tree.nodes['Principled BSDF'].inputs['Emission Strength'].default_value=4
 fixtures=[]
 def box(name,at,size,mat=1,bevel=.01):
  bpy.ops.mesh.primitive_cube_add(size=1,location=at);o=bpy.context.object;o.name='GEO-'+name;o.dimensions=size;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
  for c in list(o.users_collection):c.objects.unlink(o)
  geo.objects.link(o);o.data.materials.append(mats[mat])
  if bevel:
   b=o.modifiers.new('Authored fitted edge','BEVEL');b.width=min(bevel,min(size)*.28);b.segments=3
  return o
 def cyl(name,at,radius,depth,mat=4,axis='Z'):
  bpy.ops.mesh.primitive_cylinder_add(vertices=20,radius=radius,depth=depth,location=at);o=bpy.context.object;o.name='GEO-'+name
  for c in list(o.users_collection):c.objects.unlink(o)
  geo.objects.link(o);o.data.materials.append(mats[mat]);o.rotation_euler.x=math.pi/2 if axis=='Y' else 0;o.rotation_euler.y=math.pi/2 if axis=='X' else 0
  b=o.modifiers.new('Machined edge','BEVEL');b.width=.004;b.segments=2;return o
 def pipe(name,a,b,r=.012,mat=4):
  delta=Vector(b)-Vector(a);o=cyl(name,(Vector(a)+Vector(b))/2,r,delta.length,mat);o.rotation_euler=delta.to_track_quat('Z','Y').to_euler();return o
 def remove(tokens):
  for o in list(geo.objects):
   if any(t in o.name for t in tokens):bpy.data.objects.remove(o,do_unlink=True)
 def bounds(o):
  bpy.context.view_layer.update();ps=[o.matrix_world@Vector(v) for v in o.bound_box];return [min(p[i] for p in ps) for i in range(3)],[max(p[i] for p in ps) for i in range(3)]
 def fixture(position,direction,color,intensity=.4,range=1.5,angle=1.7):fixtures.append({'position':position,'direction':direction,'color':color,'intensity':intensity,'range':range,'angle':angle})
 def screen(name,x,y,z,w,h,clinical=False):
  box(name+'-bezel',(x,y,z),(w,.075,h),1,.015)
  front=y-.045
  box(name+'-emissive-display',(x,front,z),(w-.05,.012,h-.05),15,.007)
  # Fine diagram geometry preserves its authored shape instead of voxel glyphs.
  for row in range(4):
   box(name+'-data-row',(x-w*.20,front-.009,z+h*(.26-row*.13)),(w*(.22+.04*(row%2)),.005,.008),6,.002)
  for k in range(4):
   hh=h*(.08+.04*((k+1)%3));box(name+'-histogram',(x+w*(.05+k*.08),front-.009,z-h*.18+hh/2),(w*.045,.005,hh),6,.001)
  box(name+'-status-divider',(x,front-.009,z-h*.32),(w*.72,.005,.006),6,.001)
  if clinical:
   points=[(-.35,0),(-.21,0),(-.14,.12),(-.07,-.15),(0,.25),(.07,-.05),(.13,0),(.34,0)]
   for (a,b),(c,d) in zip(points,points[1:]):pipe(name+'-vitals',(x+w*a,front-.011,z+h*b),(x+w*c,front-.011,z+h*d),.005,6)
  for xx in [-.4,.4]:
   for zz in [-.38,.38]:cyl(name+'-bezel-fastener',(x+w*xx,front,z+h*zz),.012,.014,4,'Y')
 if slug=='medical-bed':
  remove(['GEO-'])
  for x in [-.47,.47]:
   box('clinical-floor-sled',(x,0,.065),(.24,2.15,.13),2,.03)
   for y in [-.91,.91]:box('sled-isolator',(x,y,.035),(.28,.29,.07),10,.02)
  box('lift-core',(0,0,.30),(.75,1.72,.45),2,.035)
  for z in [.23,.40]:box('lift-collar',(0,0,z),(.88,1.82,.08),4,.02)
  box('bed-lower-shell',(0,0,.51),(1.21,2.39,.19),1,.035)
  box('dark-frame-reveal',(0,0,.61),(1.30,2.48,.075),2,.018)
  box('upper-bed-rim',(0,0,.67),(1.34,2.50,.13),1,.04)
  box('mattress-cradle',(0,-.17,.748),(1.13,1.91,.075),2,.02)
  box('red-treatment-pad',(0,-.24,.84),(1.06,1.65,.15),9,.035)
  for x in [-.49,.49]:box('pad-piping',(x,-.25,.909),(.012,1.49,.013),3,.003)
  back=box('articulated-head-frame',(0,.86,.94),(1.15,.62,.11),1,.026);back.rotation_euler.x=math.radians(24)
  pillow=box('contoured-head-cushion',(0,.84,1.01),(1.02,.58,.16),8,.045);pillow.rotation_euler.x=math.radians(24)
  for x in [-.58,.58]:
   cyl('head-hinge',(x,.60,.85),.07,.075,4,'X')
   for y in [-.7,.45]:box('rail-stanchion',(x,y,.82),(.065,.085,.22),4,.008)
   box('drop-side-rail',(x,-.125,.945),(.11,1.40,.09),1,.025)
   box('release-button',(x,-.65,.998),(.06,.10,.012),3,.004)
  for y in [-1.20,1.20]:box('protected-bed-end',(0,y,.70),(1.32,.16,.24),1,.035)
  box('foot-display-recess',(0,-1.288,.71),(.76,.015,.12),15,.01)
  for x in [-.23,0,.23]:box('foot-status',(x,-1.298,.71),(.15,.006,.025),6,.006)
  for side in [-1,1]:
   x=side*.614
   for y in [-.70,-.34,.02,.38]:
    box('side-service-panel',(x,y,.51),(.018,.30,.125),1,.005)
    for dy in [-.08,0,.08]:box('side-cooling-slot',(x+side*.012,y+dy,.51),(.006,.028,.065),2,.002)
   box('clinical-service-cover',(x,.88,.50),(.02,.33,.18),3,.01)
  box('supply-drawer',(0,-.905,.31),(.54,.06,.21),1,.015)
  box('drawer-pull',(0,-.95,.34),(.21,.04,.035),4,.007)
  box('monitor-column',(.61,1.08,1.14),(.09,.095,1.22),4,.01)
  pipe('monitor-joint',(.61,1.08,1.65),(.38,1.08,1.65),.045,2)
  screen('clinical-diagnostic',.36,1.085,1.68,.53,.42,True)
  pipe('monitor-cable',(.62,1.135,.71),(.62,1.135,1.60),.018,10)
  # Opaque fluid cartridge; no unvalidated glass export.
  cyl('iv-support',(-.61,.87,1.28),.016,.99,4)
  cyl('iv-fluid-cartridge',(-.61,.87,1.57),.055,.21,8)
  cyl('iv-cap',(-.61,.87,1.70),.06,.035,5)
  pipe('iv-line',(-.61,.87,1.46),(-.61,.65,1.07),.008,4)
  box('exam-lamp-shell',(.03,1.11,1.84),(.40,.19,.11),1,.02)
  box('exam-diffuser',(.03,1.07,1.778),(.31,.12,.014),14,.004)
  fixture([.03,1.02,1.76],[0,-.6,-1],[1,.87,.72],.5,2,1.5)
  fixture([.36,1.02,1.68],[0,-1,-.2],[.18,.72,1],.15,1.2,1.6)
 else:
  # Replace every coarse screen motif with fine, material-emissive authored UI.
  old_rims=[o for o in geo.objects if 'rim' in o.name and any(t in o.name for t in ['display','generator-diagnostic'])]
  dimensions=[bounds(o) for o in old_rims]
  remove(['readout','-well','display-rim','generator-diagnostic-rim'])
  for i,(lo,hi) in enumerate(dimensions):screen('instrument-'+str(i),(lo[0]+hi[0])/2,(lo[1]+hi[1])/2,(lo[2]+hi[2])/2,hi[0]-lo[0],hi[2]-lo[2])
  if dimensions:
   lo,hi=dimensions[len(dimensions)//2];fixture([(lo[0]+hi[0])/2,lo[1]-.02,(lo[2]+hi[2])/2],[0,-1,-.45],[.18,.72,1],.32,1.5,1.8)
  if slug in ['command-console','bridge-bank']:
   remove(['key-pad','keyboard'])
   for x in ([-.64,0,.64] if slug=='command-console' else [0]):
    box('recessed-keyboard-bed',(x,-.13,.989),(.42 if slug=='command-console' else .31,.14,.012),4,.005)
    for row in range(3):
     for key in range(7):box('individual-key',(x+(key-3)*.035,-.13+(row-1)*.033,1.005),(.026,.023,.009),8 if key%3==0 else 2,.003)
    cyl('encoder',(x+.19,-.21,1.01),.03,.025,4)
    box('illuminated-touch-strip',(x,-.25,.998),(.28,.018,.007),6,.002)
  elif slug=='hydroponics':
   remove(['grow-diffuser'])
   for o in geo.objects:
    if 'tray-rail' in o.name:o.dimensions.x=1.244
   bpy.context.view_layer.update()
   box('recessed-canopy-undertray',(0,.12,1.551),(1.30,.205,.018),2,.006)
   for x in [-.5,-.3,-.1,.1,.3,.5]:
    box('grow-led-emissive', (x,.105,1.537),(.15,.13,.012),14,.004)
    for y in [.01,.21]:box('led-retaining-lip',(x,y,1.545),(.17,.012,.025),4,.003)
   for x in [-.38,.38]:fixture([x,.10,1.52],[0,-.12,-1],[1,.86,.66],.8,1.65,1.9)
   for x in [-.57,-.18,.18,.57]:box('reservoir-face-panel',(x,-.288,.15),(.29,.027,.14),1,.008)
   for x in [-.63,.63]:
    pipe('nutrient-riser',(x,.13,.25),(x,.13,.50),.019,5)
    cyl('feed-valve',(x,.13,.43),.035,.05,4)
   screen('nutrient-controller',.47,-.255,.27,.25,.17)
   # The third screen illuminates by emission only; two downlights are the budget.
   for x in [-.42,0,.42]:
    pipe('root-feed',(x,.19,.3),(x,.06,.38),.012,5)
    for k in range(3):box('plant-well-rim',(x+(k-1)*.07,-.13,.445),(.065,.025,.025),1,.006)
  elif slug=='pilot-seat':
   for x in [-.29,.29]:box('seat-stitch-line',(x,.02,.560),(.008,.47,.005),4,.001)
   for x in [-.23,0,.23]:box('foot-grip',(x,.435,.166),(.09,.12,.009),10,.002)
   for x in [-.47,.47]:cyl('arm-encoder',(x,.07,.746),.024,.018,4)
  elif slug=='crew-bunk':
   for z in [.63,1.68]:
    for x in [-.51,.51]:box('blanket-bound-edge',(x,-.28,z+.012),(.015,1.50,.009),8,.003)
    for x in [-.58,.58]:
     box('bunk-reading-light',(x,.95,z+.11),(.06,.18,.035),14,.008)
     box('reading-light-bracket',(x,1.075,z+.14),(.04,.29,.04),2,.005)
   for z in [.716,1.766]:fixture([.58,.95,z],[0,-.3,-1],[1,.82,.6],.3,1.4,1.6)
  elif slug=='lounge-sofa':
   for y in [-.875,0,.875]:
    box('cushion-piping',(-.64,y,.64),(.012,.70,.014),3,.003)
    for yy in [-.22,.22]:cyl('upholstery-button',(.245,y+yy,.95),.015,.009,3,'X')
   for y in [-1.22,1.22]:box('arm-end-insert',(-.60,y,.57),(.02,.085,.19),3,.006)
  elif slug=='wall-locker':
   for side in [-1,1]:
    for y in [-.36,.36]:
     box('locker-label',(side*.182,y,.94),(.006,.18,.055),2,.002)
     for z in [.29,.99]:cyl('cabinet-hinge',(side*.17,y+.25,z),.018,.06,4)
  elif slug=='reactor':
   for y in [-1.08,-.64,0,.64,1.08]:
    for x in [-.57,.57]:box('ring-retainer',(x,y,1.13),(.12,.10,.17),2,.01)
   for x in [-.58,.58]:
    for y in [-.95,.95]:pipe('coolant-elbow',(x,y,.36),(x,y,.63),.035,5)
   for x in [-.48,.48]:
    for y in [-.12,0,.12]:box('service-vent',(x,y,1.54),(.16,.025,.007),2,.002)
 # Keep explicit source sockets and per-variant light frames; no reference images exported.
 scene['revision']=job['revision'];scene['source']='Native authored Blender visual surface; separate retained occupancy proxy';scene['approval']='unsigned'
 bpy.context.view_layer.update();raw_meshes=list(geo.objects)
 # Preserve an untouched editable source prior to building any render batches.
 for i,d in enumerate(fixtures):
  light=bpy.data.lights.new('FIXTURE-'+str(i),'SPOT');light.energy=d['intensity']*18;light.color=d['color'];light.spot_size=d['angle'];light.spot_blend=.55;light.shadow_soft_size=.07
  o=bpy.data.objects.new('FIXTURE-'+str(i),light);scene.collection.objects.link(o);o.location=d['position'];o.rotation_euler=Vector(d['direction']).to_track_quat('-Z','Y').to_euler()
 bpy.ops.wm.save_as_mainfile(filepath=str(out/'authoring.blend'))
 shutil.copy2(previous/'samples.json',out/'samples.json')
 shutil.copy2(previous/'source-validation.json',out/'source-validation.json')
 for variant in job['variants']:
  bpy.ops.wm.open_mainfile(filepath=str(out/'authoring.blend'));scene=bpy.context.scene;geo=bpy.data.collections['GEO'];dest=out/variant['name'];dest.mkdir(exist_ok=True)
  sign=-1 if variant['name']=='starboard' else 1;offset=(variant['bounds_m']['min'][0]+variant['bounds_m']['max'][0])/2
  print('TRANSFORM '+slug,flush=True)
  bpy.context.view_layer.update()
  transforms=[(o,o.matrix_world.copy()) for o in geo.objects]
  for o,matrix in transforms:
   for v in o.data.vertices:
    p=matrix@v.co;v.co=(sign*p.x+offset,p.y,p.z)
   o.parent=None;o.location=(0,0,0);o.rotation_euler=(0,0,0);o.scale=(1,1,1)
   if sign<0:
    bm=bmesh.new();bm.from_mesh(o.data);bmesh.ops.recalc_face_normals(bm,faces=bm.faces);bm.to_mesh(o.data);bm.free()
  bpy.context.view_layer.update()
  print('LIGHTS '+slug,flush=True)
  lights=[{**d,'position':[sign*d['position'][0]+offset,*d['position'][1:]],'direction':[sign*d['direction'][0],*d['direction'][1:]]} for d in fixtures]
  for i,d in enumerate(lights):
   o=bpy.data.objects['FIXTURE-'+str(i)];o.location=d['position'];o.rotation_euler=Vector(d['direction']).to_track_quat('-Z','Y').to_euler()
  # Evaluate authored bevels, then merge only the GPU representation. Source solids remain editable.
  print('BATCH '+slug,flush=True)
  verts=[];faces=[];face_mats=[];materials=[]
  for o in list(geo.objects):
   evaluated=o.evaluated_get(bpy.context.evaluated_depsgraph_get());mesh=evaluated.to_mesh();start=len(verts)
   verts.extend([list(evaluated.matrix_world@v.co) for v in mesh.vertices])
   for p in mesh.polygons:
    mat=bpy.data.materials[mesh.materials[p.material_index].name]
    if mat not in materials:materials.append(mat)
    faces.append([start+i for i in p.vertices]);face_mats.append(materials.index(mat))
   evaluated.to_mesh_clear()
  mesh=bpy.data.meshes.new('Authored surface batch');mesh.from_pydata(verts,[],faces);mesh.update()
  for m in materials:mesh.materials.append(m)
  for p,m in zip(mesh.polygons,face_mats):p.material_index=m
  obj=bpy.data.objects.new('GEO-'+variant['asset_id']+'--equipment-review',mesh);scene.collection.objects.link(obj)
  obj['design_id']=job['design_id'];obj['revision']=job['revision'];obj['visual_representation']='native-blender';obj['variant']=variant['name']
  print('EXPORT '+slug,flush=True)
  geo.name='AUTHORING-MESHES';geo.hide_render=True;geo.hide_viewport=True
  bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj
  bpy.ops.export_scene.gltf(filepath=str(dest/'glb.glb'),export_format='GLB',use_selection=True,export_extras=True,export_cameras=False,export_lights=False)
  low=[min(v[i] for v in verts) for i in range(3)];high=[max(v[i] for v in verts) for i in range(3)];size=[b-a for a,b in zip(low,high)];center=Vector([(a+b)/2 for a,b in zip(low,high)])
  direction=Vector((5,7,math.sqrt(37))) if slug=='pilot-seat' else Vector((-7,-5,math.sqrt(37))) if slug in ['wall-locker','lounge-sofa'] else Vector((5,-7,math.sqrt(37)))
  scene.camera.location=center+direction;scene.camera.rotation_euler=(center-scene.camera.location).to_track_quat('-Z','Y').to_euler();scene.camera.data.ortho_scale=max(size)*1.5
  scene.cycles.samples=48
  bpy.ops.wm.save_as_mainfile(filepath=str(dest/'blender-source.blend'))
  scene.render.filepath=str(dest/'cutout.png');bpy.ops.render.render(write_still=True)
  scene.camera.location=center+Vector((0,0,10));scene.camera.rotation_euler=(0,0,0);scene.camera.data.ortho_scale=max(size[0],size[1])*1.25
  scene.render.filepath=str(dest/'blender-top.png');bpy.ops.render.render(write_still=True)
  # Dark diagnostic view isolates authored emission and physical fixture lighting.
  for o in scene.objects:
   if o.type=='LIGHT' and not o.name.startswith('FIXTURE-'):o.data.energy=0
  scene.world.node_tree.nodes['Background'].inputs[1].default_value=.02
  scene.camera.location=center+direction;scene.camera.rotation_euler=(center-scene.camera.location).to_track_quat('-Z','Y').to_euler();scene.camera.data.ortho_scale=max(size)*1.5
  scene.render.filepath=str(dest/'blender-emission.png');bpy.ops.render.render(write_still=True)
  raw=(dest/'glb.glb').read_bytes();length=struct.unpack_from('<I',raw,12)[0];gltf=json.loads(raw[20:20+length])
  mesh.calc_loop_triangles();emissive=[{'name':m['name'],'factor':m.get('emissiveFactor'),'strength':m.get('extensions',{}).get('KHR_materials_emissive_strength',{}).get('emissiveStrength',1)} for m in gltf['materials'] if any(m.get('emissiveFactor',[0,0,0]))]
  report={'status':'unsigned-native-review','blender':bpy.app.version_string,'visual_representation':'Authored Blender evaluated surface, no voxel visual remesh','occupancy_proxy':'Retained separately from '+str(previous.relative_to(ROOT)),'bounds_m':{'min':low,'max':high},'triangles':len(mesh.loop_triangles),'primitive_count':sum(len(m['primitives']) for m in gltf['meshes']),'material_count':len(gltf['materials']),'emissive_materials':emissive,'fixtures':lights,'fixture_budget':2,'fixture_scope':'Runtime spotlights illuminate owning placement only; emissive PBR preserved in GLB. Studio rig not exported.','alpha':'RGBA render','limitations':['Exact articulated crew fit and proposed mechanics are unapproved','Retained proxy does not encode all visual detail; local damage remesh fidelity pending'],'files':{p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in dest.iterdir() if p.is_file()}}
  (dest/'validation.json').write_text(json.dumps(report,indent=2)+'\n');(dest/'lights.json').write_text(json.dumps(lights,indent=2)+'\n')
  # Compatibility metadata for the existing review capture/placement tooling.
  proxy=json.loads((previous/variant['name']/'mesh.json').read_text());proxy['visual_bounds']={'min':low,'max':high};(dest/'mesh.json').write_text(json.dumps(proxy))
  shutil.copy2(previous/variant['name']/'voxels.json',dest/'voxels.json')
  print(json.dumps({'native_export':slug,'variant':variant['name'],'triangles':report['triangles'],'emissive_materials':len(emissive),'fixtures':len(lights)}),flush=True)
 # Separate authoring GLB is the exact primary native export, not a proxy mesh.
 shutil.copy2(out/job['variants'][0]['name']/'glb.glb',out/'authoring.glb')
