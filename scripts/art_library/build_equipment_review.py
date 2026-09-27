"""Blender-authored Shipyard equipment. Review-only; never writes published assets.
Source solids remain editable; the active sampler is the only source of voxel cells.
"""
from pathlib import Path
import bpy, math, json, sys, hashlib
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'scripts'))
from voxelize_blender import voxelize
jobs=json.loads(Path(sys.argv[sys.argv.index('--')+1]).read_text())
PALETTE={1:('pale enamel','c8ccdf',.05,.36,0),2:('indigo frame','303449',.1,.48,0),3:('burgundy service','8d3557',.05,.43,0),4:('steel','8997ad',.8,.3,0),5:('copper','bf794a',.75,.35,0),6:('cyan instruments','37bdda',0,.3,1.6),7:('blue fabric','3d70b6',0,.82,0),8:('warm cushion','ddd8d0',0,.82,0),9:('red upholstery','b63d52',0,.82,0),10:('rubber','181f2b',0,.7,0),11:('leaf dark','52843e',0,.72,0),12:('leaf light','99b957',0,.69,0),13:('soil','44332a',0,.9,0),14:('warm light','ffcb89',0,.35,1.3),15:('display dark','123657',0,.32,0)}

def linear(v):return v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4
for job in jobs:
 out=ROOT/job['output'];spec=json.loads((out/'specification.json').read_text())
 if (out/'authoring.blend').exists():raise ValueError('Source revision is immutable')
 bpy.ops.wm.read_factory_settings(use_empty=True);bpy.context.preferences.filepaths.save_version=0
 scene=bpy.context.scene;scene.unit_settings.system='METRIC';scene.unit_settings.scale_length=1
 root=bpy.data.objects.new(job['design_id'],None);scene.collection.objects.link(root)
 collections={}
 for name in ['GEO','SOCKETS','COLLISION','LOD']:
  c=bpy.data.collections.new(name);scene.collection.children.link(c);collections[name]=c
 mats={}
 for key,(name,color,metal,rough,emission) in PALETTE.items():
  m=bpy.data.materials.new('MAT-'+name);m.use_nodes=True;m['voxel_material_id']=key
  rgb=tuple(linear(int(color[i:i+2],16)/255) for i in [0,2,4]);p=m.node_tree.nodes.get('Principled BSDF')
  p.inputs['Base Color'].default_value=(*rgb,1);p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough
  p.inputs['Emission Color'].default_value=(*rgb,1);p.inputs['Emission Strength'].default_value=emission;mats[key]=m
 def finish(o,name,mat,bevel=.015,priority=1):
  o.name='GEO-'+name;o.parent=root
  for c in list(o.users_collection):c.objects.unlink(o)
  collections['GEO'].objects.link(o)
  o.data.materials.append(mats[mat]);o['voxel_priority']=priority
  if bevel:
   mod=o.modifiers.new('Studless edge bevel','BEVEL');mod.width=bevel;mod.segments=2
  return o
 def box(name,x,y,z,w,d,h,m=1,bevel=.015,priority=1):
  w,d,h=[max(.0625,n) for n in (w,d,h)]
  bpy.ops.mesh.primitive_cube_add(size=1,location=(x,y,z+h/2));o=bpy.context.object;o.dimensions=(w,d,h)
  bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);return finish(o,name,m,min(bevel,min(w,d,h)/5),priority)
 def cyl(name,at,radius,depth,m=4,axis='Z',vertices=12):
  bpy.ops.mesh.primitive_cylinder_add(vertices=vertices,radius=radius,depth=depth,location=at);o=bpy.context.object
  if axis=='Y':o.rotation_euler.x=math.pi/2
  if axis=='X':o.rotation_euler.y=math.pi/2
  return finish(o,name,m,.008)
 def pipe(name,start,end,r=.04,m=5):
  delta=Vector(end)-Vector(start);o=cyl(name,(Vector(start)+Vector(end))/2,r,delta.length,m);o.rotation_euler=delta.to_track_quat('Z','Y').to_euler();return o
 def screen(name,x,y,z,w,h):
  box(name+'-rim',x,y,z,w,.10,h,1)
  box(name+'-well',x,y-.0625,z+.045,w-.09,.05,h-.09,15,priority=3)
  for i in range(3):box(name+'-readout-'+str(i),x-w*.12,y-.094,z+h*(.24+.2*i),w*.45,.03125,.03125,6,.002,4)
  box(name+'-side-readout',x+w*.28,y-.094,z+h*.2,.035,.03125,h*.5,6,.002,4)
 def feet(width,depth):
  for x in [-width/2+.09,width/2-.09]:
   for y in [-depth/2+.09,depth/2-.09]:box('isolator',x,y,0,.16,.16,.09,10)
 def service(name,x,y,z,w,h):
  box(name+'-recess',x,y,z,w,.0625,h,2)
  box(name+'-cover',x,y-.046875,z+.03125,w-.0625,.03125,h-.0625,3,priority=3)
  box(name+'-latch',x+w*.25,y-.075,z+h*.5,.0625,.03125,.0625,4,priority=4)
 slug=job['slug']
 if slug=='pilot-seat':
  box('floor-shoe',0,0,0,.85,.9,.10,4);box('turntable-plinth',0,0,.1,.5,.55,.24,2)
  box('seat-pan',0,0,.34,.82,.78,.10,1);box('seat-cushion',0,.04,.44,.67,.63,.12,10,.025)
  box('back-shell',0,-.36,.47,.82,.18,.75,1,.035)
  for z,h in [(.57,.32),(.92,.24)]:box('back-pad',0,-.245,z,.65,.09375,h,10,.02,3)
  box('headrest',0,-.32,1.16,.47,.23,.15,2,.025)
  for x in [-.47,.47]:
   box('arm-upright',x,0,.38,.12,.5,.28,2);box('arm-cap',x,.025,.66,.16,.56,.08,1)
   box('arm-control',x,.2,.74,.09,.14,.04,2,priority=3);box('arm-status',x,.245,.78,.06,.04,.032,6,priority=4)
   box('side-service',x,-.18,.4,.14,.16,.16,5)
  for x in [-.25,.25]:box('foot-rest',x,.44,.10,.25,.2,.0625,2)
 elif slug in ['command-console','bridge-bank']:
  wide=slug=='command-console';w=2 if wide else .5625;d=.75 if wide else .875
  feet(w,d)
  for x in ([-.76,.76] if wide else [0]):
   box('pedestal-core',x,.025,.09,.4 if wide else .48,.53,.73,2)
   box('pedestal-shell',x,-.015,.12,.34 if wide else .40,.48,.65,1)
   service('lower-service',x,-.285,.24,.27 if wide else .34,.34)
  box('desk-edge',0,-.03,.81,w,d,.11,1)
  box('input-shelf',0,-.1,.92,w-.14,d*.57,.055,2,priority=3)
  for x in ([-.64,0,.64] if wide else [0]):
   screen('display',x,.255 if wide else .30,1.0 if wide else .96,.6 if wide else .51,.625 if wide else .29)
   box('keyboard',x,-.13,.98,.42 if wide else .31,.14,.032,4,priority=4)
   for dx in [-.12,0,.12]:box('key-pad',x+dx,-.24,.98,.065,.065,.034,6 if dx==0 else 10,priority=5)
  if not wide:
   box('port-service-strip',-.24,.16,.27,.055,.29,.38,3)
   box('port-copper-latch',-.27,.12,.42,.03125,.1,.0625,5)
 elif slug=='wall-locker':
  # Existing narrow X envelope is wall depth. Two-sided access preserves mirrored placements.
  feet(.5,1.5);box('cabinet-core',0,0,.09,.375,1.5,1.02,2)
  for y in [-.375,.375]:
   box('cabinet-section',0,y,.12,.4375,.70,1.0,1)
   for side in [-1,1]:
    box('door-inset',side*.225,y,.22,.03125,.59,.91,2,priority=3)
    box('door-panel',side*.244,y,.25,.03125,.52,.85,1,priority=4)
    box('door-handle',side*.255,y-.15,.65,.03125,.0625,.17,3,priority=5)
    for z in [.34,.42,.50]:box('vent',side*.265,y+.10,z,.03125,.18,.03125,2,priority=5)
  # Match the recessed mounting cavity: body depth .375 m, projecting top cap
  # only between 1.125 and 1.25 m. This is authored Blender geometry, not clipping
  # the sampled volume against a wall or changing placement transforms.
  for o in list(collections['GEO'].objects):
   o.location.x*=.66;o.scale.x*=.66
  box('cabinet-top',0,0,1.125,.5,1.5,.125,1)
  box('top-spine',0,0,1.25,.125,.75,.0625,4)
 elif slug=='reactor':
  feet(1.5,2.75);box('machine-skid',0,0,.09,1.5,2.75,.16,2)
  for y in [-1.05,1.05]:box('saddle',0,y,.25,1.3,.30,.32,1)
  cyl('sealed-generator-core',(0,0,.96),.43,2.34,2,'Y',16)
  for y in [-1.08,-.64,0,.64,1.08]:
   for i in range(12):
    angle=i*math.tau/12;x=math.sin(angle)*.49;z=.96+math.cos(angle)*.49
    o=box('retaining-ring-segment',x,y,z-.12,.245,.16,.24,1 if i%3 else 4,.018);o.rotation_euler.y=angle
    if i%3==1:box('ring-latch',x*1.08,y-.10,z-.04,.09,.075,.08,5,priority=3)
  for y in [-.88,-.33,.33,.88]:
   for i in range(8):
    a=i*math.tau/8;x=math.sin(a)*.43;z=.96+math.cos(a)*.43
    o=box('guarded-energy-insert',x,y,z-.065,.23,.26,.13,6,.01,3);o.rotation_euler.y=a
  for x in [-.60,.60]:
   pipe('coolant-main',(x,-1.18,.35),(x,1.18,.35),.0625)
   for y in [-.9,0,.9]:cyl('coolant-coupler',(x,y,.35),.087,.10,4,'Y')
  for y in [-1.23,1.23]:
   cyl('end-shroud',(0,y,.96),.47,.12,1,'Y',12)
   cyl('end-recess',(0,y+(-.075 if y<0 else .075),.96),.32,.07,2,'Y',12)
  screen('generator-diagnostic',0,-1.32,.71,.42,.42)
  for x in [-.48,.48]:box('top-service-cover',x,0,1.39,.24,.48,.14,3)
 elif slug=='hydroponics':
  feet(1.5,.625);box('water-reservoir',0,0,.08,1.44,.56,.19,2)
  for x in [-.6875,.6875]:box('tray-end',x,0,.23,.125,.625,.16,1)
  for y in [-.265625,.265625]:box('tray-rail',0,y,.23,1.375,.09375,.16,1)
  box('soil-bed',0,0,.25,1.25,.43,.09,13)
  for x in [-.66,.66]:
   box('grow-upright',x,.23,.33,.09,.125,1.28,2)
   for z in [.55,1.15]:box('upright-clip',x,.23,z,.13,.16,.08,1)
  box('grow-bar',0,.17,1.57,1.5,.28,.13,1)
  box('grow-diffuser',0,.12,1.54,1.22,.18,.04,14,priority=3)
  for plant,x in enumerate([-.42,0,.42]):
   cyl('plant-cup',(x,0,.37),.15,.16,1);cyl('plant-soil',(x,0,.455),.12,.04,13)
   height=[.52,.79,.46][plant]
   pipe('stem',(x,0,.46),(x,0,.46+height),.028,11)
   for level in range(3):
    for side in [-1,1]:
     start=Vector((x,0,.53+level*height*.26));angle=plant*.7+level*.95+(0 if side==1 else math.pi)
     end=start+Vector((math.cos(angle)*.22,math.sin(angle)*.16,.16+level*.02))
     delta=end-start
     verts=[]
     for t,r in [(0,.12),(.28,1),(.68,.75),(1,.07)]:
      for i in range(6):
       a=i*math.tau/6;verts.append((math.cos(a)*.085*r,math.sin(a)*.025*r,t*delta.length))
     faces=[tuple(reversed(range(6))),tuple(range(18,24))]
     for row in range(3):
      for i in range(6):faces.append((row*6+i,row*6+(i+1)%6,(row+1)*6+(i+1)%6,(row+1)*6+i))
     mesh=bpy.data.meshes.new('pointed botanical leaf');mesh.from_pydata(verts,[],faces);mesh.update()
     o=bpy.data.objects.new('leaf',mesh);scene.collection.objects.link(o);o.location=start;o.rotation_euler=delta.to_track_quat('Z','Y').to_euler();finish(o,'cultivated-leaf',12 if (level+plant)%2 else 11,0,4)
  service('feed-control',.5,-.29,.09,.25,.18)
 elif slug in ['crew-bunk','medical-bed']:
  bunk=slug=='crew-bunk';feet(1.3,2.6)
  for z in ([.30,1.35] if bunk else [.48]):
   box('bed-frame',0,0,z,1.32,2.5,.14,1,.025)
   box('mattress',0,0,z+.14,1.13,2.25,.13,8,.035)
   box('blanket',0,-.28,z+.265,1.08,1.55,.0625,7 if bunk else 9,.016,3)
   box('pillow',0,.88,z+.27,.90,.36,.12,8,.04)
   for y in [-1.2,1.2]:box('end-plate',0,y,z+.07,1.31,.14,.23,1)
   for x in [-.59,.59]:box('frame-retainer',x,-.9,z+.04,.11,.15,.17,5)
  if bunk:
   for x in [-.58,.58]:
    for y in [-1.2,1.2]:box('bunk-post',x,y,.08,.13,.14,1.91,2)
   for z in [.4,.67,.94,1.21]:box('ladder-step',-.61,-.60,z,.14,.43,.0625,4)
   box('upper-side-guard',.61,0,1.62,.08,1.55,.22,1)
   service('underbed-drawer',0,-1.27,.10,.86,.21)
  else:
   box('lift-plinth',0,0,0,.7,1.65,.49,2)
   for x in [-.56,.56]:
    for y in [-1.21,1.21]:box('continuous-corner-support',x,y,.07,.16,.16,.45,4)
   o=box('raised-backrest',0,.72,.83,1.06,.68,.14,8,.025);o.rotation_euler.x=math.radians(18)
   for x in [-.69,.69]:
    box('rail-support',x,0,.63,.0625,1.4,.25,4);box('patient-rail',x,0,.88,.10,1.5,.0625,1)
   box('monitor-post',.60,1.19,.5,.125,.125,1.08,4)
   screen('patient-monitor',.45,1.19,1.50,.5,.41)
 elif slug=='lounge-sofa':
  feet(1.5,2.75);box('sofa-plinth',0,0,.09,1.35,2.65,.23,2)
  for y in [-.875,0,.875]:
   box('cushion-base',-.12,y,.32,1.1,.83,.16,1)
   box('seat-cushion',-.15,y,.48,1.04,.80,.17,9,.035)
   box('back-shell',.54,y,.45,.28,.84,.84,1,.025)
   box('back-cushion',.35,y,.65,.19,.78,.57,9,.04,3)
  for y in [-1.27,1.27]:
   box('arm-shell',0,y,.32,1.5,.21,.6,1,.035);box('arm-pad',-.08,y,.92,1.2,.22,.10,9,.025)
 else:raise ValueError(slug)
 bpy.context.view_layer.update()
 meshes=[o for o in collections['GEO'].objects if o.type=='MESH']
 points=[o.matrix_world@Vector(v) for o in meshes for v in o.bound_box]
 low=[min(p[i] for p in points) for i in range(3)];high=[max(p[i] for p in points) for i in range(3)]
 # Make this review safely fit the existing occupied envelope; record exact adaptation.
 target=job['variants'][0]['bounds_m'];scale=[min(1,(target['max'][i]-target['min'][i])/(high[i]-low[i])) for i in range(3)]
 for o in meshes:
  # Transform vertices in world space to apply envelope fit without altering authored rotations.
  matrix=o.matrix_world.copy()
  for v in o.data.vertices:
   p=matrix@v.co
   v.co=Vector(((p[0]-(low[0]+high[0])/2)*scale[0],(p[1]-(low[1]+high[1])/2)*scale[1],(p[2]-low[2])*scale[2]))
  o.location=(0,0,0);o.rotation_euler=(0,0,0);o.scale=(1,1,1)
 for socket in spec['interfaces']:
  o=bpy.data.objects.new(socket['name'],None);collections['SOCKETS'].objects.link(o);o.parent=root;o.location=socket['position_m'];o.empty_display_type='ARROWS';o.empty_display_size=.1;o['status']=socket['status']
 scene['design_id']=job['design_id'];scene['revision']=job['revision'];scene['approval']='unsigned';scene['source']='Blender closed solids; no TypeScript-authored equipment geometry'
 bpy.context.view_layer.update()
 bpy.ops.wm.save_as_mainfile(filepath=str(out/'closed-solids.blend'))
 samples=voxelize(meshes,job.get('cell_meters',.03125))
 (out/'samples.json').write_text(json.dumps(samples,separators=(',',':')))
 bpy.ops.object.select_all(action='DESELECT')
 for o in meshes:o.select_set(True)
 bpy.ops.export_scene.gltf(filepath=str(out/'authoring.glb'),export_format='GLB',use_selection=True,export_apply=True,export_extras=True)
 scene.render.engine='CYCLES';scene.cycles.samples=24;scene.cycles.use_denoising=False
 scene.render.resolution_x=768;scene.render.resolution_y=768;scene.render.resolution_percentage=100
 scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA';scene.render.film_transparent=True;scene.view_settings.view_transform='AgX'
 world=bpy.data.worlds.new('Neutral review');world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.32,.36,.45,1);world.node_tree.nodes['Background'].inputs[1].default_value=.4;scene.world=world
 center=Vector((0,0,spec['dimensions_m'][2]/2))
 for name,loc,power,color in [('Key',(-4,-6,7),1100,(1,.94,.86)),('Fill',(5,-2,4),800,(.75,.84,1)),('Rim',(1,4,6),1000,(.85,.9,1))]:
  data=bpy.data.lights.new(name,'AREA');data.energy=power;data.size=4;data.color=color;o=bpy.data.objects.new(name,data);scene.collection.objects.link(o);o.location=center+Vector(loc);o.rotation_euler=(center-o.location).to_track_quat('-Z','Y').to_euler()
 data=bpy.data.cameras.new('CAM-review');cam=bpy.data.objects.new('CAM-review',data);scene.collection.objects.link(cam);scene.camera=cam;data.type='ORTHO';data.ortho_scale=max(spec['dimensions_m'])*1.55
 cam.location=center+Vector((5,-7,math.sqrt(37)));cam.rotation_euler=(center-cam.location).to_track_quat('-Z','Y').to_euler()
 bpy.ops.wm.save_as_mainfile(filepath=str(out/'authoring.blend'))
 report={'status':'unsigned-review','blender':bpy.app.version_string,'source':'Blender closed solids','source_objects':len(meshes),'pitch_m':job.get('cell_meters',.03125),'occupied_cells':len(samples['cells']),'fit_scale':scale,'original_raw_bounds':{'min':low,'max':high},'target_envelope':target,'materials':{str(k):v for k,v in PALETTE.items()},'sampling_gate':'voxelize_blender validates manifold evaluated solids and constant opaque material inputs','limitations':['Mechanical and crew animation not validated','Rear and underside inferred','No installed gameplay state or published assets changed']}
 (out/'source-validation.json').write_text(json.dumps(report,indent=2)+'\n')
 print(json.dumps({'completed':slug,'cells':len(samples['cells']),'source_objects':len(meshes)}),flush=True)
