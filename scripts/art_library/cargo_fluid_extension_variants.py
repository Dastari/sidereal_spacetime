"""Explicit source finish presets, retaining editable native Blender per appearance."""
from pathlib import Path
import bpy,bmesh,json,sys,math,hashlib,shutil
from mathutils import Vector

manifest=Path(sys.argv[sys.argv.index('--')+1]);jobs=json.loads(manifest.read_text())
ROOT=Path(__file__).resolve().parents[2]
COLORS={
 'cryo':[(.015,.17,.53),(.24,.028,.56),(.025,.32,.17),(.03,.42,.09)],
 'fuel':[(.44,.018,.028),(.022,.15,.48),(.85,.39,.01),(.045,.06,.09)],
 'chemical':[(.91,.54,.012),(.47,.025,.043),(.023,.18,.58),(.055,.38,.10)],
 'gas':[(.48,.021,.041),(.021,.17,.51),(.035,.36,.12),(.92,.54,.015)],
 'water':[(.45,.51,.62),(.025,.15,.53),(.09,.35,.15),(.27,.042,.51)]}
NAMES={'cryo':['cobalt','violet','teal','green'],'fuel':['red','blue','hazard-amber','dark-ribbed'],'chemical':['yellow','red','blue','green'],'gas':['red','blue','green','yellow'],'water':['pale','blue','green','violet']}

