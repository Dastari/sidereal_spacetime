"""Native editable cargo meshes, portable PBR materials, no voxel visual conversion."""
from pathlib import Path
import bpy,sys,json,math,hashlib,bmesh
from mathutils import Vector
JOBS=json.loads(Path(sys.argv[sys.argv.index('--')+1]).read_text())
def mat(name,color,metal=0,rough=.36,emission=0):
 m=bpy.data.materials.new(name);m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough
 p.inputs['Emission Color'].default_value=(*color,1);p.inputs['Emission Strength'].default_value=emission
 return m
def link(o,collection):
 for c in list(o.users_collection):c.objects.unlink(o)
 collection.objects.link(o)
def box(name,loc,dim,material,bevel=.009):
 bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=bpy.context.object;o.name='GEO-'+name;o.dimensions=dim;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(material)
 b=o.modifiers.new('Editable manufactured chamfer','BEVEL');b.width=min(bevel,min(dim)*.22);b.segments=2
 n=o.modifiers.new('Weighted panel normals','WEIGHTED_NORMAL');n.keep_sharp=True;link(o,GEO);objects.append(o);return o
def cylinder(name,loc,radius,depth,material,axis='Z',vertices=16):
 bpy.ops.mesh.primitive_cylinder_add(vertices=vertices,radius=radius,depth=depth,location=loc);o=bpy.context.object;o.name='GEO-'+name
 if axis=='X':o.rotation_euler.y=math.pi/2
 if axis=='Y':o.rotation_euler.x=math.pi/2
 o.data.materials.append(material);b=o.modifiers.new('Machined edge','BEVEL');b.width=min(.006,radius*.12);b.segments=2
 n=o.modifiers.new('Weighted cylinder normals','WEIGHTED_NORMAL');n.keep_sharp=True;link(o,GEO);objects.append(o);return o
def beam(name,a,b,width,depth,material):
 a,b=Vector(a),Vector(b);v=b-a;o=box(name,(a+b)/2,(width,depth,v.length),material,.008);o.rotation_euler=v.to_track_quat('Z','Y').to_euler();return o
def socket(name,loc,axis='Z'):
 o=bpy.data.objects.new(name,None);SOCKETS.objects.link(o);o.location=loc;o.empty_display_type='ARROWS';o.empty_display_size=.07
 if axis=='Y':o.rotation_euler.x=math.pi/2
 o['status']='proposed semantic socket; runtime mapping not implemented';return o
def text_mesh(text,loc,size,material):
 bpy.ops.object.text_add(location=loc,rotation=(math.pi/2,0,0));o=bpy.context.object;o.name='GEO-marking-'+text;o.data.body=text;o.data.size=size;o.data.align_x='CENTER';o.data.extrude=.0003;o.data.materials.append(material);bpy.ops.object.convert(target='MESH');link(o,GEO);objects.append(o)
def tank_shell(radius,height,z0,material):
 # Continuous closed annular wall with actual 8 mm vessel skin and closed bottom.
 n=48;t=.008;verts=[]
 for r,z in [(radius,z0),(radius,z0+height),(radius-t,z0+height),(radius-t,z0+t)]:
  verts.extend([(r*math.cos(i*math.tau/n),r*math.sin(i*math.tau/n),z) for i in range(n)])
 faces=[]
 for ring in range(3):
  for i in range(n):j=(i+1)%n;faces.append((ring*n+i,ring*n+j,(ring+1)*n+j,(ring+1)*n+i))
 faces.extend([tuple(reversed(range(n))),tuple(3*n+i for i in range(n))])
 mesh=bpy.data.meshes.new('Vessel wall with interior');mesh.from_pydata(verts,[],faces);mesh.update();o=bpy.data.objects.new('GEO-fluid-vessel-8mm-wall',mesh);GEO.objects.link(o);o.data.materials.append(material);objects.append(o)
 for p in mesh.polygons:p.use_smooth=len(p.vertices)==4
 return o
