"""Editable native ladder/guard/shaft companion. Blender Python, no voxel mesh."""
import bpy, json, math, hashlib, sys, gzip
from pathlib import Path
from mathutils import Vector, Matrix

OUT = Path(sys.argv[sys.argv.index('--') + 1]); OUT.mkdir(parents=True, exist_ok=False)
ROOT = Path.cwd()
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
scene=bpy.context.scene; scene.unit_settings.system='METRIC'; scene.unit_settings.scale_length=1
scene.render.engine='CYCLES'; scene.cycles.samples=32; scene.cycles.use_denoising=False
scene.render.resolution_x=1200; scene.render.resolution_y=1000; scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG'; scene.render.image_settings.color_mode='RGBA'; scene.render.film_transparent=True
scene.world.color=(.13,.13,.13)
scene.view_settings.view_transform='AgX'
auth=bpy.data.collections.new('AUTHORING-NATIVE-MESHES'); scene.collection.children.link(auth)
exports=bpy.data.collections.new('GEO'); scene.collection.children.link(exports)
sockets=bpy.data.collections.new('SOCKETS'); scene.collection.children.link(sockets)
context=bpy.data.collections.new('REVIEW-EXISTING-PANELS'); scene.collection.children.link(context)
collision=bpy.data.collections.new('COLLISION-PROXIES-NOT-VISUAL'); scene.collection.children.link(collision)

def material(name, color, metal=0, rough=.36):
    m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough
    return m
mats={
'enamel':material('MAT-pale-enamel',(.68,.73,.76),.12,.34),
'frame':material('MAT-indigo-frame',(.065,.09,.14),.5,.4),
'steel':material('MAT-rung-steel',(.3,.37,.41),.8,.3),
'grip':material('MAT-traction-rubber',(.035,.045,.055),0,.72),
'hazard':material('MAT-amber-access',(.9,.38,.055),.05,.42),
'service':material('MAT-burgundy-service',(.32,.045,.07),.1,.42),
}
objects=[]
def move_collection(o,col):
    for c in list(o.users_collection):c.objects.unlink(o)
    col.objects.link(o)
def box(group,name,center,size,mat,bevel=.008):
    bpy.ops.mesh.primitive_cube_add(size=1,location=center);o=bpy.context.object;o.name='GEO-'+group+'--'+name
    o.dimensions=size;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    o.data.materials.append(mats[mat]);move_collection(o,auth)
    if bevel:
        b=o.modifiers.new('Authored soft enamel edges','BEVEL');b.width=bevel;b.segments=3;b.affect='EDGES'
        b=o.modifiers.new('Weighted flat faces','WEIGHTED_NORMAL');b.keep_sharp=True
    o['native_group']=group;objects.append(o);return o
# Native ladder: two independently editable deep rails with pale caps; rung
# fronts stay atY2.90, outside the certified body corridor endingY2.85.
for side,x in [('left',2.5),('right',3.5)]:
    box('traversal-ladder',side+'-stile',(x,2.985,2.30625),(.09,.17,4.2375),'frame',.012)
    for k,(z,h) in enumerate([(1.125,1.775),(2.95,1.825),(4.125,.55)]):
        box('traversal-ladder',side+'-enamel-'+str(k),(x,2.896,z),(.075,.026,h),'enamel',.007)
    box('traversal-ladder',side+'-foot',(x,2.985,.2375),(.22,.30,.10),'frame',.012)
    box('traversal-ladder',side+'-mount',(2.25 if side=='left' else 3.75,3.03,3.30),(.54,.16,.16),'frame',.012)
    box('traversal-ladder',side+'-service',(x,2.879,2.67),(.069,.016,.16),'service',.004)
    box('traversal-ladder',side+'-handgrip',(x,2.865,3.94),(.10,.10,.45),'grip',.022)
for i in range(1,12):
    z=.1875+i*.28125
    box('traversal-ladder',f'rung-{i:02}',(3,2.96,z),(.96,.12,.065),'steel',.01)
    box('traversal-ladder',f'traction-{i:02}',(3,2.96,z+.033),(.70,.095,.006),'grip',.0015)
    for side,x in [('left',2.62),('right',3.38)]:
        box('traversal-ladder',f'rung-{i:02}-{side}-mark',(x,2.96,z+.033),(.07,.095,.007),'hazard',.002)
# Guard perimeter is outside the2m free shaft square. South opening clear1.10m.
for i,(x,y) in enumerate([(1.94,1.94),(1.94,3.0),(1.94,4.06),(4.06,1.94),(4.06,3.0),(4.06,4.06),(2.40,1.94),(3.60,1.94)]):
    box('traversal-guard',f'post-{i}',(x,y,3.90),(.09,.09,1.05),'frame',.01)
    box('traversal-guard',f'foot-{i}',(x,y,3.415),(.16,.16,.08),'enamel',.012)
