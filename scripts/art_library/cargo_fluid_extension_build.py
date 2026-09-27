"""Five reference-led fluid forms. Native mesh surfaces; no voxel conversion."""
from pathlib import Path
import bpy, bmesh, hashlib, json, math, sys
from mathutils import Vector

JOBS = json.loads(Path(sys.argv[sys.argv.index('--') + 1]).read_text())
N = 48

def material(name, color, metallic=0, roughness=.35, emission=0):
    m = bpy.data.materials.new(name); m.use_nodes = True
    p = m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value = (*color, 1)
    p.inputs['Metallic'].default_value = metallic; p.inputs['Roughness'].default_value = roughness
    p.inputs['Emission Color'].default_value = (*color, 1); p.inputs['Emission Strength'].default_value = emission
    return m

def own(o, name, mat):
    o.name = 'GEO-' + name
    for c in list(o.users_collection): c.objects.unlink(o)
    GEO.objects.link(o); objects.append(o); o.data.materials.append(mat)
    return o

def bevel(o, width=.006):
    m = o.modifiers.new('Editable edge roundover', 'BEVEL'); m.width = width; m.segments = 3
    m = o.modifiers.new('Weighted manufactured normals', 'WEIGHTED_NORMAL'); m.keep_sharp = True
    return o

def box(name, loc, dim, mat, edge=.006):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc); o = own(bpy.context.object, name, mat)
    o.dimensions = dim; bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return bevel(o, min(edge, min(dim) * .18)) if edge else o

def cyl(name, loc, radius, height, mat, axis='Z', segments=48):
    bpy.ops.mesh.primitive_cylinder_add(vertices=segments, radius=radius, depth=height, location=loc)
    o = own(bpy.context.object, name, mat)
    if axis == 'Y': o.rotation_euler.x = math.pi / 2
    if axis == 'X': o.rotation_euler.y = math.pi / 2
    return bevel(o, min(.003, radius * .1, height * .15))

def lathe(name, profile, mat, loc=(0,0,0), axis='Z'):
    """Closed radial material profile; poles are triangles, never collapsed quads."""
    verts = []; loops = []
    for radius, z in profile:
        loop = []
        for i in range(1 if radius == 0 else N):
            a = i * math.tau / N; loop.append(len(verts)); verts.append((radius*math.cos(a), radius*math.sin(a), z))
        loops.append(loop)
    faces = []
    for a,b in zip(loops, loops[1:] + loops[:1]):
        if len(a) == len(b) == 1: continue
        for i in range(N):
            k = (i+1) % N
            faces.append((a[0], b[k], b[i]) if len(a)==1 else (a[i],a[k],b[0]) if len(b)==1 else (a[i],a[k],b[k],b[i]))
    mesh=bpy.data.meshes.new(name); mesh.from_pydata(verts,[],faces); mesh.update()
    o=bpy.data.objects.new('GEO-'+name,mesh); GEO.objects.link(o); objects.append(o); mesh.materials.append(mat); o.location=loc
    if axis=='Y':o.rotation_euler.x=math.pi/2
    if axis=='X':o.rotation_euler.y=math.pi/2
    for p in mesh.polygons: p.use_smooth = len(p.vertices)==4 and abs(p.normal.z)<.95
    return o

def ring(name, r, inner, z0, z1, mat, loc=(0,0,0), axis='Z'):
    return lathe(name,[(r,z0),(r,z1),(inner,z1),(inner,z0)],mat,loc,axis)

def vessel(name, outer, inner, mat, loc=(0,0,0)):
    o=lathe(name,[(0,outer[0][1])]+outer+list(reversed(inner))+[(0,inner[0][1])],mat,loc)
    # Cross-section matches the authored 48-sided shell, including tapered shoulders.
    factor=N*.5*math.sin(math.tau/N)
    volume=sum(factor*(b[1]-a[1])*(a[0]**2+a[0]*b[0]+b[0]**2)/3 for a,b in zip(inner,inner[1:]))
    o['representation']='Real hollow vessel skin with finite bottom and open service mouth'
    o['internal_volume_m3']=volume; o['inner_profile_radius_height_m']=json.dumps(inner)
    cavities.append({'mesh':o.name,'inner_profile_radius_height_m':inner,'internal_volume_m3':volume})
    return o