def camera_at(loc,target,scale):
 camera.location=loc;camera.rotation_euler=(Vector(target)-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.ortho_scale=scale
for job in JOBS:
 out=Path(job['output']);s=job['specification'];family=s['family'];size=s['size'];w,d,h=s['dimensions_m'];t=s['wall_assembly_depth_m'];small=size=='small';medium=size=='medium';hand=small or medium;base=.065 if small else .14 if medium else .20
 bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
 for c in list(bpy.data.collections):
  if c.users==0:bpy.data.collections.remove(c)
 scene=bpy.context.scene;scene.unit_settings.system='METRIC';scene.unit_settings.scale_length=1
 root=bpy.data.collections.new(job['design_id']);scene.collection.children.link(root)
 groups={n:bpy.data.collections.new(n) for n in ['GEO','SOCKETS','COLLISION','LOD']}
 for c in groups.values():root.children.link(c)
 GEO=groups['GEO'];SOCKETS=groups['SOCKETS'];objects=[]
 pale=mat('Cargo | pale ceramic enamel',(.66,.70,.76),.08,.32);dark=mat('Cargo | indigo structure',(.026,.043,.085),.42,.37);seal=mat('Cargo | elastomer gasket',(.009,.014,.025),0,.65);steel=mat('Cargo | satin titanium',(.27,.32,.39),.8,.30);red=mat('Cargo | burgundy service',(.30,.025,.049),.12,.38);orange=mat('Cargo | utility amber',(.95,.32,.018),.05,.38);blue=mat('Cargo | cobalt insulation',(.027,.13,.39),.08,.3);cyan=mat('Cargo | status cyan',(.01,.65,.85),0,.3,1.2);white=mat('Cargo | marking ivory',(.86,.88,.84),0,.45)
 accent=orange if family in ['salvage','reinforced'] or (family=='standard' and size=='large') else blue if family in ['refrigerated','fluid'] else red if family=='medical' else steel if family=='vacuum' else dark
 # Base load frame: real fork voids between three skids; small carries on four feet.
 post=.046 if small else .064 if medium else .105
 if small:
  for x in [-w/2+post,w/2-post]:
   for y in [-d/2+post,d/2-post]:box('isolating-foot',(x,y,base/2),(post,post,base),dark)
 else:
  for x in [-w/2+post,0,w/2-post]:box('fork-skid',(x,0,(base-.04)/2),(post,d-.025,base-.04),dark)
 box('load-deck',(0,0,base-.022),(w-.025,d-.025,.044),steel)
 # Hollow shell keeps cargo volume physically empty. Pressure/thermal capability remains a proposal.
 if family!='fluid':
  for sign in [-1,1]:
   box('side-sandwich-'+str(sign),(sign*(w/2-t/2-.022),0,(h+base)/2),(t,d-.06,h-base-.055),pale)
   box('rear' if sign==1 else 'front-gasket',(0,sign*(d/2-t/2-.022),(h+base)/2),(w-2*t-.04,t,h-base-.055),pale if sign==1 else seal)
  # Large/oversized have front doors; their facade is two explicit leaves.
  count=1 if hand else 2
  for i in range(count):
   width=(w-2*post-.04)/count-.008;x=0 if hand else (-1 if i==0 else 1)*(width+.008)/2
   box('front-access-leaf-'+str(i),(x,-d/2+.009,(h+base)/2),(width,.036,h-base-.13),accent if family in ['medical','refrigerated'] else pale,.012)
   box('recessed-front-inlay-'+str(i),(x,-d/2-.011,(h+base)/2),(width-.05,.009,(h-base)*.46),dark,.004)
   box('front-inlay-cover-'+str(i),(x,-d/2-.017,(h+base)/2+.018),(width-.075,.009,(h-base)*.33),accent,.004)
  lid_z=h-.035
  box('continuous-lid-gasket',(0,0,lid_z-.034),(w-.06,d-.06,.012),seal,.002)
  box('separate-lid',(0,0,lid_z),(w-.035,d-.035,.048),pale,.012)
  for x in [-w*.27,w*.27]:box('top-structural-strap',(x,0,h-.009),(post,d-.018,.018),dark,.004)
  box('recessed-lid-service-cover',(0,0,h-.006),(w*.28,d*.45,.012),accent,.003)
 else:
  radius=min(w,d)/2-.085;th=h-base-.16
  tank_shell(radius,th,base,steel)
  cylinder('sealed-vessel-lid',(0,0,base+th),radius,.024,pale,vertices=48)
  for z in [base+.10,base+th-.10]:
   # Rounded support collars are actual solid rings (torus), not cuboid tank stand-ins.
   bpy.ops.mesh.primitive_torus_add(major_radius=radius+.007,minor_radius=.022,major_segments=48,minor_segments=8,location=(0,0,z));o=bpy.context.object;o.name='GEO-vessel-support-collar';o.data.materials.append(dark);link(o,GEO);objects.append(o)
  cylinder('fill-port',(0,0,h-.095),.065,.07,dark);cylinder('fill-cap',(0,0,h-.052),.075,.025,blue)
  cylinder('drain-valve',(0,-radius-.035,base+.10),.036,.09,steel,'Y');socket('SOCK_FLUID_OUT',(0,-radius-.09,base+.10),'Y');socket('SOCK_FLUID_IN',(0,0,h-.035))
  box('level-indicator-housing',(radius*.45,-radius+.008,(h+base)/2),(.065,.045,th*.7),dark)
  box('opaque-level-display',(radius*.45,-radius-.019,(h+base)/2),(.026,.008,th*.56),cyan,.002)
 # Corner cage, split pale armor segments, end caps and stacking cups.
 for x in [-w/2+post/2,w/2-post/2]:
  for y in [-d/2+post/2,d/2-post/2]:
   box('continuous-corner-column',(x,y,(h+base)/2),(post,post,h-base),dark)
   for z in [base+.08,h-.08]:
    box('corner-impact-shoe',(x,y,z),(post*1.18,post*1.18,.09 if hand else .15),accent if family in ['reinforced','salvage'] else pale)
    if y<0:cylinder('captive-corner-bolt',(x,y-post*.64,z),.009 if hand else .016,.006,steel,'Y')
   # Four rim pieces leave a genuine stacking receiver recess.
   for a,b in [(-1,0),(1,0),(0,-1),(0,1)]:box('stack-receiver-rim',(x+a*post*.38,y+b*post*.38,h+.002),(post*.22 if a else post,post*.22 if b else post,.014),steel,.002)
 # Full-length lower and upper end frame rails, with horizontal segmented panel battens.
 for y in [-d/2+.02,d/2-.02]:
  for z in [base+.026,h-.066]:box('end-frame',(0,y,z),(w-.025,.05,.045),dark)
 for x in [-w/2-.002,w/2+.002]:
  for z in [base+(h-base)*.26,base+(h-base)*.72]:box('side-panel-course',(x,0,z),(.018,d-.13,.026 if hand else .045),dark,.003)
  box('side-service-cartridge',(x,0,base+(h-base)*.44),(.024,min(.20,d*.4),.13 if hand else .25),red,.004)
 # Fixed glove-sized handle, with 45mm clearance, never multiplied by container scale.
 gripz=min(1.05,base+(h-base)*.69)
 for sign in [-1,1]:
  x=sign*(w/2+.031)
  box('handle-recess',(sign*(w/2+.004),0,gripz),(.012,.235,.106),seal,.004)
  for y in [-.10,.10]:box('handle-cheek',(x,y,gripz),(.055,.026,.06),steel,.005)
  cylinder('folding-handle-grip',(sign*(w/2+.057),0,gripz),.011,.20,steel,'Y')
  socket('SOCK_HAND_'+('L' if sign<0 else 'R'),(sign*(w/2+.057),0,gripz),'Y')
 # Hinges are size-selected knuckles; all neutral-position hardware is separate editable mesh.
 hinge_r=.010 if small else .015 if medium else .024
 for x in [-w*.28,w*.28] if hand else [-w/2+post,w/2-post]:
  for j in range(3):
   if hand:cylinder('lid-hinge-knuckle',(x+(j-1)*.025,d/2+.005,h-.046),hinge_r,.023,steel,'X')
   else:cylinder('door-hinge-knuckle',(x,-d/2-.014,base+(h-base)*.35+(j-1)*.06),hinge_r,.055,steel)
 socket('PIVOT_LID' if hand else 'PIVOT_DOOR_LEFT',(0,d/2,h-.046) if hand else (-w/2+post,-d/2,h/2),'Y')
 if not hand:socket('PIVOT_DOOR_RIGHT',(w/2-post,-d/2,h/2),'Y')
 for x in [-w*.28,w*.28] if hand else [-.06,.06]:
  z=h-.12 if hand else min(1.05,h*.56)
  box('latch-keeper',(x,-d/2-.032,z),(.045,.028,.12 if hand else .20),steel,.004)
  box('latch-toggle',(x,-d/2-.052,z+.012),(.025,.017,.064 if hand else .13),orange if family=='reinforced' else dark,.003)
 if family=='reinforced':
  for x in [-w*.32,w*.32]:
   box('armor-load-band-front',(x,-d/2-.030,(h+base)/2),(.055,.028,h-base-.1),steel)
   for z in [base+.18,h-.2]:
    o=box('hazard-inlay',(x,-d/2-.047,z),(.052,.006,.018),orange,.001);o.rotation_euler.y=.5
 if family=='refrigerated':
  for i in range(6):box('condenser-louver',(w/2+.025,d*.21,base+.14+i*.028),(.02,d*.28,.014),dark,.002)
  box('temperature-control',(0,-d/2-.031,h*.58),(.17,.018,.14),blue)
  text_mesh('04 C',(0,-d/2-.043,h*.57),.033,white);socket('SOCK_POWER',(w/2,d*.2,base+.12),'Y')
 if family=='vacuum':
  # Deliberately heavier compression bands and a blind equalization valve.
  for y in [-d*.28,d*.28]:
   for x in [-w/2-.015,w/2+.015]:box('pressure-closure-side-band',(x,y,(h+base)/2),(.04,.065,h-base-.08),steel)
   box('pressure-closure-top-band',(0,y,h-.002),(w,.065,.025),steel)
  cylinder('equalization-valve',(0,-d/2-.042,h*.53),.07,.04,steel,'Y');cylinder('valve-blind',(0,-d/2-.066,h*.53),.042,.014,dark,'Y');socket('SOCK_EQUALIZE',(0,-d/2-.08,h*.53),'Y')
 if family=='salvage':
  for sign in [-1,1]:beam('sacrificial-diagonal-brace',(sign*(w/2+.025),-d*.40,base+.1),(sign*(w/2+.025),d*.40,h-.16),.035,.065,orange)
  # Towing clevis with open gap and pin, not a decorative solid cube.
  for x in [-.065,.065]:box('tow-clevis-ear',(x,0,h+.045),(.035,.14,.09),steel)
  cylinder('tow-clevis-pin',(0,0,h+.08),.025,.18,orange,'X');socket('SOCK_TOW',(0,0,h+.08));box('recovery-beacon',(w*.22,-d/2-.027,h*.65),(.033,.02,.11),cyan)
 if family=='medical':
  box('medical-label',(0,-d/2-.030,h*.53),(.14,.012,.14),red)
  box('medical-plus-vertical',(0,-d/2-.039,h*.53),(.025,.004,.083),white,.001);box('medical-plus-horizontal',(0,-d/2-.040,h*.53),(.083,.004,.025),white,.001)
 if family=='high-value':
  box('tamper-electronics',(0,-d/2-.037,h*.53),(.15,.023,.12),steel)
  for x in [-.04,0,.04]:box('seal-status-segment',(x,-d/2-.052,h*.53),(.015,.009,.054),orange,.002)
  for x in [-w*.35,w*.35]:box('anti-pry-keeper',(x,-d/2-.04,h*.55),(.035,.03,h*.42),dark)
 # Markings are restrained embossed geometry, portable in GLB.
 text_mesh(f'{family[:3].upper()} / {size[0].upper()}',(0,-d/2-.037,base+.065),.023 if hand else .045,white)
 box('status-lens',(w/2-post*1.65,-d/2-.024,h-.17),(.015,.009,.045 if hand else .075),cyan,.002)
 mx=s['mounting']['mount_x_m']/2;my=s['mounting']['mount_y_m']/2
 for i,(x,y) in enumerate([(-mx,-my),(-mx,my),(mx,-my),(mx,my)]):
  socket('SOCK_MOUNT_'+str(i),(x,y,0));box('underside-lock-pad',(x,y,.012),(.052 if hand else .10,.052 if hand else .10,.024),steel,.003)
 socket('FX_TRACTOR_TARGET',(0,0,h/2));socket('SOCK_INTERACT',(0,-d/2-.15,min(1.1,h*.65)),'Y')
 # Independent conservative proxy stays hidden and is excluded from visual export.
 proxy=box('occupancy-proxy',(0,0,h/2),(w,d,h),dark,0);objects.remove(proxy);link(proxy,groups['COLLISION']);proxy.hide_render=True;proxy.hide_set(True);proxy['representation']='coarse separate proxy; no authority implementation'
 groups['LOD']['status']='LOD0 only; optimization pending'
 bpy.context.view_layer.update();deps=bpy.context.evaluated_depsgraph_get();points=[];triangles=0;nonmanifold=[]
 for o in objects:
  ev=o.evaluated_get(deps);mesh=ev.to_mesh();mesh.calc_loop_triangles();triangles+=len(mesh.loop_triangles);points.extend(o.matrix_world@v.co for v in mesh.vertices)
  if not o.name.startswith('GEO-marking'):
   bm=bmesh.new();bm.from_mesh(mesh);bad=sum(not e.is_manifold for e in bm.edges)
   if bad:nonmanifold.append({'mesh':o.name,'edges':bad})
   bm.free()
  ev.to_mesh_clear()
 bounds={'min':[min(p[i] for p in points) for i in range(3)],'max':[max(p[i] for p in points) for i in range(3)]}
 # Select geometry and named sockets only. Blender source keeps every authored part and modifier.
 bpy.ops.object.select_all(action='DESELECT')
 for o in [*objects,*SOCKETS.objects]:o.select_set(True)
 bpy.context.view_layer.objects.active=objects[0]
 bpy.ops.export_scene.gltf(filepath=str(out/'glb.glb'),export_format='GLB',use_selection=True,export_apply=True,export_yup=True,export_materials='EXPORT',export_extras=True)
 materials=[{'name':m.name,'base_color':list(m.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value),'metallic':m.node_tree.nodes.get('Principled BSDF').inputs['Metallic'].default_value,'roughness':m.node_tree.nodes.get('Principled BSDF').inputs['Roughness'].default_value} for m in {o.active_material for o in objects}]
 (out/'materials.json').write_text(json.dumps(materials,indent=2))
 (out/'validation-blender.json').write_text(json.dumps({'blender':bpy.app.version_string,'bounds_m':bounds,'nominal_envelope_m':[w,d,h],'actual_dimensions_m':[bounds['max'][i]-bounds['min'][i] for i in range(3)],'triangles':triangles,'editable_meshes':len(objects),'nonmanifold_solids':nonmanifold,'materials':len(materials),'sockets':[o.name for o in SOCKETS.objects],'finite':all(math.isfinite(v) for p in points for v in p),'hardware_overhang':'Grips extend 68mm each side; front latches 61mm; salvage tow clevis exceeds roof 105mm. Hatch/stack interfaces require these actual bounds.'},indent=2))
 # Neutral portable PBR studio; real alpha cutout, then grey-background and overhead renders.
 scene.render.engine='CYCLES';scene.cycles.samples=40;scene.cycles.use_denoising=False
 scene.render.resolution_x=900;scene.render.resolution_y=800;scene.render.resolution_percentage=100;scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA';scene.render.film_transparent=True
 scene.world.color=(.22,.22,.22);scene.view_settings.view_transform='AgX'
 bpy.ops.object.camera_add();camera=bpy.context.object;camera.name='REVIEW-camera';camera.data.type='ORTHO';scene.camera=camera
 span=max(w,d,h);target=(0,0,h*.49);camera_at((span*1.7,-span*2.4,h*.5+span*1.7),target,span*1.6+.3)
 for name,loc,power,sz in [('key',(span*1.6,-span*2,span*3),500*span**2,span*2),('fill',(-span*2,-span,span*1.2),220*span**2,span*2),('rim',(0,span*2,span*2),350*span**2,span)]:
  bpy.ops.object.light_add(type='AREA',location=loc);light=bpy.context.object;light.name='REVIEW-'+name;light.data.energy=power;light.data.shape='DISK';light.data.size=sz;light.rotation_euler=(Vector(target)-light.location).to_track_quat('-Z','Y').to_euler()
 scene['design_id']=job['design_id'];scene['revision']=1;scene['publication']='unsigned draft';scene['specification']=json.dumps(s)
 bpy.ops.wm.save_as_mainfile(filepath=str(out/'blender-source.blend'))
 scene.render.filepath=str(out/'cutout.png');bpy.ops.render.render(write_still=True)
 scene.render.film_transparent=False;scene.world.color=(.085,.10,.13);scene.render.filepath=str(out/'blender-close.png');bpy.ops.render.render(write_still=True)
 camera_at((0,-.001,span*4),(0,0,0),max(w,d)*1.25+.15);scene.render.filepath=str(out/'blender-top.png');bpy.ops.render.render(write_still=True)
 print('CARGO_COMPLETE',job['slug'],flush=True)
