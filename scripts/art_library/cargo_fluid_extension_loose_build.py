"""Native narrow/tiny case meshes with explicit closed, open and underside evidence."""
from pathlib import Path
import bpy,bmesh,json,sys,math,hashlib,shutil,zipfile
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2];manifest=Path(sys.argv[sys.argv.index('--')+1]);jobs=json.loads(manifest.read_text())
# Reuse reviewed primitive/material authoring helpers only; never execute fluid jobs.
helper=Path(__file__).with_name('cargo_fluid_extension_build.py')
exec(compile(helper.read_text().split('\nfor job in JOBS:\n')[0],str(helper),'exec'))

def cup_mesh(w,d,z0,top,t,mat):
    verts=[(x,y,z) for ww,dd,z in [(w,d,z0),(w,d,top),(w-2*t,d-2*t,top),(w-2*t,d-2*t,z0+t)] for x,y in [(-ww/2,-dd/2),(ww/2,-dd/2),(ww/2,dd/2),(-ww/2,dd/2)]]
    faces=[]
    for ring_i in range(3):
        for i in range(4):k=(i+1)%4;faces.append((ring_i*4+i,ring_i*4+k,(ring_i+1)*4+k,(ring_i+1)*4+i))
    faces +=[(3,2,1,0),(12,13,14,15)]
    me=bpy.data.meshes.new('Continuous hollow case wall');me.from_pydata(verts,[],faces);me.update()
    o=bpy.data.objects.new('GEO-continuous-hollow-case',me);GEO.objects.link(o);objects.append(o);me.materials.append(mat);return o