def beam(name,a,b,width,mat):
    a,b=Vector(a),Vector(b);o=box(name,(a+b)/2,(width,width,(b-a).length),mat)
    o.rotation_euler=(b-a).to_track_quat('Z','Y').to_euler();return o

def tube(name,a,b,r,wall,mat):
    a,b=Vector(a),Vector(b);o=ring(name,r,r-wall,0,(b-a).length,mat)
    o.location=a;o.rotation_euler=(b-a).to_track_quat('Z','Y').to_euler();return o

def socket(name,loc):
    o=bpy.data.objects.new('SOCK_'+name,None);SOCKETS.objects.link(o);o.location=loc
    o.empty_display_type='ARROWS';o.empty_display_size=.04;o['status']='proposed, no runtime grant';return o

def cap(name,loc,r,mat):
    # Blind closure seals neck; underside open pose reveals the actual neck lumen.
    o=cyl(name,loc,r,.024,mat,segments=24)
    for a in range(6):
        angle=a*math.tau/6
        box(name+'-grip', (loc[0]+r*.80*math.cos(angle),loc[1]+r*.80*math.sin(angle),loc[2]+.013),(.018,.018,.018),steel,.003)
    closures.append(o);return o

def gauge(name,x,y,z,height=.30,width=.075):
    box(name+'-back',(x,y,z),(width+.035,.035,height+.045),dark)
    box(name+'-opaque-lens',(x,y-.021,z),(width,.012,height),blue,.003)
    box(name+'-level-indicator',(x-width*.19,y-.029,z-height*.08),(width*.22,.008,height*.70),cyan,.001)
    for i in range(7):box(name+'-tick',(x+width*.19,y-.029,z-height*.38+i*height*.126),(width*.30,.008,.004),pale,.0005)

def symbol(kind,loc,scale,mat):
    x,y,z=loc
    if kind=='cryo':
        for a in [0, math.pi/3, -math.pi/3]:
            o=box('snowflake-arm',(x,y,z),(.009,.006,scale),mat,.001);o.rotation_euler.y=a
    elif kind=='water':
        # Solid stylized droplet, with bevel and no transmission requirement.
        points=[(0,scale*.6),(-scale*.32,0),(-scale*.25,-scale*.28),(0,-scale*.4),(scale*.25,-scale*.28),(scale*.32,0)]
        verts=[(x+px,y+dy,z+pz) for dy in [-.003,.003] for px,pz in points]
        faces=[tuple(range(5,-1,-1)),tuple(range(6,12))]+[(i,(i+1)%6,(i+1)%6+6,i+6) for i in range(6)]
        me=bpy.data.meshes.new('Water marking');me.from_pydata(verts,[],faces);me.update();o=bpy.data.objects.new('GEO-water-marking',me);GEO.objects.link(o);objects.append(o);me.materials.append(mat)
    else:
        # Raised warning triangle and central bar; source warning vocabulary, no certification mark.
        for a,b in [((-scale*.45,-scale*.32),(0,scale*.46)),((0,scale*.46),(scale*.45,-scale*.32)),((scale*.45,-scale*.32),(-scale*.45,-scale*.32))]:
            beam('hazard-triangle',(x+a[0],y,z+a[1]),(x+b[0],y,z+b[1]),.012,mat)
        box('hazard-exclamation',(x,y-.002,z+.005),(.013,.014,scale*.31),mat,.001)
        box('hazard-dot',(x,y-.002,z-scale*.22),(.014,.014,.014),mat,.001)

def frame(w,d,top,base=.13,posts=True):
    """Foot skids, cross rails and optional corner posts form a connected load path."""
    for x in [-w/2+.045,w/2-.045]:
        box('supported-skid',(x,0,.040),(.086,d-.004,.08),dark)
    for y in [-d/2+.055,d/2-.055]:
        box('lower-load-crossmember',(0,y,base-.035),(w,.11,.07),steel)
    if posts:
        for x in [-w/2+.04,w/2-.04]:
            for y in [-d/2+.04,d/2-.04]:
                box('corner-frame-upright',(x,y,(top+base)/2),(.065,.065,top-base+.035),dark)
                for z in [base+.04,top-.035]:box('corner-impact-shoe',(x,y,z),(.077,.077,.09),pale)
        for z in [base,top]:
            for x in [-w/2+.04,w/2-.04]:box('frame-side-rail',(x,0,z),(.07,d,.055),pale)
            for y in [-d/2+.04,d/2-.04]:box('frame-cross-rail',(0,y,z+.003),(w,.07,.055),pale)
    for k,(x,y) in enumerate([(-w/2+.045,-d/2+.055),(w/2-.045,-d/2+.055),(-w/2+.045,d/2-.055),(w/2-.045,d/2-.055)]):socket('RESTRAINT_'+str(k),(x,y,.09))