for h in [3.86,4.40]:
    for side,x in [('left',1.94),('right',4.06)]:
        box('traversal-guard',f'{side}-rail-{h}',(x,3,h),(.09,2.20,.10),'enamel',.025)
    box('traversal-guard',f'back-rail-{h}',(3,4.06,h),(2.20,.09,.10),'enamel',.025)
    for side,x in [('left',2.17),('right',3.83)]:
        box('traversal-guard',f'{side}-entry-rail-{h}',(x,1.94,h),(.55,.09,.10),'hazard',.022)
for side,x in [('left',1.94),('right',4.06)]:
    box('traversal-guard',side+'-toe-plate',(x,3,3.47),(.065,2.12,.19),'frame',.008)
box('traversal-guard','back-toe-plate',(3,4.06,3.47),(2.12,.065,.19),'frame',.008)
# Fascia faces end exactly at aperture boundary. Deliberate contact within the
# adjacent native panels avoids reducing or faking the2m slab opening.
for side,x in [('left',1.975),('right',4.025)]:
    box('traversal-aperture-edge',side,(x,3,3.1875),(.05,2,.375),'frame',0)
for side,y in [('front',1.975),('back',4.025)]:
    box('traversal-aperture-edge',side,(3,y,3.1875),(2.1,.05,.375),'frame',0)
# No plate crosses the upper dismount corridor and no hatch is claimed.
for side,x in [('left',2.2),('right',3.8)]:
    box('traversal-aperture-edge',side+'-amber-cap',(x,1.94,3.385),(.35,.10,.018),'hazard',.003)

path=[[3,1.25,.1875],[3,2.5,.1875],[3,2.5,3.375],[3,1.25,3.375]]
boxes=[{'min':[2.65,.9,.1875],'max':[3.35,2.85,1.9875]}, {'min':[2.65,2.15,.1875],'max':[3.35,2.85,5.175]}, {'min':[2.65,.9,3.375],'max':[3.35,2.85,5.175]}]
for i,p in enumerate(path):
    o=bpy.data.objects.new('SOCK-TRAVERSAL-PATH-'+str(i),None);sockets.objects.link(o);o.location=p;o.empty_display_size=.08
# Evaluated mesh capture retains every bevel/material and lets runtime select
# three semantic groups without proliferating one draw unit per fastener.
def bounds(o):
    dg=bpy.context.evaluated_depsgraph_get();e=o.evaluated_get(dg);vs=[e.matrix_world@v.co for v in e.data.vertices]
    return {'min':[min(v[i] for v in vs) for i in range(3)],'max':[max(v[i] for v in vs) for i in range(3)]}
source_bounds=[{'name':o.name,'group':o['native_group'],'boundsM':bounds(o)} for o in objects]
for group in sorted({o['native_group'] for o in objects}):
    copies=[]
    for o in objects:
        if o['native_group']!=group:continue
        mesh=bpy.data.meshes.new_from_object(o.evaluated_get(bpy.context.evaluated_depsgraph_get()))
        c=bpy.data.objects.new(o.name+'--export',mesh);exports.objects.link(c);c.matrix_world=o.matrix_world;copies.append(c)
    bpy.ops.object.select_all(action='DESELECT')
    for o in copies:o.select_set(True)
    bpy.context.view_layer.objects.active=copies[0];bpy.ops.object.join();o=bpy.context.object;o.name='GEO-'+group+'--surface'
    bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
for o in objects:o.hide_render=True;o.hide_set(True)
# Context is copied from the exact unchanged existing native square panels.
context_pins={
'floor':{'path':'assets/runtime/assembly/floor/r002/kit.glb','prefix':'GEO-part-'},
'roof':{'path':'assets/art-library/designs/shipyard.structure.roof-kit/revisions/r001/kit.glb','prefix':'GEO-roof-square-2m--surface'},
}
# Match the canonical square selector directly from current floor interfaces.
floor_interfaces=json.loads((ROOT/'packages/content/src/construction-floor-interfaces.json').read_text())
context_pins['floor']['prefix']=next(p['native']['nodePrefix'] for p in floor_interfaces['parts'] if p['id']=='square-2m')
context_objects=[]
for kind,pin in context_pins.items():
    pin['sha256']=hashlib.sha256((ROOT/pin['path']).read_bytes()).hexdigest()
    before=set(bpy.data.objects);bpy.ops.import_scene.gltf(filepath=str(ROOT/pin['path']));added=set(bpy.data.objects)-before
    selected=[o for o in added if o.type=='MESH' and (o.name==pin['prefix'] or o.name.startswith(pin['prefix']+'_') or o.name.startswith(pin['prefix']+'.'))]
    assert selected,(kind,pin['prefix'])
    for deck,z in ([('lower-floor',0),('upper-floor',3.1875)] if kind=='floor' else [('lower-roof',3)]):
        for x in range(0,6,2):
            for y in range(0,6,2):
                if deck!='lower-floor' and x==2 and y==2:continue
                for original in selected:
                    o=original.copy();o.data=original.data;context.objects.link(o);o.parent=None;o.matrix_world=Matrix.Translation((x,y,z))@original.matrix_world;o.name=f'REVIEW-{deck}-{x}-{y}--'+original.name;context_objects.append(o)
    for o in added:bpy.data.objects.remove(o,do_unlink=True)