for job in jobs:
    out=Path(job['output']);tiny=job['kind']=='tiny';finish=job['finish']
    # Remove hidden review gauges too; selection-based deletion leaves them behind.
    for o in list(bpy.data.objects):bpy.data.objects.remove(o,do_unlink=True)
    for m in list(bpy.data.materials):bpy.data.materials.remove(m)
    scene=bpy.context.scene;scene.unit_settings.system='METRIC';scene.unit_settings.scale_length=1
    root=bpy.data.collections.new(job['design_id']);scene.collection.children.link(root)
    GEO=bpy.data.collections.new('GEO');SOCKETS=bpy.data.collections.new('SOCKETS');root.children.link(GEO);root.children.link(SOCKETS)
    objects=[];cavities=[];closures=[]
    pale=material('Loose | porcelain enamel',(.62,.68,.77),.08,.31)
    dark=material('Loose | indigo structure',(.014,.025,.052),.30,.38)
    steel=material('Loose | titanium hardware',(.27,.32,.40),.80,.30)
    seal=material('Loose | elastomer',(.009,.013,.018),0,.68)
    white=material('Loose | pale markings',(.84,.86,.83),0,.48)
    cyan=material('Loose | cyan indicator',(.014,.40,.76),0,.30,.65)
    colors={'blue':(.018,.085,.38),'red':(.38,.012,.030),'magenta':(.35,.018,.25)}
    accent=material('Loose | '+finish+' enamel',colors[finish],.08,.33)
    w,d=(.18,.18) if tiny else (.24,.22);bw,bd=(.164,.164) if tiny else (.216,.196)
    z0=.012;top=.148 if tiny else .362;t=.004 if tiny else .005;post=.018 if tiny else .020
    cx=w/2-post/2;cy=d/2-post/2
    cup=cup_mesh(bw,bd,z0,top,t,accent)
    for x in [-cx,cx]:
        for y in [-cy,cy]:
            box('corner-load-column',(x,y,(top+.012)/2),(post,post,top-.012),dark,.0025)
            for z in [.014,top-.012]:box('corner-enamel-shoe',(x,y,z),(post+.002,post+.002,.028),pale,.003)
    # Four corner shoes sit at the datum; two connected base cross rails support the cup.
    for y in [-cy,cy]:box('bottom-crossmember',(0,y,.012),(w-.008,post,.024),dark,.002)
    box('bottom-support-plate',(0,0,.011),(bw,bd,.010),dark,.001)
    # Recessed broad faces attach within the skin, wholly outside the reserved cavity.
    front=-bd/2-.004
    box('front-service-recess',(0,front,top*.54),(bw*.72,.008,top*.64),dark,.002)
    box('front-fitted-panel',(0,front-.006,top*.53),(bw*.58,.008,top*.48),accent,.002)
    for x in [-bw*.29,bw*.29]:box('front-pale-edge-rail',(x,front-.008,top*.54),(.012,.014,top*.65),pale,.002)
    if not tiny:
        box('tall-instrument-slot',(0,front-.012,top*.62),(.052,.010,.080),dark,.002)
        box('small-status-window',(0,front-.019,top*.68),(.026,.006,.020),cyan,.001)
        box('service-insert',(0,front-.019,top*.48),(.022,.006,.040),white,.001)
    else:
        box('tiny-id-inset',(0,front-.013,top*.56),(.040,.010,.033),dark,.001)
        box('tiny-id-marker',(0,front-.019,top*.56),(.021,.006,.023),cyan,.001)
    # Corner clearances are explicitly removed from the useful rectangular envelope.
    iw,id_,ih=(.140,.140,top-(z0+t)) if tiny else (.198,.176,top-(z0+t))
    for x in [-bw/2+t/2,bw/2-t/2]:box('rim-gasket',(x,0,top),(.004,bd,.004),seal,.0005)
    for y in [-bd/2+t/2,bd/2-t/2]:box('rim-gasket',(0,y,top),(bw,.004,.004),seal,.0005)
    hinge_y=bd/2+.019;hinge_z=top+.004
    for x in [-bw*.31,bw*.31]:
        # Static ears sit at the ends of the pin, clear of the central moving
        # leaf. Their tops stay below the lid sweep and their backs seat in skin.
        for end in [-1,1]:box('fixed-hinge-support',(x+end*.024,hinge_y-.005,top-.014),(.010,.030,.0264),steel,.001)
        cyl('fixed-hinge-pin',(x,hinge_y,hinge_z),.006 if tiny else .008,.062,steel,'X',24)
    start=len(objects)
    lid=box('hinged-lid',(0,0,top+.010),(w-.010,d-.010,.016),pale,.003)
    box('lid-inset',(0,0,top+.020),(w*.55,d*.58,.006),accent,.002)
    for x in [-bw*.31,bw*.31]:box('lid-hinge-leaf',(x,bd/2+.008,top+.008),(.025,.038,.010),steel,.002)
    # Lid-mounted spring catch is shown released/retracted. It stays above the
    # rim; the fixed keeper below is a recess, not an intersecting rigid tongue.
    box('lid-released-spring-latch',(0,-bd/2-.009,top+.010),(.026 if tiny else .039,.016,.016),steel,.002)
    if not tiny:
        for x in [-.097,.097]:box('fixed-grip-leg',(x,0,(top+.018+.434)/2),(.014,.020,.434-(top+.018)+.004),dark,.002)
        cyl('fixed-glove-grip',(0,0,.434),.008,.210,steel,'X',32)
        socket('HAND',(0,0,.434))
    else:
        for x in [-.045,.045]:box('lid-pinch-tab',(x,-bd/2-.007,top+.014),(.028,.019,.010),accent,.002)
    pivot=bpy.data.objects.new('PIVOT_LID',None);SOCKETS.objects.link(pivot);pivot.location=(0,hinge_y,hinge_z)
    pivot['open_angle_rad']=-math.radians(110);pivot['status']='Source review opening pose only; no runtime interaction controller'
    bpy.context.view_layer.update()
    for o in objects[start:]:mw=o.matrix_world.copy();o.parent=pivot;o.matrix_world=mw
    keeper_width=.026 if tiny else .038
    for x in [-keeper_width/2,keeper_width/2]:box('stationary-keeper-recess-frame',(x,-bd/2-.001,top-.009),(.004,.005,.014),dark,.0005)
    for z in [top-.015,top-.003]:box('stationary-keeper-recess-frame',(0,-bd/2-.001,z),(keeper_width,.005,.003),dark,.0005)
    if tiny:
        box('lanyard-root',(bw/2+.003,0,.118),(.012,.016,.019),steel,.001)
        ring('lanyard-eye',.006,.003,-.005,.005,steel,loc=(.095,0,.118),axis='Y')
        socket('LANYARD',(.095,0,.118))
    for k,(x,y) in enumerate([(-cx,-cy),(cx,-cy),(-cx,cy),(cx,cy)]):socket('RESTRAINT_'+str(k),(x,y,.009))
    # Explicit source proxy is a useful interior gauge, not a collision/damage representation.
    gauge_obj=box('useful-cavity-gauge',(0,0,z0+t+ih/2),(iw,id_,ih),cyan,0)
    objects.remove(gauge_obj);gauge_obj.hide_render=True;gauge_obj.hide_set(True);gauge_obj['representation']='Reserved unobstructed packing envelope, corners excluded; not exported'
    bpy.context.view_layer.update();deps=bpy.context.evaluated_depsgraph_get();points=[];triangles=0;bad=[];source=[]
    for o in objects:
        bm=bmesh.new();bm.from_mesh(o.data);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(o.data)
        source.append({'mesh':o.name,'nonmanifold_edges':sum(not e.is_manifold for e in bm.edges),'signed_material_volume_m3':bm.calc_volume(signed=True)});bm.free()
        ev=o.evaluated_get(deps);me=ev.to_mesh();me.calc_loop_triangles();triangles+=len(me.loop_triangles);points.extend(o.matrix_world@v.co for v in me.vertices)
        bm=bmesh.new();bm.from_mesh(me);count=sum(not e.is_manifold for e in bm.edges)
        if count:bad.append({'mesh':o.name,'edges':count})
        bm.free();ev.to_mesh_clear()
    lo=[min(p[i] for p in points) for i in range(3)];hi=[max(p[i] for p in points) for i in range(3)];dims=[hi[i]-lo[i] for i in range(3)]
    assert not bad and all(s['signed_material_volume_m3']>0 and not s['nonmanifold_edges'] for s in source)
    assert all(math.isfinite(c) for p in points for c in p)
    mass=.32 if tiny else 1.8;payload=1 if tiny else 8
    spec={'schema':'sidereal.cargo-design-proposal.v1','design_id':job['design_id'],'revision':1,'family':'standard','size':job['kind'],'appearance':finish,'reference_ids':job['reference_ids'],'dimensions_m':dims,'axes':'Blender X width/Y depth/Z up; bottom datum; GLB Y up/-Z forward','size_basis':'Proposed dimensions; exact source miniatures do not establish physical scale. Width includes hinge/lanyard hardware.','skin_thickness_m':t,'interior_clear_dimensions_m':[iw,id_,ih],'usable_capacity':{'value':math.floor(iw*id_*ih*1000),'unit':'L','status':'proposed','basis':'Authored conservative clear rectangular envelope excludes wall, corner columns, bottom and lid.'},'empty_mass':{'value':mass,'unit':'kg','status':'proposed'},'payload_limit':{'value':payload,'unit':'kg','status':'proposed'},'max_gross_mass':{'value':mass+payload,'unit':'kg','status':'proposed'},'handling':{'mode':'Pinch tabs, cradle in palm, lanyard or tray; no full gloved-hand handle claim.' if tiny else 'Single top grip for modest gross mass; measured opening, ergonomic/loaded handling unvalidated.','grip_clear_width_m':None if tiny else .18,'grip_clear_depth_m':None if tiny else .041,'grip_bar_diameter_m':None if tiny else .016,'lanyard_eye_clear_diameter_m':.006 if tiny else None,'opening':'Rear hinge, -110 degrees source review pose; runtime controller absent','stack_count_target':1,'minimum_hatch_clear_width_m':round(dims[0]+.12,3),'minimum_hatch_clear_height_m':round(dims[2]+.12,3)},'operating':{'status':'proposed','values':{'environment':'Dry indoor storage; no pressure, waterproof, thermal or security rating'}},'unresolved':['All dimensions, capacity and masses are unapproved proposals.','Unseen rear/underside inferred; source close/open/underside evidence is an authored reconstruction.','No runtime interaction, inventory, damage, carrier or authority implementation.','Independent review, runtime captures and owner approval pending.'],'publication':False}
    (out/'specification.json').write_text(json.dumps(spec,indent=2)+'\n');job['specification']=spec
    spec['handling']['latch_review_state']='Spring catch retracted/released; source opening review does not demonstrate a closed lock engagement or runtime latch controller.'
    (out/'specification.json').write_text(json.dumps(spec,indent=2)+'\n')
    bpy.ops.object.select_all(action='DESELECT');copies=[]
    for o in objects:
        me=bpy.data.meshes.new_from_object(o.evaluated_get(deps));me.transform(o.matrix_world);copy=bpy.data.objects.new(o.name,me);scene.collection.objects.link(copy);copy.select_set(True);copies.append(copy)
    for o in SOCKETS.objects:
        if o.name.startswith('SOCK_'):o.select_set(True)
    bpy.context.view_layer.objects.active=copies[0];bpy.ops.export_scene.gltf(filepath=str(out/'glb.glb'),export_format='GLB',use_selection=True,export_yup=True,export_apply=True,export_materials='EXPORT',export_extras=True)
    for o in copies:bpy.data.objects.remove(o,do_unlink=True)
    mats=[{'name':m.name,'base_color':list(m.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value),'metallic':m.node_tree.nodes.get('Principled BSDF').inputs['Metallic'].default_value,'roughness':m.node_tree.nodes.get('Principled BSDF').inputs['Roughness'].default_value} for m in sorted({o.active_material for o in objects},key=lambda m:m.name)]
    (out/'materials.json').write_text(json.dumps(mats,indent=2)+'\n')
    (out/'preset.json').write_text(json.dumps({'canonical_geometry':job['design_id'],'appearance':finish,'materials':mats,'reference_ids':job['reference_ids'],'geometry_shared_with':'narrow-blue' if finish=='red' else None},indent=2)+'\n')
    meta=json.loads((ROOT/'assets/art-library/assets'/job['reference_ids'][0]/'reference.json').read_text());ref=ROOT/'assets/art-library'/meta['crop_path'];shutil.copyfile(ref,out/'reference.png')
    validation={'finite':True,'nonmanifold_solids':bad,'source_solids':source,'triangles':triangles,'editable_meshes':len(objects),'materials':len(mats),'bounds_m':{'min':lo,'max':hi},'actual_dimensions_m':dims,'capacity_litres':spec['usable_capacity']['value'],'lid_pivot':{'location_m':list(pivot.location),'open_angle_deg':-110,'children':len(pivot.children)},'source_reference_sha256':hashlib.sha256(ref.read_bytes()).hexdigest(),'publication':False}
    (out/'validation-blender.json').write_text(json.dumps(validation,indent=2)+'\n')
    scene.render.engine='CYCLES';scene.cycles.samples=32;scene.cycles.use_denoising=False
    scene.render.resolution_x=800;scene.render.resolution_y=800;scene.render.resolution_percentage=100;scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA';scene.render.film_transparent=True;scene.world.color=(.10,.12,.16);scene.view_settings.view_transform='AgX'
    bpy.ops.object.camera_add();camera=bpy.context.object;camera.name='REVIEW-camera';camera.data.type='ORTHO';scene.camera=camera
    span=max(dims);target=(0,0,hi[2]*.49);camera_at((span*1.6,-span*2.4,span*1.8),target,span*1.5+.025)
    for name,loc,power,sz in [('key',(span*1.5,-span*2.2,span*3),400*span**2,span*2),('fill',(-span*2,-span*.9,span*1.4),220*span**2,span*2),('rim',(0,span*2,span*2.2),330*span**2,span*1.5),('underside',(-span,-span,-span),55*span**2,span*2)]:
        bpy.ops.object.light_add(type='AREA',location=loc);light=bpy.context.object;light.name='REVIEW-'+name;light.data.energy=power;light.data.shape='DISK';light.data.size=sz;light.rotation_euler=(Vector(target)-light.location).to_track_quat('-Z','Y').to_euler()
    scene['design_id']=job['design_id'];scene['specification']=json.dumps(spec);scene['publication']='Unsigned draft'
    bpy.ops.wm.save_as_mainfile(filepath=str(out/'blender-source.blend'))
    captures={}
    def render(name):
        scene.render.filepath=str(out/name);bpy.ops.render.render(write_still=True);captures[name]={'camera_location_m':list(camera.location),'camera_euler_rad':list(camera.rotation_euler),'ortho_scale_m':camera.data.ortho_scale,'transparent':scene.render.film_transparent,'lid_angle_rad':pivot.rotation_euler.x}
    render('cutout.png');scene.render.film_transparent=False;render('blender-close.png')
    camera_at((0,-.001,span*4),(0,0,top*.5),max(dims[:2])*1.32+.02);render('blender-top.png')
    camera_at((span*1.6,-span*2.4,-span*1.6),(0,0,top*.4),span*1.55+.025);render('blender-underside.png')
    pivot.rotation_euler.x=-math.radians(110);bpy.context.view_layer.update()
    open_points=[];deps=bpy.context.evaluated_depsgraph_get()
    for o in objects:
        ev=o.evaluated_get(deps);me=ev.to_mesh();open_points.extend(o.matrix_world@v.co for v in me.vertices);ev.to_mesh_clear()
    open_lo=Vector([min(p[i] for p in open_points) for i in range(3)]);open_hi=Vector([max(p[i] for p in open_points) for i in range(3)])
    open_centre=(open_lo+open_hi)/2;open_span=max(open_hi-open_lo)
    camera_at(open_centre+Vector((open_span*1.2,-open_span*2,open_span*2.5)),open_centre,open_span*1.75+.04);render('blender-open.png')
    capture={'renderer':'Blender Cycles','samples':32,'denoising':False,'color_management':'AgX','resolution_px':[800,800],'views':captures,'hashes':{p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in out.iterdir() if p.is_file()},'publication':False}
    (out/'capture-record.json').write_text(json.dumps(capture,indent=2)+'\n')
    (out/'review.md').write_text('Native '+job['kind']+' case targets '+job['reference_ids'][0]+'. Source and exact crop preserved. Color/material preset is explicit; narrow blue/red share geometry. Capacity is the conservative rectangular packing envelope excluding corner columns. Tiny uses pinch/lanyard handling, never a claimed full gloved-hand handle. Hinge/lid/handle/tongue share source hierarchy; GLB is the closed static visual. Real open/underside evidence is source review, not implemented runtime interaction. Independent visual/physical review, runtime evidence and owner approval pending.\n')
    with zipfile.ZipFile(out/'recipe.zip','w',zipfile.ZIP_DEFLATED) as z:
        for source in [Path(__file__),Path(__file__).with_name('cargo_fluid_extension_loose_run.py'),helper]:z.write(source,source.name)
        z.write(out/'specification.json','specification.json');z.write(out/'preset.json','preset.json')
    print('LOOSE_CASE_COMPLETE',job['slug'],flush=True)
manifest.write_text(json.dumps(jobs,indent=2)+'\n')