def drum(family):
    r=.249;z0=.044;ztop=.776;t=.005
    outer=[(r-.018,z0),(r,.071),(r,.75),(r-.014,ztop)]
    inner=[(r-.024,z0+t),(r-t,.075),(r-t,.745),(r-.020,.771)]
    vessel(family+'-hollow-shell',outer,inner,red if family=='fuel' else yellow)
    # Roll rims overlap body; lower annular rim supports the filled vessel.
    for z in [.027,.113,.706,.785]:
        inner_r=.218 if z==.027 else .239 if z==.785 else .246
        ring('reinforced-roll-rim',.274,inner_r,z-.019,z+.019,dark if z in [.027,.785] else steel)
    ring('removable-drum-head-with-open-bung',.248,.038,.771,.787,pale)
    ring('threaded-open-fill-neck',.048,.038,.780,.839,steel)
    cap('sealed-fill-bung',(0,0,.850),.061,red if family=='fuel' else yellow)
    socket('FLUID_IN',(0,0,.862))
    # Top extraction fitting is connected through the same service head; second access remains a removable blind fitting.
    ring('draw-off-neck',.021,.013,.780,.817,steel,loc=(.135,0,0))
    cap('draw-off-blind-cap',(.135,0,.825),.028,dark)
    # Actual through-hole for the draw-off port.
    bpy.ops.mesh.primitive_cylinder_add(vertices=32,radius=.013,depth=.06,location=(.135,0,.78));cut=bpy.context.object
    head=next(o for o in objects if o.name=='GEO-removable-drum-head-with-open-bung')
    mod=head.modifiers.new('Authored draw-off penetration','BOOLEAN');mod.operation='DIFFERENCE';mod.object=cut;bpy.context.view_layer.objects.active=head;bpy.ops.object.modifier_apply(modifier=mod.name);bpy.data.objects.remove(cut,do_unlink=True)
    if family=='fuel':
        for a in range(6):
            ang=a*math.tau/6;x=.263*math.cos(ang);y=.263*math.sin(ang)
            # Radial thickness stays outside the pressure skin. The upper/lower
            # clamp ends are carried by the exterior circumferential roll rings.
            o=box('barrel-protective-stave',(x,y,.438),(.022,.038,.61),dark);o.rotation_euler.z=ang
            for z in [.15,.68]:
                o=box('stave-clamp',(x,y,z),(.026,.052,.060),pale);o.rotation_euler.z=ang
        # Bonding lug is attached to shell at upper rim, an actual ring not a floating marker.
        ring('bonding-eye',.022,.010,-.009,.009,steel,loc=(.205,-.172,.718),axis='Y');socket('BOND',(.205,-.185,.718))
    else:
        for z in [.24,.57]:ring('chemical-drum-stiffener',.259,.246,z-.014,z+.014,yellow)
        for x in [-.115,.115]:
            angle=math.atan2(-.226,x)
            o=box('head-retainer',(.257*math.cos(angle),.257*math.sin(angle),.769),(.020,.038,.064),steel);o.rotation_euler.z=angle
    box('hazard-label-backing',(0,-.255,.43),(.19,.015,.23),yellow if family=='fuel' else dark)
    symbol('hazard',(0,-.264,.44),.16,dark if family=='fuel' else yellow)
    # Small side service label; no text-derived runtime claim.
    o=box('batch-label',(.251*.5,-.251*math.sqrt(3)/2,.32),(.05,.012,.08),pale);o.rotation_euler.z=math.pi/6
    for x in [-.18,.18]:socket('RESTRAINT_'+str(x),(x,0,.027))
    # The bottom support ring is the datum, not the cylindrical vessel bottom.
    for o in objects:o.location.z-=.008
    for o in SOCKETS.objects:o.location.z-=.008
    for cavity in cavities:
        cavity['inner_profile_radius_height_m']=[[r,z-.008] for r,z in cavity['inner_profile_radius_height_m']]
        bpy.data.objects[cavity['mesh']]['inner_profile_radius_height_m']=json.dumps(cavity['inner_profile_radius_height_m'])
    return .9