def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def pose(camera,loc,target,scale):camera.location=loc;camera.rotation_euler=(Vector(target)-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.ortho_scale=scale

for j in jobs:
    base=Path(j['base']);out=Path(j['output']);family=j['family'];num=j['number']
    bpy.ops.wm.open_mainfile(filepath=str(base/'blender-source.blend'))
    scene=bpy.context.scene;camera=scene.camera
    col=COLORS[family][num-1];changed=[]
    for m in bpy.data.materials:
        role=m.name.split(' | ')[-1];p=m.node_tree.nodes.get('Principled BSDF') if m.use_nodes else None
        if not p:continue
        should=(family=='cryo' and role=='cobalt enamel') or (family=='fuel' and role=='fuel burgundy') or (family=='chemical' and role=='chemical yellow') or (family=='gas' and role=='porcelain enamel') or (family=='water' and role=='cobalt enamel')
        if should:
            before=list(p.inputs['Base Color'].default_value);p.inputs['Base Color'].default_value=(*col,1)
            changed.append({'material':m.name,'before':before,'after':list(p.inputs['Base Color'].default_value)})
        if family=='cryo' and role=='cyan instrument':
            p.inputs['Base Color'].default_value=(*col,1);p.inputs['Emission Color'].default_value=(*col,1)
        if family=='water' and num in [3,4] and role=='porcelain enamel':
            tinted=tuple(min(.68,c*.6+.29) for c in col);p.inputs['Base Color'].default_value=(*tinted,1)
    geometry_note='Shared primary vessel/frame geometry; exact named finish material preset.'
    if family=='fuel' and num==4:
        # The source dark alternative has extra horizontal stiffener rings.
        target=bpy.data.objects.get('GEO-reinforced-roll-rim.001') or bpy.data.objects['GEO-reinforced-roll-rim']
        for z in [.30,.51]:
            o=target.copy();o.data=target.data.copy();target.users_collection[0].objects.link(o);o.name='GEO-variant-dark-extra-stiffener'
            # Primary rings are authored directly in world-space Z; translate from their mesh centre.
            centre=sum(v.co.z for v in o.data.vertices)/len(o.data.vertices);o.location.z=z-centre
        # Keep the warning legible on its supported shell panel between ribs.
        # Scale the complete raised marking together about its original centre,
        # then move it into the 172 mm clear span between the added rings.
        for o in bpy.data.objects:
            if o.type=='MESH' and any(k in o.name for k in ['hazard-label-backing','hazard-triangle','hazard-exclamation','hazard-dot']):
                o.location.x *= .60
                o.location.z = .405 + (o.location.z-.43)*.60
                o.scale.x *= .60; o.scale.z *= .60
        geometry_note='Dark fuel variant adds two attached circumferential stiffener rings. Warning panel and raised symbol are reduced together and seated on the shell in the clear span between rings; same hollow capacity and closure.'
    objects=[o for o in bpy.data.objects if o.type=='MESH' and o.name.startswith('GEO-')]
    bpy.context.view_layer.update();deps=bpy.context.evaluated_depsgraph_get();pts=[];triangles=0;bad=[];volumes=[]
    for o in objects:
        bm=bmesh.new();bm.from_mesh(o.data);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(o.data);volumes.append({'mesh':o.name,'signed_material_volume_m3':bm.calc_volume(signed=True)});bm.free()
        ev=o.evaluated_get(deps);me=ev.to_mesh();me.calc_loop_triangles();triangles+=len(me.loop_triangles);pts.extend(o.matrix_world@v.co for v in me.vertices)
        bm=bmesh.new();bm.from_mesh(me);count=sum(not e.is_manifold for e in bm.edges)
        if count:bad.append({'mesh':o.name,'nonmanifold_edges':count})
        bm.free();ev.to_mesh_clear()
    lo=[min(p[i] for p in pts) for i in range(3)];hi=[max(p[i] for p in pts) for i in range(3)];dims=[hi[i]-lo[i] for i in range(3)]
    if bad or any(v['signed_material_volume_m3']<=0 for v in volumes) or not all(math.isfinite(c) for p in pts for c in p):raise ValueError('Variant invalid '+j['id'])
    mats=[{'name':m.name,'base_color':list(m.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value),'metallic':m.node_tree.nodes.get('Principled BSDF').inputs['Metallic'].default_value,'roughness':m.node_tree.nodes.get('Principled BSDF').inputs['Roughness'].default_value} for m in sorted({o.active_material for o in objects},key=lambda m:m.name)]
    refmeta=json.loads((ROOT/'assets/art-library/assets'/j['reference_ids'][0]/'reference.json').read_text());ref=ROOT/'assets/art-library'/refmeta['crop_path'];shutil.copyfile(ref,out/'reference.png')
    preset={'schema':'sidereal.fluid-appearance-preset.v1','id':j['id'],'canonical_design':j['design_id'],'appearance':NAMES[family][num-1],'reference_ids':j['reference_ids'],'reference_crop_sha256':sha(ref),'base_blend_sha256':sha(base/'blender-source.blend'),'base_materials_sha256':sha(base/'materials.json'),'changed_materials':changed,'materials':mats,'geometry_note':geometry_note,'proposed_size':True,'publication':False}
    spec=json.loads((base/'specification.json').read_text());spec['reference_ids']=j['reference_ids'];spec['appearance_id']=j['id'];spec['appearance_geometry_note']=geometry_note
    spec['unresolved']=[s for s in spec['unresolved'] if 'Four source color/detail' not in s]+['Exact finish variant needs independent visual and runtime review.']
    (out/'specification.json').write_text(json.dumps(spec,indent=2)+'\n');(out/'preset.json').write_text(json.dumps(preset,indent=2)+'\n');(out/'materials.json').write_text(json.dumps(mats,indent=2)+'\n')
    bpy.ops.object.select_all(action='DESELECT');copies=[]
    for o in objects:
        me=bpy.data.meshes.new_from_object(o.evaluated_get(deps));me.transform(o.matrix_world);copy=bpy.data.objects.new(o.name,me);scene.collection.objects.link(copy);copy.select_set(True);copies.append(copy)
    for o in bpy.data.objects:
        if o.name.startswith('SOCK_'):o.select_set(True)
    bpy.context.view_layer.objects.active=copies[0]
    bpy.ops.export_scene.gltf(filepath=str(out/'glb.glb'),export_format='GLB',use_selection=True,export_yup=True,export_apply=True,export_materials='EXPORT',export_extras=True)
    for o in copies:bpy.data.objects.remove(o,do_unlink=True)
    scene['appearance_id']=j['id'];scene['appearance_preset']=json.dumps(preset)
    scene.render.resolution_x=720;scene.render.resolution_y=720;scene.cycles.samples=24;scene.cycles.use_denoising=False
    span=max(dims);pose(camera,(span*1.6,-span*2.4,span*1.8),(0,0,dims[2]*.5),span*1.45+.08)
    scene.render.film_transparent=True;bpy.ops.wm.save_as_mainfile(filepath=str(out/'blender-source.blend'))
    captures={}
    def render(name):
        scene.render.filepath=str(out/name);bpy.ops.render.render(write_still=True)
        captures[name]={'camera_location_m':list(camera.location),'camera_euler_rad':list(camera.rotation_euler),'ortho_scale_m':camera.data.ortho_scale,'transparent':scene.render.film_transparent}
    render('cutout.png');scene.render.film_transparent=False;render('blender-close.png')
    pose(camera,(0,-.001,span*4),(0,0,dims[2]*.4),max(dims[:2])*1.30+.08);render('blender-top.png')
    validation={'finite':True,'nonmanifold_solids':bad,'source_signed_material_volumes':volumes,'triangles':triangles,'editable_meshes':len(objects),'bounds_m':{'min':lo,'max':hi},'actual_dimensions_m':dims,'materials':len(mats),'native_glb':True,'capacity_litres':spec['usable_capacity']['value'],'source_reference_sha256':sha(ref),'publication':False}
    (out/'validation-blender.json').write_text(json.dumps(validation,indent=2)+'\n')
    capture={'renderer':'Blender Cycles','blender_version':bpy.app.version_string,'resolution_px':[720,720],'samples':24,'denoising':False,'color_management':'AgX','views':captures,'hashes':{p.name:sha(p) for p in out.iterdir() if p.is_file()},'publication':False}
    (out/'capture-record.json').write_text(json.dumps(capture,indent=2)+'\n')
    j.update(bounds_m=validation['bounds_m'],dimensions_m=dims,materials=mats,preset=str(out/'preset.json'),geometry_note=geometry_note)
    manifest.write_text(json.dumps(jobs,indent=2)+'\n')
    print('FLUID_VARIANT_COMPLETE',j['id'],flush=True)