# Separate numeric proxies; they are never exported as visual geometry.
all_bounds=source_bounds+[{'name':o.name,'group':'existing-panel','boundsM':bounds(o)} for o in context_objects]
def overlap(a,b):return all(min(a['max'][i],b['max'][i])-max(a['min'][i],b['min'][i])>1e-6 for i in range(3))
checks=[]
for i,b in enumerate(boxes):
    hits=[p['name'] for p in all_bounds if overlap(b,p['boundsM'])]
    checks.append({'name':f'Actual native solids clear segment body envelope{i}','pass':not hits,'hits':hits})
for role,z0,z1 in [('lower-roof',3,3.1875),('upper-floor',3.1875,3.375)]:
    b={'min':[2,2,z0],'max':[4,4,z1]}
    # Ladder lives in the opening; certify panel/edge omission independently.
    hits=[p['name'] for p in all_bounds if p['group'] in ['existing-panel','traversal-aperture-edge'] and overlap(b,p['boundsM'])]
    checks.append({'name':f'Actual {role} has genuine2m panel/edge aperture','pass':not hits,'hits':hits})
for p in source_bounds:
    o=bpy.data.objects.new('COLLISION-'+p['name'],None);collision.objects.link(o);o['bounds_json']=json.dumps(p['boundsM']);o.hide_render=True
collision.hide_render=True;collision.hide_viewport=True
bpy.ops.object.select_all(action='DESELECT')
for o in exports.objects:o.select_set(True)
for o in sockets.objects:o.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(OUT/'kit.glb'),export_format='GLB',use_selection=True,export_apply=True,export_yup=True,export_cameras=False,export_lights=False,export_extras=True)
glbsha=hashlib.sha256((OUT/'kit.glb').read_bytes()).hexdigest()
# Independent unbatched authored triangles for exact GLB comparison. Keep the
# original editable object surfaces rather than exporting this proof as visuals.
triangle_groups={}
for original in objects:
    e=original.evaluated_get(bpy.context.evaluated_depsgraph_get());m=e.to_mesh();m.calc_loop_triangles()
    group=original['native_group'];triangles=triangle_groups.setdefault(group,[])
    for tri in m.loop_triangles:
        triangles.append([[float(v) for v in e.matrix_world@m.vertices[i].co] for i in tri.vertices])
    e.to_mesh_clear()
(OUT/'authored-triangles.json.gz').write_bytes(gzip.compress(json.dumps(triangle_groups,separators=(',',':')).encode(),mtime=0))
(OUT/'author.py').write_bytes(Path(__file__).read_bytes())

report={'schema':'sidereal.native-traversal-measurement.v1','status':'staged','glbSha256':glbsha,'pathM':path,'corridorFreeBoundsM':boxes,'nativeSolidBounds':all_bounds,'contextSources':context_pins,'checks':checks,'pass':all(c['pass'] for c in checks),'limitations':['No load/pressure/damage rating','No owner art approval or runtime publication','Axis-aligned conservative evaluated native AABBs certify the declared free segment volumes; no animation fit claim']}
(OUT/'native-measurements.json').write_text(json.dumps(report,indent=2)+'\n')
# Actual neutral rendered evidence; context is excluded from GLB publication.
def light(name,loc,power,size):
    d=bpy.data.lights.new(name,'AREA');d.energy=power;d.shape='DISK';d.size=size;o=bpy.data.objects.new(name,d);scene.collection.objects.link(o);o.location=loc;o.rotation_euler=(Vector((3,2.5,2))-o.location).to_track_quat('-Z','Y').to_euler()
light('REVIEW-key',(0,-3,9),1800,7);light('REVIEW-fill',(8,1,6),1000,5);light('REVIEW-rim',(3,8,8),1300,5)
c=bpy.data.cameras.new('REVIEW-camera');cam=bpy.data.objects.new('REVIEW-camera',c);scene.collection.objects.link(cam);scene.camera=cam;c.type='ORTHO';c.ortho_scale=7.2
captures=[]
def capture(name,pos,target,scale,show_context):
    for o in context_objects:o.hide_render=not show_context
    cam.location=pos;cam.rotation_euler=(Vector(target)-cam.location).to_track_quat('-Z','Y').to_euler();c.ortho_scale=scale
    scene.render.filepath=str(OUT/(name+'.png'));bpy.ops.render.render(write_still=True)
    captures.append({'file':name+'.png','cameraPosition':list(pos),'target':list(target),'orthographicScale':scale,'contextPanels':show_context})
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'blender-source.blend'))
capture('cutout',(8,-6,6.3),(3,2.9,2.3),5.8,False)
capture('blender-context',(10,-10,10),(3,2.5,2.1),9.6,True)
capture('blender-top',(3,3,12),(3,3,0),6.8,True)
(OUT/'capture.json').write_text(json.dumps({'blenderVersion':bpy.app.version_string,'renderer':'Cycles CPU','samples':32,'assetSha256':glbsha,'captures':captures},indent=2)+'\n')
print(json.dumps({'output':str(OUT),'checksPass':report['pass'],'checks':checks,'glbSha256':glbsha}))