def cryo():
    frame(.68,.68,1.275,.14)
    for y in [-.12,.12]:box('cryo-bottom-vessel-saddle',(0,y,.143),(.62,.080,.046),seal)
    inner=[(.212,.150),(.231,.174),(.231,1.109),(.206,1.153),(.038,1.184)]
    outer=[(.220,.142),(.239,.169),(.239,1.116),(.213,1.161),(.046,1.192)]
    vessel('cryo-inner-hollow-pressure-cup',outer,inner,steel)
    # Annular jacket and an explicit insulation gap; nothing occupies useful vessel capacity.
    ring('vacuum-insulation-outer-jacket',.274,.265,.17,1.155,blue)
    for z in [.181,1.135]:ring('insulated-end-bridge',.276,.233,z-.025,z+.025,seal)
    for z in [.21,1.113]:ring('cryo-protective-end-collar',.307,.263,z-.050,z+.050,pale)
    for x in [-.205,.205]:
        box('jacket-front-segment',(x,-.18,.66),(.12,.14,.79),pale)
        for z in [.38,.54,.70,.86]:box('jacket-clip',(x,-.257,z),(.085,.016,.035),steel)
    gauge('cryo-status',0,-.268,.67,.66,.105)
    symbol('cryo',(0,-.298,.70),.11,pale)
    ring('cryo-open-fill-neck',.047,.038,1.176,1.265,steel)
    cap('cryo-service-cap',(0,0,1.276),.066,dark)
    socket('FLUID_IN',(0,0,1.288))
    # Pressure-relief assembly is rooted in the top shoulder via a reinforced boss.
    ring('relief-boss',.028,.012,1.146,1.208,steel,loc=(.135,0,0))
    bpy.ops.mesh.primitive_cylinder_add(vertices=32,radius=.012,depth=.10,location=(.135,0,1.17));cut=bpy.context.object
    cup=next(o for o in objects if o.name=='GEO-cryo-inner-hollow-pressure-cup')
    mod=cup.modifiers.new('Relief penetration through shoulder','BOOLEAN');mod.operation='DIFFERENCE';mod.object=cut;bpy.context.view_layer.objects.active=cup;bpy.ops.object.modifier_apply(modifier=mod.name);bpy.data.objects.remove(cut,do_unlink=True)
    tube('relief-riser',(.135,0,1.19),(.135,0,1.305),.017,.005,steel)
    box('relief-valve-body',(.135,0,1.306),(.065,.046,.054),dark)
    tube('relief-outlet',(.135,-.018,1.306),(.135,-.085,1.306),.012,.003,steel)
    socket('RELIEF_OUT',(.135,-.085,1.306))
    for x in [-.20,.20]:
        box('service-guard-leg',(x,0,1.28),(.035,.045,.15),steel)
    box('service-guard-crossbar',(0,0,1.344),(.435,.045,.032),pale)
    return .85

