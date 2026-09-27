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

def clipped_panel(name,width,height,depth,loc,material,clip=.025):
 # Eight-sided panel extruded along Y, broad face is X/Z.
 x=width/2;z=height/2;c=min(clip,width*.22,height*.22)
 poly=[(-x+c,-z),(x-c,-z),(x,-z+c),(x,z-c),(x-c,z),(-x+c,z),(-x,z-c),(-x,-z+c)]
 verts=[(px,y,pz) for y in [-depth/2,depth/2] for px,pz in poly];faces=[tuple(range(7,-1,-1)),tuple(range(8,16))]+[(i,(i+1)%8,(i+1)%8+8,i+8) for i in range(8)]
 mesh=bpy.data.meshes.new(name);mesh.from_pydata(verts,[],faces);mesh.update();o=bpy.data.objects.new('GEO-'+name,mesh);GEO.objects.link(o);o.location=loc;o.data.materials.append(material);objects.append(o)
 b=o.modifiers.new('Fine panel bevel','BEVEL');b.width=min(.005,depth*.2);b.segments=2;no=o.modifiers.new('Weighted normals','WEIGHTED_NORMAL');no.keep_sharp=True;return o

def shell_ring(name,width,height,depth,wall,loc,material,clip):
 def outline(w,h,c):
  x=w/2;z=h/2;return [(-x+c,-z),(x-c,-z),(x,-z+c),(x,z-c),(x-c,z),(-x+c,z),(-x,z-c),(-x,-z+c)]
 outer=outline(width,height,clip);inner=outline(width-2*wall,height-2*wall,max(.008,clip-wall*.586))
 verts=[(x,y,z) for y,poly in [(-depth/2,outer),(depth/2,outer),(-depth/2,inner),(depth/2,inner)] for x,z in poly];faces=[]
 for i in range(8):
  k=(i+1)%8;faces.extend([(i,k,k+8,i+8),(16+k,16+i,24+i,24+k),(k,i,16+i,16+k),(i+8,k+8,k+24,i+24)])
 mesh=bpy.data.meshes.new(name);mesh.from_pydata(verts,[],faces);mesh.update();o=bpy.data.objects.new('GEO-'+name,mesh);GEO.objects.link(o);o.location=loc;o.data.materials.append(material);objects.append(o)
 b=o.modifiers.new('Sealed edge roundover','BEVEL');b.width=.003;b.segments=2;return o

def parent_parts(parts,pivot):
 bpy.context.view_layer.update()
 for o in parts:
  mw=o.matrix_world.copy();o.parent=pivot;o.matrix_world=mw

def moving(name,location,axis,angle,parts):
 p=socket('PIVOT_'+name,location);p.rotation_euler=(0,0,0);p['rotation_axis']=axis;p['open_angle_rad']=angle;parent_parts(parts,p);moving_parts.append((p,axis,angle));return p

def pose(fraction):
 for p,axis,angle in moving_parts:p.rotation_euler[axis]=angle*fraction
 bpy.context.view_layer.update()

def add_handle(sign,y,z):
 # Guard cheeks attach to existing side rail; grip is 50 mm off backing, 180 mm clear.
 x=sign*(w/2+.006);box('grip-backing',(x,y,z),(.025,.24,.105),dark)
 for yy in [y-.103,y+.103]:box('grip-support',(sign*(w/2+.034),yy,z),(.073,.026,.065),steel)
 cylinder('glove-grip',(sign*(w/2+.077),y,z),.011,.206,steel,'Y');socket('SOCK_HAND_'+('L' if sign<0 else 'R')+'_'+str(y),(sign*(w/2+.077),y,z),'Y')

def mechanism_hinge(x,y,z,r=.014):
 for dz in [-.027,0,.027]:cylinder('hinge-knuckle',(x,y,z+dz),r,.025,steel)