def gas():
    frame(.88,.68,.867,.145)
    # Six upright pressure vessels, with rounded shoulders and thick wall profiles.
    for x in [-.25,0,.25]:
        for y in [-.145,.145]:
            inner=[(.069,.151),(.088,.177),(.088,.618),(.075,.662),(.014,.701)]
            outer=[(.073,.143),(.096,.172),(.096,.621),(.081,.669),(.022,.711)]
            vessel('gas-cylinder-hollow',outer,inner,pale,(x,y,0))
            for z in [.238,.568]:ring('cylinder-restraint-band',.106,.095,z-.026,z+.026,dark,loc=(x,y,0))
            # Saddle spans attach actual bottle bands to frame crossmembers.
            box('cylinder-foot-saddle',(x,y,.146),(.17,.20,.033),seal)
            cyl('cylinder-neck-valve',(x,y,.736),.030,.062,steel)
            box('individual-isolation-valve',(x,y,.776),(.058,.052,.045),dark)
            cyl('individual-valve-wheel',(x,y,.806),.040,.015,orange,segments=16)
            tube('branch-to-manifold',(x,y,.781),(x,0,.781),.013,.004,steel)
    for z in [.238,.568]:
        # Shortened rails terminate under explicit saddle clips. Orthogonal rail
        # surfaces never overlap at their coplanar top/bottom faces.
        for y in [-.25,.25]:box('bundle-retention-crossrail',(0,y,z),(.714,.05,.062),dark)
        for x in [-.392,.392]:box('bundle-retention-side-rail',(x,0,z),(.05,.52,.062),dark)
        for x in [-.365,.365]:
            for y in [-.25,.25]:box('retention-joint-cover-bracket',(x,y,z),(.085,.095,.090),steel)
    tube('common-pressure-manifold',(-.29,0,.781),(.29,0,.781),.026,.007,steel)
    for x in [-.20,.20]:
        box('manifold-bracket',(x,0,.824),(.036,.073,.11),dark)
    box('manifold-guard-bridge',(0,0,.87),(.86,.070,.060),pale)
    tube('main-outlet',(0,0,.781),(0,-.273,.781),.023,.006,steel)
    box('main-shutoff-body',(0,-.245,.781),(.087,.070,.068),dark)
    cyl('outlet-blind-cap',(0,-.300,.781),.037,.027,orange,'Y')
    socket('GAS_OUT',(0,-.314,.781))
    # Gauge is directly connected to the branch valve block.
    tube('gauge-standpipe',(.047,-.237,.781),(.14,-.237,.781),.012,.004,steel)
    cyl('pressure-gauge-case',(.14,-.245,.781),.045,.033,steel,'Y')
    cyl('pressure-gauge-face',(.14,-.265,.781),.036,.010,blue,'Y')
    o=box('pressure-gauge-needle',(.14,-.273,.787),(.004,.007,.043),pale,.0005);o.rotation_euler.y=.6
    for x in [-.39,.39]:box('front-amber-impact-insert',(x,-.306,.575),(.060,.014,.15),orange)
    return 1.0

def water():
    frame(.88,.68,.867,.145)
    for y in [-.15,.15]:box('water-vessel-support-pad',(0,y,.1275),(.76,.09,.035),seal)
    # One watertight cup is made from joined 6 mm plates, with an open top and actual interior.
    w,d=.736,.536;z0=.145;ztop=.785;t=.006
    verts=[(x,y,z) for ww,dd,z in [(w,d,z0),(w,d,ztop),(w-2*t,d-2*t,ztop),(w-2*t,d-2*t,z0+t)] for x,y in [(-ww/2,-dd/2),(ww/2,-dd/2),(ww/2,dd/2),(-ww/2,dd/2)]]
    faces=[]
    for ring_i in range(3):
        for i in range(4):k=(i+1)%4;faces.append((ring_i*4+i,ring_i*4+k,(ring_i+1)*4+k,(ring_i+1)*4+i))
    faces += [(3,2,1,0),(12,13,14,15)]
    me=bpy.data.meshes.new('Watertight 6 mm water cup');me.from_pydata(verts,[],faces);me.update()
    o=bpy.data.objects.new('GEO-water-hollow-cup',me);GEO.objects.link(o);objects.append(o);me.materials.append(pale)
    vol=(w-2*t)*(d-2*t)*(ztop-z0-t)
    cavities.append({'mesh':o.name,'inner_dimensions_m':[w-2*t,d-2*t,ztop-z0-t],'internal_volume_m3':vol})
    o['internal_volume_m3']=vol
    # Lid with actual open fill aperture, retained as a separate editable closure.
    head=box('water-service-lid',(0,0,.791),(w,d,.012),pale,.002)
    bpy.ops.mesh.primitive_cylinder_add(vertices=48,radius=.040,depth=.08,location=(0,0,.79));cut=bpy.context.object
    mod=head.modifiers.new('Fill penetration','BOOLEAN');mod.operation='DIFFERENCE';mod.object=cut;bpy.context.view_layer.objects.active=head;bpy.ops.object.modifier_apply(modifier=mod.name);bpy.data.objects.remove(cut,do_unlink=True)
    ring('water-fill-neck',.052,.040,.787,.875,steel)
    cap('water-fill-cap',(0,0,.885),.070,blue);socket('FLUID_IN',(0,0,.899))
    # Lower outlet genuinely opens through the front wall, followed by a closed service valve.
    bpy.ops.mesh.primitive_cylinder_add(vertices=32,radius=.016,depth=.10,location=(.225,-d/2,.25),rotation=(math.pi/2,0,0));cut=bpy.context.object
    mod=o.modifiers.new('Drain penetration','BOOLEAN');mod.operation='DIFFERENCE';mod.object=cut;bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=mod.name);bpy.data.objects.remove(cut,do_unlink=True)
    tube('water-drain-neck',(.225,-.250,.25),(.225,-.312,.25),.024,.008,steel)
    box('water-drain-valve',(.225,-.309,.25),(.064,.046,.060),dark)
    cyl('water-drain-cap',(.225,-.337,.25),.033,.024,blue,'Y');socket('FLUID_OUT',(.225,-.35,.25))
    gauge('water-level',.235,-.282,.545,.35,.055)
    box('water-marking-recess',(-.090,-.274,.51),(.205,.024,.30),dark)
    box('water-marking-panel',(-.090,-.290,.51),(.180,.012,.277),pale)
    symbol('water',(-.090,-.300,.51),.18,blue)
    for x in [-.30,.30]:
        box('water-roof-band',(x,0,.81),(.075,.56,.025),dark)
        for y in [-.278,.278]:box('water-vertical-band',(x,y,.48),(.070,.024,.64),dark)
    # Functional vent is a separate top boss with a lateral, downward-facing outlet.
    ring('water-vent-boss',.022,.010,.787,.835,steel,loc=(-.20,0,0))
    bpy.ops.mesh.primitive_cylinder_add(vertices=32,radius=.010,depth=.06,location=(-.20,0,.79));cut=bpy.context.object
    mod=head.modifiers.new('Vent penetration','BOOLEAN');mod.operation='DIFFERENCE';mod.object=cut;bpy.context.view_layer.objects.active=head;bpy.ops.object.modifier_apply(modifier=mod.name);bpy.data.objects.remove(cut,do_unlink=True)
    tube('water-vent-neck',(-.20,0,.80),(-.20,0,.859),.014,.004,steel)
    tube('water-vent-elbow',(-.20,0,.857),(-.20,-.05,.857),.014,.004,steel)
    socket('VENT',(-.20,-.05,.857))
    return .90