for job in JOBS:
 out=Path(job['output']);s=job['specification'];family=s['family'];size=s['size'];w,d,h=s['dimensions_m'];hand=size in ['small','medium'];small=size=='small';pod=family in ['refrigerated','vacuum','salvage'];fluid=family=='fluid';t=s['wall_assembly_depth_m'];base=.07 if small else .14 if size=='medium' else .20;post=.06 if small else .09 if size=='medium' else .14
 bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
 scene=bpy.context.scene;scene.unit_settings.system='METRIC';scene.unit_settings.scale_length=1
 root=bpy.data.collections.new(job['design_id']+' r002');scene.collection.children.link(root);groups={n:bpy.data.collections.new(n) for n in ['GEO','SOCKETS','COLLISION','LOD']}
 for c in groups.values():root.children.link(c)
 GEO=groups['GEO'];SOCKETS=groups['SOCKETS'];objects=[];moving_parts=[];mx=(w-post)/2;my=(d-post)/2
 pale=mat('Cargo | pale enamel',(.62,.68,.76),.08,.32);dark=mat('Cargo | indigo frame',(.015,.027,.052),.4,.36);seal=mat('Cargo | gasket',(.008,.012,.019),0,.62);steel=mat('Cargo | titanium',(.25,.30,.37),.8,.30);red=mat('Cargo | burgundy service',(.28,.018,.038),.10,.36);orange=mat('Cargo | utility amber',(.95,.26,.008),.04,.35);blue=mat('Cargo | cold cobalt',(.015,.10,.32),.1,.33);cyan=mat('Cargo | status cyan',(.012,.58,.76),0,.3,1.5);white=mat('Cargo | ivory marking',(.86,.88,.85),0,.46)
 accent=orange if family in ['reinforced','salvage'] or (family=='standard' and size=='large') else blue if family=='refrigerated' else red if family=='medical' else dark
 # Supported skids and matched locating feet. All bottom feet share the top receiver centres.
 for x in [-mx,mx]:box('load-skid',(x,0,(base-.026)/2+.016),(post,d,.0+base-.026),dark)
 for y in [-my,my]:box('crossmember',(0,y,base-.028),(w,post,.056),steel)
 for i,(x,y) in enumerate([(-mx,-my),(-mx,my),(mx,-my),(mx,my)]):
  box('40mm-locating-foot',(x,y,.013),(.04,.04,.026),steel,.001);socket('SOCK_MOUNT_'+str(i),(x,y,0));socket('SOCK_STACK_'+str(i),(x,y,h-.016))
 # Hollow sealed box or clipped pod. No full-area slab is mislabeled a gasket.
 if not pod and not fluid:
  box('sealed-floor',(0,0,base-.009),(w-.012,d-.012,.036),steel)
  for sign in [-1,1]:box('closed-side-wall',(sign*(w/2-t/2-.006),0,(base+h-.04)/2),(t,d-.012,h-base-.04),pale)
  box('closed-rear-wall',(0,d/2-t/2-.006,(base+h-.04)/2),(w-.012,t,h-base-.04),pale)
  if hand:box('closed-front-wall',(0,-d/2+t/2+.006,(base+h-.06)/2),(w-.012,t,h-base-.06),pale)
  else:box('fixed-roof',(0,0,h-.044),(w-.012,d-.012,.038),pale)
  # Frame corner columns terminate in receivers, transmit stack force to supported feet.
  for x in [-mx,mx]:
   for y in [-my,my]:
    box('corner-load-column',(x,y,(h+base)/2),(post,post,h-base),dark)
    for z in [base+.045,h-.07]:box('stepped-corner-armor',(x,y,z),(post*1.13,post*1.13,.08 if hand else .13),orange if family=='reinforced' else pale)
  if hand:
   for x in [-w/2+t/2,w/2-t/2]:box('lid-perimeter-seal',(x,0,h-.073),(t,d-2*t,.008),seal,.001)
   for y in [-d/2+t/2,d/2-t/2]:box('lid-perimeter-seal',(0,y,h-.073),(w,t,.008),seal,.001)
   start=len(objects);lid=box('opening-layered-lid',(0,0,h-.050),(w-.025,d-.025,.037),pale,.009)
   # Broad recessed top cap, physically recessed between shoulder bands.
   for x in [-w*.30,w*.30]:box('lid-shoulder-band',(x,0,h-.024),(.055 if small else .085,d-.04,.016),dark,.003)
   box('lid-recess-base',(0,0,h-.028),(w*.38,d*.66,.008),dark,.002)
   box('lid-fitted-cap',(0,0,h-.018),(w*.32,d*.50,.012),accent,.002)
   for y in [-d*.20,d*.20]:box('lid-cap-end-step',(0,y,h-.009),(w*.32,.025,.009),steel,.001)
   for x in [-w*.25,w*.25]:
    box('lid-latch-leaf',(x,-d/2-.018,h-.084),(.046,.026,.102),steel,.004);box('lid-toggle',(x,-d/2-.035,h-.082),(.026,.013,.060),accent,.002)
   lid_parts=objects[start:];moving('LID',(0,d/2-.025,h-.066),0,-math.radians(105),lid_parts)
   for x in [-w*.25,w*.25]:
    cylinder('rear-hinge-pin',(x,d/2-.025,h-.066),.012 if small else .016,.085,steel,'X')
  else:
   # True front opening; seal is four perimeter strips and center meeting gasket.
   for x in [-w/2+t/2,w/2-t/2]:box('door-perimeter-seal',(x,-d/2+.014,(base+h-.055)/2),(t,.014,h-base-.055),seal,.001)
   for z in [base+.016,h-.073]:box('door-perimeter-seal',(0,-d/2+.014,z),(w,.014,.025),seal,.001)
   for sign in [-1,1]:
    x=sign*(w/4-post/4);leafw=w/2-post/2-.012;start=len(objects)
    clipped_panel('door-leaf',leafw,h-base-.10,.040,(x,-d/2-.005,(h+base-.03)/2),pale,.05)
    clipped_panel('door-dark-recess',leafw-.055,(h-base)*.66,.015,(x,-d/2-.035,h*.51+base*.35),dark,.04)
    clipped_panel('door-service-plate',leafw-.10,(h-base)*.52,.016,(x,-d/2-.047,h*.51+base*.35),accent,.04)
    box('vertical-lock-rod',(sign*.055,-d/2-.065,(h+base)/2),(.028,.028,h-base-.22),steel)
    box('lock-lever',(sign*.055,-d/2-.09,min(1.05,h*.53)),(.036,.024,.18),dark)
    moving('DOOR_'+str(sign),(sign*(w/2-post/2),-d/2-.005,(h+base)/2),2,sign*math.radians(110),objects[start:])
    for z in [base+.22,h-.26]:mechanism_hinge(sign*(w/2-post/2),-d/2-.012,z,.024)
  # Layered side plates divided into <= 0.9m structural bays; freight faces have intermediate bands.
  bays=max(1,math.ceil(d/.9));bw=(d-.16)/bays
  for sign in [-1,1]:
   for k in range(bays):
    y=-d/2+.08+bw*(k+.5);o=clipped_panel('side-inset-backing',bw-.028,(h-base)*.62,.015,(sign*(w/2+.004),y,(h+base)/2),dark,.045);o.rotation_euler.z=math.pi/2
    o=clipped_panel('fitted-side-panel',bw-.075,(h-base)*.51,.018,(sign*(w/2+.018),y,(h+base)/2),pale if family!='salvage' else dark,.04);o.rotation_euler.z=math.pi/2
    if k<bays-1:box('freight-intermediate-upright',(sign*(w/2+.028),y+bw/2,(h+base)/2),(.056,.064,h-base-.08),steel)
   add_handle(sign,0 if bays==1 else -d*.28,min(1.02,h*.60))
   # Service plate placed away from grip corridor, with inset louver detail.
   yy=d*.28;box('service-cartridge',(sign*(w/2+.035),yy,base+(h-base)*.30),(.018,min(.18,d*.22),.09 if hand else .16),red)
  if hand:
   clipped_panel('front-inset',w-.15,(h-base)*.50,.016,(0,-d/2-.012,(h+base)/2-.04),dark,.035)
   clipped_panel('front-fitted-panel',w-.19,(h-base)*.39,.012,(0,-d/2-.026,(h+base)/2-.04),pale,.03)
  if family=='reinforced':
   # Broad continuous U-shaped reinforcement wraps the load shell, clear of the doors/lid path.
   for y in [-d*.32,d*.32]:
    for sign in [-1,1]:box('reinforced-side-band',(sign*(w/2+.045),y,(h+base)/2),(.07,.13,h-base-.07),dark)
    if not hand:box('reinforced-roof-band',(0,y,h-.024),(w,.13,.025),steel)
   for x in [-w/2+post/2,w/2-post/2]:
    box('heavy-front-armor-post',(x,-d/2-.06,(h+base)/2),(.13,.10,h-base-.05),steel)
    for z in [base+.14,h-.17]:
     box('amber-hazard-plate',(x,-d/2-.115,z),(.115,.009,.11),orange,.003)
     for dz in [-.025,.025]:o=box('hazard-split',(x,-d/2-.121,z+dz),(.10,.004,.017),dark,.001);o.rotation_euler.y=.45
  if family=='high-value':
   # Recessed anti-pry cabinet frame, with electronic lock attached to the lid leaf.
   for x in [-w/2+.07,w/2-.07]:box('secure-anti-pry-post',(x,-d/2-.036,(h+base)/2),(.09,.07,h-base-.04),steel)
   for z in [base+.06,h-.085]:box('secure-anti-pry-crossbar',(0,-d/2-.041,z),(w-.06,.075,.07),dark)
   start=len(objects);box('lid-connected-secure-lock-spine',(0,-d/2-.065,(h*.57+h-.05)/2),(.065,.040,h-.05-h*.57),steel);clipped_panel('secure-lock-recess',w*.44,.14 if small else .22,.045,(0,-d/2-.070,h*.57),steel,.024)
   clipped_panel('secure-lock-core',w*.35,.095 if small else .16,.012,(0,-d/2-.099,h*.57),dark,.014)
   cylinder('rotary-lock',(0,-d/2-.119,h*.57),.032 if small else .045,.025,orange,'Y')
   for x in [-w*.12,w*.12]:box('tamper-seal',(x,-d/2-.115,h*.57),(.013,.009,.060),cyan,.001)
   # Entire front lock travels with lid; split line is above stationary perimeter.
   parent_parts(objects[start:],moving_parts[0][0])
  if family=='medical':
   clipped_panel('medical-burgundy-marking-panel',w*.32,(h-base)*.50,.015,(0,-d/2-.047,h*.49),red,.02)
   box('medical-cross-v',(0,-d/2-.058,h*.49),(.025,.005,.083),white,.001);box('medical-cross-h',(0,-d/2-.059,h*.49),(.083,.005,.025),white,.001)
   box('tamper-strip',(w*.31,-d/2-.045,h-.12),(.018,.012,.06),orange,.002)
 elif pod:
  ph=h-base-.03;cz=base+ph/2;c=min(w,ph)*.18
  shell_ring('continuous-clipped-pressure-shell',w-.04,ph,d-.15,t,(0,0,cz),dark if family=='salvage' else blue if family=='refrigerated' else pale,c)
  clipped_panel('sealed-rear-bulkhead',w-.04,ph,t,(0,d/2-.08,cz),dark if family=='salvage' else pale,c)
  # Perimeter collar leaves an actual cargo aperture; hatch and control travel as one assembly.
  shell_ring('front-load-collar',w+.035,ph+.035,.13,.075,(0,-d/2+.045,cz),orange if family=='salvage' else pale,c)
  shell_ring('rear-load-collar',w+.035,ph+.035,.13,.075,(0,d/2-.045,cz),orange if family=='salvage' else pale,c)
  shell_ring('hatch-perimeter-elastomer',w-.075,ph-.075,.014,.03,(0,-d/2-.024,cz),seal,c*.7)
  start=len(objects);clipped_panel('single-opening-end-hatch',w-.09,ph-.09,.045,(0,-d/2-.050,cz),steel if family=='vacuum' else pale if family=='refrigerated' else dark,c*.70)
  clipped_panel('recessed-hatch-core',w-.19,ph-.19,.020,(0,-d/2-.085,cz),dark,c*.6)
  if family=='vacuum':
   cylinder('pressure-hatch-lock-wheel',(0,-d/2-.13,cz),w*.14,.05,steel,'Y',24);cylinder('pressure-lock-hub',(0,-d/2-.16,cz),w*.07,.02,dark,'Y')
   for a in [0,math.pi/2]:
    o=box('pressure-wheel-bar',(0,-d/2-.175,cz),(.028,.018,w*.20),orange,.003);o.rotation_euler.y=a
  else:
   box('end-hatch-grip',(0,-d/2-.13,cz),(.18,.045,.036),steel)
   box('end-status-lens',(w*.19,-d/2-.101,cz),(.022,.012,ph*.27),cyan,.002)
  moving('END_HATCH',(-w/2+.045,-d/2-.05,cz),2,-math.radians(110),objects[start:])
  for zz in [cz-ph*.24,cz+ph*.24]:mechanism_hinge(-w/2+.045,-d/2-.05,zz,.02)
  bands=max(2,math.ceil(d/.85))
  for y in [-d*.30+i*(d*.6/(bands-1)) for i in range(bands)]:
   shell_ring('compression-frame-band',w+.02,ph+.02,.09,.035,(0,y,cz),steel if family=='vacuum' else pale if family=='refrigerated' else orange,c)
  # Supported upper side rails carry fixed-size grips well above service cartridges.
  for sign in [-1,1]:
   box('side-handling-rail',(sign*(w/2+.027),0,cz+.03),(.06,d-.12,.095),dark)
   add_handle(sign,0,cz+.03)
   if family=='refrigerated':
    # Rear service compartment and physical divider match capacity reservation.
    box('cooling-service-housing',(sign*(w/2+.056),d/2-.23,cz),(.10,.25,ph*.54),blue)
    for z in [cz-ph*.18+i*ph*.065 for i in range(6)]:box('condenser-fin',(sign*(w/2+.111),d/2-.23,z),(.014,.20,.018),steel,.002)
    box('temperature-display',(sign*(w/2+.066),-d*.21,cz-.09),(.045,.19,.12),dark)
    box('temperature-status',(sign*(w/2+.091),-d*.21,cz-.09),(.008,.12,.033),cyan)
   if family=='salvage':
    # Lower sacrificial rails remain far below hand corridors.
    box('recovery-scrape-rail',(sign*(w/2+.045),0,base+.065),(.08,d-.18,.095),orange)
  if family=='refrigerated':
   box('reserved-cooling-bay-divider',(0,d/2-.08-.16,cz),(w-.08,.024,ph-.04),steel)
   socket('SOCK_POWER',(w/2+.12,d/2-.23,base+.1),'Y')
  if family=='salvage':
   box('tow-load-bridge',(0,0,h-.025),(w,.22,.055),steel)
   for x in [-.065,.065]:box('tow-clevis-ear',(x,0,h+.035),(.034,.12,.095),steel)
   cylinder('tow-pin',(0,0,h+.070),.024,.19,orange,'X');socket('SOCK_TOW',(0,0,h+.070))
   box('beacon-base',(w*.26,d*.25,h-.01),(.09,.10,.065),dark);box('beacon-lens',(w*.26,d*.25,h+.025),(.045,.055,.04),cyan)
 else:
  # Horizontal tank with real hollow shell, end closures and frame-supported hardware.
  r=min(w/2-.09,(h-base)/2-.04);length=d-.22;cz=base+r
  # 48-sided shell ring, axis Y; annular side with separate 12mm end caps.
  n=48;verts=[(rad*math.cos(i*math.tau/n),y,cz+rad*math.sin(i*math.tau/n)) for rad,y in [(r,-length/2),(r,length/2),(r-.008,-length/2),(r-.008,length/2)] for i in range(n)];faces=[]
  for i in range(n):k=(i+1)%n;faces.extend([(i,k,k+n,i+n),(2*n+k,2*n+i,3*n+i,3*n+k),(k,i,2*n+i,2*n+k),(i+n,k+n,k+3*n,i+3*n)])
  mesh=bpy.data.meshes.new('Horizontal vessel hollow skin');mesh.from_pydata(verts,[],faces);mesh.update();o=bpy.data.objects.new('GEO-horizontal-vessel-8mm-skin',mesh);GEO.objects.link(o);o.data.materials.append(steel);objects.append(o)
  for f in mesh.polygons:f.use_smooth=True
  for sign in [-1,1]:
   cylinder('12mm-vessel-end-cap',(0,sign*(length/2-.006),cz),r,.012,pale,'Y',48)
   for a in range(8):
    ang=a*math.tau/8;cylinder('end-cap-captive-bolt',(r*.83*math.cos(ang),sign*(length/2+.004),cz+r*.83*math.sin(ang)),.009,.009,dark,'Y')
  for y in [-length*.32,length*.32]:
   box('tank-saddle',(0,y,base+.025),(w-.05,.12,.08),dark)
   shell_ring('protective-octagonal-collar',w,h-base,.09,.06,(0,y,base+(h-base)/2),pale,min(w,h-base)*.18)
  for sign in [-1,1]:
   box('gauge-support-rail',(sign*(w/2-.012),0,cz),(.06,d-.10,.12),dark)
   box('broad-opaque-level-housing',(sign*(w/2+.021),0,cz),(.03,d*.56,.14),blue)
   box('level-display',(sign*(w/2+.04),0,cz),(.01,d*.43,.058),cyan,.002)
   # End crossmember support, separated from the central level gauge.
   box('end-handling-support',(sign*(w/2+.014),-d*.34,cz+.13),(.06,.25,.18),dark);add_handle(sign,-d*.34,cz+.13)
  cylinder('connected-fill-neck',(0,0,cz+r+.015),.055,.05,steel);cylinder('fill-cap',(0,0,cz+r+.052),.070,.024,blue)
  cylinder('connected-drain-neck',(0,-length/2-.03,cz-r*.55),.028,.07,steel,'Y');cylinder('drain-blind-cap',(0,-length/2-.069,cz-r*.55),.039,.025,blue,'Y');socket('SOCK_FLUID_OUT',(0,-length/2-.085,cz-r*.55),'Y');socket('SOCK_FLUID_IN',(0,0,cz+r+.064));socket('SOCK_VENT',(.10,0,cz+r+.03))
  cylinder('vent-neck',(.10,0,cz+r-.01),.019,.065,steel);cylinder('vent-cap',(.10,0,cz+r+.028),.026,.018,dark)
 # Cage posts for pods/tanks support top receivers, independent of pressure shell.
 if pod or fluid:
  for x in [-mx,mx]:
   for y in [-my,my]:box('external-corner-load-post',(x,y,(h+base)/2),(.06,.06,h-base),dark)
  for y in [-my,my]:box('upper-stack-crossmember',(0,y,h-.025),(w,.07,.05),steel)
 # Matching 44mm top receivers are cut into a supported 70mm shoe, foot is 40mm.
 for x in [-mx,mx]:
  for y in [-my,my]:
   box('stack-receiver-base',(x,y,h-.025),(.070,.070,.018),steel,.002)
   for a,b in [(-1,0),(1,0),(0,-1),(0,1)]:box('44mm-clear-stack-receiver',(x+a*.0285,y+b*.0285,h-.010),(.013 if a else .07,.013 if b else .07,.020),steel,.001)
 # Ordinary markings are attached to closed walls, never unsupported in tank voids.
 if not fluid:text_mesh(f'{family[:3].upper()} / {size[0].upper()}',(0,-d/2-.043,base+.045),.020 if hand else .038,white)
 socket('SOCK_INTERACT',(0,-d/2-.25,min(1.05,h*.60)),'Y');socket('FX_TRACTOR_TARGET',(0,0,h/2))
 # Capacity gauge is a separate review-only object; its dimensions correspond to specification.
 if not fluid:
  iw,il,ih=s['interior_clear_dimensions_m'];cy=-.08 if family=='refrigerated' else 0;cap=box('usable-capacity-envelope',(0,cy,base+t+.03+ih/2) if pod else (0,0,base+.025+ih/2),(iw,il,ih),blue,0);objects.remove(cap);link(cap,groups['COLLISION']);cap.hide_render=True;cap.hide_set(True);cap['litres']=s['usable_capacity']['value'];cap['representation']='conservative cargo clearance gauge, not a collider'
 # Correct hinge plane clears stationary corner armor; attached leaves retain their source hierarchy.
 for pivot,axis,angle in moving_parts:
  if 'DOOR_' in pivot.name:
   delta=-.14 if family=='reinforced' else -.045
   pivot.location.y+=delta
 if not hand and not pod and not fluid:
  for o in objects:
   if o.name.startswith('GEO-hinge-knuckle'):o.location.y+=(-.14 if family=='reinforced' else -.045)
 exec(compile((Path(__file__).parent/'cargo_mechanics_fix.py').read_text(),'cargo_mechanics_fix.py','exec'))
 # r003 stationary hinge saddles: load path to rear frame, behind the opening sweep.
 if hand and not pod and not fluid:
  for pinx in [-w*.25,w*.25]:
   for end in [-1,1]:
    box('fixed-rear-hinge-saddle',(pinx+end*.047,d/2-post-.004+.026,h-.0595),(.020,.050,.063),steel,.002)
 # Recalculate outward normals for each connected closed authored solid (including custom rings).
 for o in objects:
  if not o.name.startswith('GEO-marking'):
   bm=bmesh.new();bm.from_mesh(o.data);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(o.data);bm.free()
 # Validate native solids and bake neutral transforms only into temporary GLB export copies.
 bpy.context.view_layer.update();deps=bpy.context.evaluated_depsgraph_get();points=[];triangles=0;nonmanifold=[]
 for o in objects:
  ev=o.evaluated_get(deps);me=ev.to_mesh();me.calc_loop_triangles();triangles+=len(me.loop_triangles);points.extend(o.matrix_world@v.co for v in me.vertices)
  if not o.name.startswith('GEO-marking'):
   bm=bmesh.new();bm.from_mesh(me);bad=sum(not e.is_manifold for e in bm.edges)
   if bad:nonmanifold.append({'mesh':o.name,'edges':bad})
   bm.free()
  ev.to_mesh_clear()
 bounds={'min':[min(p[i] for p in points) for i in range(3)],'max':[max(p[i] for p in points) for i in range(3)]}
 proxy=box('conservative-occupancy-proxy',[(bounds['min'][i]+bounds['max'][i])/2 for i in range(3)],[bounds['max'][i]-bounds['min'][i] for i in range(3)],dark,0);objects.remove(proxy);link(proxy,groups['COLLISION']);proxy.hide_render=True;proxy.hide_set(True);proxy['representation']='conservative neutral-pose bounds only; open sweep separate'
 bpy.ops.object.select_all(action='DESELECT');copies=[]
 for o in objects:
  ev=o.evaluated_get(deps);me=bpy.data.meshes.new_from_object(ev);me.transform(o.matrix_world);copy=bpy.data.objects.new(o.name+'--export',me);scene.collection.objects.link(copy);copy.select_set(True);copies.append(copy)
 for o in SOCKETS.objects:
  if not o.name.startswith('PIVOT'):o.select_set(True)
 bpy.context.view_layer.objects.active=copies[0];bpy.ops.export_scene.gltf(filepath=str(out/'glb.glb'),export_format='GLB',use_selection=True,export_apply=True,export_yup=True,export_materials='EXPORT',export_extras=True)
 for o in copies:bpy.data.objects.remove(o,do_unlink=True)
 materials=[{'name':m.name,'base_color':list(m.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value),'metallic':m.node_tree.nodes.get('Principled BSDF').inputs['Metallic'].default_value,'roughness':m.node_tree.nodes.get('Principled BSDF').inputs['Roughness'].default_value} for m in {o.active_material for o in objects}];(out/'materials.json').write_text(json.dumps(materials,indent=2))
 (out/'validation-blender.json').write_text(json.dumps({'blender':bpy.app.version_string,'bounds_m':bounds,'actual_dimensions_m':[bounds['max'][i]-bounds['min'][i] for i in range(3)],'triangles':triangles,'editable_meshes':len(objects),'nonmanifold_solids':nonmanifold,'finite':all(math.isfinite(v) for p in points for v in p),'materials':len(materials),'moving_assemblies':[{'pivot':p.name,'axis':axis,'angle':ang,'children':len(p.children)} for p,axis,ang in moving_parts],'capacity_litres':s['usable_capacity']['value'],'stacking':{'foot_width_m':.04,'receiver_opening_m':.044,'insertion_m':.016,'pitch_m':h-.016,'columns_coincident':True},'sockets':[o.name for o in SOCKETS.objects],'hatch_margin_m':s['handling']['minimum_hatch_clear_width_m']-(bounds['max'][0]-bounds['min'][0]),'proxy':'measured neutral bounds including hardware; open sweep separate; no live authority'},indent=2))
 # Retain authored mechanics, open/half/closed evidence. Parent pivots exist in editable .blend.
 scene.render.engine='CYCLES';scene.cycles.samples=40;scene.cycles.use_denoising=False;scene.render.resolution_x=900;scene.render.resolution_y=800;scene.render.resolution_percentage=100;scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA';scene.render.film_transparent=True;scene.world.color=(.20,.20,.20);scene.view_settings.view_transform='AgX'
 bpy.ops.object.camera_add();camera=bpy.context.object;camera.name='REVIEW-camera';camera.data.type='ORTHO';scene.camera=camera;span=max(w,d,h);target=(0,0,h*.49)
 camera_at((span*1.7,-span*2.4,h*.5+span*1.7),target,span*1.6+.3)
 for name,loc,power,sz in [('key',(span*1.6,-span*2,span*3),420*span**2,span*2),('fill',(-span*2,-span,span*1.2),180*span**2,span*2),('rim',(0,span*2,span*2),300*span**2,span)]:
  bpy.ops.object.light_add(type='AREA',location=loc);light=bpy.context.object;light.name='REVIEW-'+name;light.data.energy=power;light.data.shape='DISK';light.data.size=sz;light.rotation_euler=(Vector(target)-light.location).to_track_quat('-Z','Y').to_euler()
 scene['design_id']=job['design_id'];scene['revision']=3;scene['specification']=json.dumps(s);scene['publication']='unsigned draft'
 bpy.ops.wm.save_as_mainfile(filepath=str(out/'blender-source.blend'))
 scene.render.filepath=str(out/'cutout.png');bpy.ops.render.render(write_still=True)
 scene.render.film_transparent=False;scene.world.color=(.07,.08,.11);scene.render.filepath=str(out/'blender-close.png');bpy.ops.render.render(write_still=True)
 camera_at((0,-.001,span*4),(0,0,0),max(w,d)*1.25+.15);scene.render.filepath=str(out/'blender-top.png');bpy.ops.render.render(write_still=True)
 if moving_parts:
  camera_at((span*1.7,-span*2.4,h*.8+span*2.1),(0,0,h*.80),span*2.8+.5)
  for fraction,name in [(.5,'blender-half-open.png'),(1,'blender-open.png')]:pose(fraction);scene.render.filepath=str(out/name);bpy.ops.render.render(write_still=True)
  pose(0)
 camera_at((span*1.7,-span*2.4,-span*1.7),(0,0,h*.3),span*1.7+.3);scene.render.filepath=str(out/'blender-underside.png');bpy.ops.render.render(write_still=True)
 print('CARGO_R003_COMPLETE',job['slug'],flush=True)