def camera_at(loc,target,scale):
    camera.location=loc;camera.rotation_euler=(Vector(target)-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.ortho_scale=scale

for job in JOBS:
    family=job['slug'];out=Path(job['output']);spec=job['specification']
    bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
    for m in list(bpy.data.materials):bpy.data.materials.remove(m)
    scene=bpy.context.scene;scene.unit_settings.system='METRIC';scene.unit_settings.scale_length=1
    root=bpy.data.collections.new(job['design_id']+' r001');scene.collection.children.link(root)
    GEO=bpy.data.collections.new('GEO');root.children.link(GEO);SOCKETS=bpy.data.collections.new('SOCKETS');root.children.link(SOCKETS)
    objects=[];cavities=[];closures=[]
    pale=material('Fluid | porcelain enamel',(.63,.68,.76),.08,.31)
    dark=material('Fluid | indigo structural coating',(.016,.026,.050),.38,.36)
    steel=material('Fluid | brushed titanium',(.28,.34,.40),.80,.29)
    seal=material('Fluid | elastomer',(.010,.013,.017),0,.70)
    blue=material('Fluid | cobalt enamel',(.016,.12,.40),.12,.31)
    cyan=material('Fluid | cyan instrument',(.018,.55,.86),0,.27,.9)
    red=material('Fluid | fuel burgundy',(.38,.018,.035),.12,.34)
    orange=material('Fluid | safety amber',(.95,.30,.010),.08,.36)
    yellow=material('Fluid | chemical yellow',(.91,.54,.012),.08,.36)
    fill=drum(family) if family in ['fuel','chemical'] else cryo() if family=='cryo' else gas() if family=='gas' else water()
    # Normals and manifold checks apply to every authored closed solid, not only export triangles.
    source=[]
    for o in objects:
        bm=bmesh.new();bm.from_mesh(o.data);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(o.data)
        source.append({'mesh':o.name,'nonmanifold_edges':sum(not e.is_manifold for e in bm.edges),'signed_material_volume_m3':bm.calc_volume(signed=True)})
        bm.free()
    bpy.context.view_layer.update();deps=bpy.context.evaluated_depsgraph_get();pts=[];bad=[];degenerate=[];triangles=0
    for o in objects:
        ev=o.evaluated_get(deps);me=ev.to_mesh();me.calc_loop_triangles();triangles+=len(me.loop_triangles)
        pts.extend(o.matrix_world@v.co for v in me.vertices)
        bm=bmesh.new();bm.from_mesh(me);count=sum(not e.is_manifold for e in bm.edges)
        if count:bad.append({'mesh':o.name,'edges':count})
        if any(f.calc_area()<1e-12 for f in bm.faces):degenerate.append(o.name)
        bm.free();ev.to_mesh_clear()
    lo=[min(p[i] for p in pts) for i in range(3)];hi=[max(p[i] for p in pts) for i in range(3)];dims=[hi[i]-lo[i] for i in range(3)]
    volume=sum(c['internal_volume_m3'] for c in cavities)
    spec['vessel_interiors']=cavities
    spec['usable_capacity']={'value':math.floor(volume*fill*1000),'unit':'L','status':'proposed','basis':'Authored internal 48-sided frustum integration or rectangular cup volume; excludes neck volume. Gas is water capacity at 100% geometric volume, liquid fill fractions reserve ullage.', 'fill_fraction':fill,'geometric_internal_volume_L':volume*1000}
    spec['dimensions_m']=dims;spec['handling']['minimum_hatch_clear_width_m']=math.ceil((dims[0]+.20)*20)/20;spec['handling']['minimum_hatch_clear_height_m']=math.ceil((dims[2]+.15)*20)/20
    spec['operating']['values']['fill_fraction']=fill
    spec['operating']['values']['pressure_rating_kPa']=None
    spec['handling']['support_basis']='Connected base rim or protective frame with vessel saddles. All exposed valves terminate in blind closures; no carrying handle or fork-pocket claim.'
    (out/'specification.json').write_text(json.dumps(spec,indent=2)+'\n')
    # Evaluated export copies keep native bevel/material detail and separate named semantic sockets.
    bpy.ops.object.select_all(action='DESELECT');copies=[]
    for o in objects:
        me=bpy.data.meshes.new_from_object(o.evaluated_get(deps));me.transform(o.matrix_world)
        copy=bpy.data.objects.new(o.name,me);scene.collection.objects.link(copy);copy.select_set(True);copies.append(copy)
    for o in SOCKETS.objects:o.select_set(True)
    bpy.context.view_layer.objects.active=copies[0]
    bpy.ops.export_scene.gltf(filepath=str(out/'glb.glb'),export_format='GLB',use_selection=True,export_apply=True,export_yup=True,export_materials='EXPORT',export_extras=True)
    for o in copies:bpy.data.objects.remove(o,do_unlink=True)
    used=sorted({o.active_material for o in objects},key=lambda m:m.name)
    materials=[{'name':m.name,'base_color':list(m.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value),'metallic':m.node_tree.nodes.get('Principled BSDF').inputs['Metallic'].default_value,'roughness':m.node_tree.nodes.get('Principled BSDF').inputs['Roughness'].default_value,'emission_strength':m.node_tree.nodes.get('Principled BSDF').inputs['Emission Strength'].default_value,'transmission':0} for m in used]
    (out/'materials.json').write_text(json.dumps(materials,indent=2)+'\n')
    valid={'schema':'sidereal.fluid-blender-validation.v1','blender':bpy.app.version_string,'finite':all(math.isfinite(v) for p in pts for v in p),'bounds_m':{'min':lo,'max':hi},'actual_dimensions_m':dims,'triangles':triangles,'editable_meshes':len(objects),'materials':len(materials),'nonmanifold_solids':bad,'degenerate_meshes':degenerate,'source_solids':source,'vessel_interiors':cavities,'source_skin_normals':'Recalculated per closed material shell; positive signed solid volumes checked. Internal normals point into the cavity.','capacity_litres':spec['usable_capacity']['value'],'sockets':[o.name for o in SOCKETS.objects],'publication':False}
    (out/'validation-blender.json').write_text(json.dumps(valid,indent=2)+'\n')
    if bad or degenerate or not valid['finite'] or any(s['nonmanifold_edges'] or s['signed_material_volume_m3']<=0 for s in source):raise ValueError('Mesh validation failed: '+family)
    scene.render.engine='CYCLES';scene.cycles.samples=40;scene.cycles.use_denoising=False
    scene.render.resolution_x=900;scene.render.resolution_y=900;scene.render.resolution_percentage=100
    scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA';scene.render.film_transparent=True
    scene.world.color=(.10,.12,.16);scene.view_settings.view_transform='AgX'
    bpy.ops.object.camera_add();camera=bpy.context.object;camera.name='REVIEW-camera';camera.data.type='ORTHO';scene.camera=camera
    w,d,h=dims;span=max(dims);target=(0,0,h*.50)
    camera_at((span*1.6,-span*2.4,span*1.8),target,span*1.45+.08)
    for name,loc,power,sz in [('key',(span*1.5,-span*2.2,span*3),400*span**2,span*2),('fill',(-span*2,-span*.9,span*1.4),220*span**2,span*2),('rim',(0,span*2,span*2.2),330*span**2,span*1.5),('underside',(-span,-span,-span),55*span**2,span*2)]:
        bpy.ops.object.light_add(type='AREA',location=loc);light=bpy.context.object;light.name='REVIEW-'+name;light.data.energy=power;light.data.shape='DISK';light.data.size=sz;light.rotation_euler=(Vector(target)-light.location).to_track_quat('-Z','Y').to_euler()
    scene['design_id']=job['design_id'];scene['revision']=1;scene['specification']=json.dumps(spec);scene['publication']='unsigned draft; primary reference only'
    bpy.ops.wm.save_as_mainfile(filepath=str(out/'blender-source.blend'))
    capture={'schema':'sidereal.fluid-render-evidence.v1','renderer':'Blender Cycles','blender_version':bpy.app.version_string,'resolution_px':[900,900],'samples':40,'denoising':False,'color_management':'AgX','publication':False,'views':{}}
    def render(name):
        scene.render.filepath=str(out/name);bpy.ops.render.render(write_still=True)
        capture['views'][name]={'camera_location_m':list(camera.location),'camera_euler_rad':list(camera.rotation_euler),'orthographic_scale_m':camera.data.ortho_scale,'transparent':scene.render.film_transparent}
    render('cutout.png');scene.render.film_transparent=False;render('blender-close.png')
    camera_at((0,-.001,span*4),(0,0,h*.4),max(w,d)*1.30+.08);render('blender-top.png')
    camera_at((span*1.6,-span*2.4,-span*1.6),(0,0,h*.35),span*1.55+.08);render('blender-underside.png')
    # Source inspection pose lifts the service closures and shields to show actual cavities.
    hidden=[]
    for o in objects:
        if any(k in o.name for k in ['service-lid','service-cap','sealed-fill-bung','drum-head','draw-off','water-fill-cap','cryo-open-fill','cryo-service','service-guard','insulation-outer','cryo-status','jacket-front','jacket-clip','manifold','valve','gauge','retention','neck-valve']):
            o.hide_render=True;hidden.append(o.name)
    camera_at((span*.9,-span*1.1,span*2.8),(0,0,h*.4),span*1.45+.10);render('blender-cavity-inspection.png')
    for name in hidden:bpy.data.objects[name].hide_render=False
    capture['cavity_inspection']='Explicit diagnostic hide list, not a normal opening mechanism; original source saved in closed pose.'
    capture['diagnostic_hidden_meshes']=hidden
    capture['hashes']={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in out.iterdir() if p.is_file()}
    (out/'capture-record.json').write_text(json.dumps(capture,indent=2)+'\n')
    print('FLUID_EXTENSION_COMPLETE',family,flush=True)

Path(sys.argv[sys.argv.index('--') + 1]).write_text(json.dumps(JOBS,indent=2)+'\n')
