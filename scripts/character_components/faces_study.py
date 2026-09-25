"""r009 native heads, pixel facial layers and directional stepped hair.

Starts from the exact approved r008 editable source. Existing equipment, body
below the neck, rig, binds and all original animation channels are retained.
"""
import argparse, bpy, collections, hashlib, json, math, sys
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(Path(__file__).parent));sys.path.insert(0,str(ROOT/'scripts'))
from face_atlas import make_atlases, EXPRESSIONS, DETAILS, BEARDS, AGES
from render_crew_looks import linear
p=argparse.ArgumentParser();p.add_argument('--output',required=True);p.add_argument('--renders',action='store_true')
a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);OUT=(ROOT/a.output).resolve()
assert OUT.is_relative_to(ROOT) and not OUT.exists(), 'Preserve every prior iteration'
OUT.mkdir(parents=True)
SOURCE=ROOT/'assets/art-library/designs/crew.base-and-outfits/revisions/r008/candidate/blender-source.blend'
assert hashlib.sha256(SOURCE.read_bytes()).hexdigest()=='6b17eab686f9c82c67f7dd87a6b460e9c0311f29d954e43728cf93d875157f61'
bpy.ops.wm.open_mainfile(filepath=str(SOURCE));scene=bpy.context.scene
rig=next(o for o in bpy.data.objects if o.type=='ARMATURE')
for t in rig.animation_data.nla_tracks:t.mute=True
rig.animation_data.action=None;scene.frame_set(1)
for b in rig.pose.bones:b.rotation_euler=(0,0,0);b.location=(0,0,0)
manifest=json.loads(SOURCE.with_name('manifest.json').read_text())
styles=[s for s in manifest['hairStyles'] if s!='none']
built=collections.defaultdict(list)
removed=[]
for o in list(bpy.data.objects):
    key=o.get('component_id','')
    headpart=key in ['base-male-core','base-female-core'] and any(g.name=='head' for g in o.vertex_groups)
    hairpart=key in ['hair-'+s for s in styles]
    if o.type=='MESH' and (headpart or hairpart):
        removed.append(o.name);bpy.data.objects.remove(o,do_unlink=True)
    elif o.type=='MESH' and key:built[key].append(o)
M={}
def material(role):
    if role in M:return M[role]
    name={'skin':'crew.skin.modular','hair':'crew.hair.modular','highlight':'crew.hair.highlight','shadow':'crew.hair.shadow'}.get(role,role)
    m=bpy.data.materials.get(name) or bpy.data.materials.new(name);m.use_nodes=True
    if role=='skin':M[role]=m;return m
    s=m.node_tree.nodes.get('Principled BSDF');rgb=linear({'skin':'#EBC2AC','hair':'#353047','highlight':'#484057','shadow':'#272134'}.get(role,'#ffffff'))
    s.inputs['Base Color'].default_value=(*rgb,1);s.inputs['Metallic'].default_value=0;s.inputs['Roughness'].default_value=.71
    m.diffuse_color=(*rgb,1);M[role]=m;return m
def finish(o,key,label,role='skin',bevel=.001):
    o.name=f'GEO-{key}__{label}';o['component_id']=key;o['authoring_revision']=9;o['detail_function']=label
    name=('BASE-'+key.split('-')[1]) if key.startswith('base-') else 'HAIR-'+key[5:]
    c=bpy.data.collections.get(name) or bpy.data.collections.new(name)
    if c.name not in scene.collection.children:scene.collection.children.link(c)
    for old in list(o.users_collection):old.objects.unlink(o)
    c.objects.link(o);c.hide_render=False;c.hide_viewport=False
    o.data.materials.append(material(role))
    if bevel:
        mod=o.modifiers.new('Subvoxel edge light','BEVEL');mod.width=bevel;mod.segments=1;mod.limit_method='ANGLE'
        bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=mod.name)
    group=o.vertex_groups.new(name='head');group.add(list(range(len(o.data.vertices))),1,'REPLACE')
    mod=o.modifiers.new('Unchanged shared head bind','ARMATURE');mod.object=rig;o.parent=rig
    built[key].append(o);return o
def box(key,label,loc,size,role='skin',bevel=.001):
    bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=bpy.context.object;o.dimensions=size
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    return finish(o,key,label,role,bevel)
def loft(key,label,rings,role='skin',bevel=.001):
    verts=[]
    for z,w,d,x,y,ch in rings:
        verts.extend((x+u,y+v,z) for u,v in [(-w/2+ch,-d/2),(w/2-ch,-d/2),(w/2,-d/2+ch),(w/2,d/2-ch),(w/2-ch,d/2),(-w/2+ch,d/2),(-w/2,d/2-ch),(-w/2,-d/2+ch)])
    faces=[tuple(reversed(range(8))),tuple(range(len(verts)-8,len(verts)))]
    for k in range(len(rings)-1):
        for j in range(8):n=(j+1)%8;faces.append((k*8+j,k*8+n,(k+1)*8+n,(k+1)*8+j))
    mesh=bpy.data.meshes.new(label);mesh.from_pydata(verts,[],faces);mesh.update()
    o=bpy.data.objects.new(label,mesh);scene.collection.objects.link(o)
    return finish(o,key,label,role,bevel)

images=make_atlases(OUT/'textures')
for role,image in images.items():
    m=material('crew.face.'+role);s=m.node_tree.nodes.get('Principled BSDF')
    tex=m.node_tree.nodes.new('ShaderNodeTexImage');tex.name='Editable 16-cell facial atlas';tex.image=image;tex.interpolation='Closest';tex.extension='CLIP'
    uv_node=m.node_tree.nodes.new('ShaderNodeUVMap');uv_node.uv_map='UVMap'
    m.node_tree.links.new(uv_node.outputs['UV'],tex.inputs['Vector'])
    m.node_tree.links.new(tex.outputs['Color'],s.inputs['Base Color']);m.node_tree.links.new(tex.outputs['Alpha'],s.inputs['Alpha'])
    if role in ['iris','brows','facialHair']:
        mul=m.node_tree.nodes.new('ShaderNodeMixRGB');mul.blend_type='MULTIPLY';mul.inputs[0].default_value=1
        factor=1 if role=='iris' else .5 if role=='brows' else .72
        mul.inputs[2].default_value=(*(v*factor for v in linear('#754c2b' if role=='iris' else '#353047')),1)
        m.node_tree.links.new(tex.outputs['Color'],mul.inputs[1]);m.node_tree.links.new(mul.outputs[0],s.inputs['Base Color'])
    # Alpha test makes the projected ink layer thin and depth-stable in gameplay.
    m.surface_render_method='DITHERED';m.use_transparency_overlap=False
    m['faceAtlas']={'columns':16,'cellPixels':64,'role':role}

for body in ['male','female']:
    female=body=='female';key='base-'+body+'-core'
    # Subtle narrower female jaw/cheeks; upper shell and all joints remain fixed.
    scales=[.94,.95,.967,.98,.98] if female else [1]*5
    rings=[(1.315,.458,.354,0,-.006,.022),(1.347,.49,.396,0,0,.023),
           (1.405,.507,.417,0,0,.024),(1.68,.515,.424,0,0,.026),
           (1.746,.484,.401,0,.002,.024)]
    loft(key,'faceted cranial cheek jaw planes',[(z,w*sc,d,x,y,ch) for (z,w,d,x,y,ch),sc in zip(rings,scales)],bevel=.003)
    for sign in [-1,1]:
        x=sign*(.257 if female else .265)
        loft(key,'stepped ear '+str(sign),[(1.435,.031,.070,x,.002,.005),(1.461,.038,.089,x,.001,.006),
                                        (1.531,.038,.089,x,.001,.006),(1.548,.027,.07,x,.002,.004)],bevel=.002)
        box(key,'inner ear fold '+str(sign),(x,-.046,1.489),(.015,.009,.043),bevel=.002)
    # Tiny actual nose projection retains silhouette that a decal cannot supply.
    loft(key,'two step nose bridge',[(1.459,.018,.010,0,-.215,.002),(1.47,.022,.014,0,-.217,.002),
                                   (1.484,.016,.009,0,-.214,.002),(1.495,.012,.006,0,-.213,.001)],bevel=.001)
    for layer,role in enumerate(['age','detail','facialHair','eyes','brows','mouth','iris']):
        width=.442 if female else .456;z0=1.339;z1=1.706
        # Strip follows the shallow front contour; no visible floating rectangle.
        verts=[];uvs=[]
        for j in range(5):
            v=j/4;z=z0+(z1-z0)*v;y=-.204-min(1,v*3)*.010-layer*.00032
            verts.extend([(-width/2,y,z),(width/2,y,z)])
            uvs.extend([(0,v),(1/16,v)])
        faces=[(j*2,j*2+1,j*2+3,j*2+2) for j in range(4)]
        mesh=bpy.data.meshes.new('UV facial '+role);mesh.from_pydata(verts,[],faces);mesh.update()
        uv=mesh.uv_layers.new(name='UVMap')
        for loop in mesh.loops:uv.data[loop.index].uv=uvs[loop.vertex_index]
        o=bpy.data.objects.new('face '+role,mesh);scene.collection.objects.link(o)
        finish(o,key,'pixel face '+role,'crew.face.'+role,0)

# Hair flows across broad primary masses. Secondary 18–30mm steps are sculpted
# into overlapping native locks, not a uniform exposed voxel lattice.
def lock(key,label,x,y,z,w,d,h,flow=.035,shade=False):
    rings=[];steps=3
    if h>.155:
        # A long directional lock has continuous primary planes. Only its end
        # has nested cuts; full-height stacked plates flatten the hair rhythm.
        rings=[(z,w*.68,d*.79,x,y,.004),(z+.023,w*.68,d*.79,x,y,.004),
               (z+.023,w*.91,d*.96,x+flow*.12,y+.004,.005),
               (z+h*.62,w,d,x+flow*.62,y+.014,.005),
               (z+h,w*.88,d*.98,x+flow,y+.023,.005)]
    for j in range(steps):
        if h>.155:break
        t=j/steps;next_t=(j+1)/steps
        ww=w*(1-.24*t);dd=d*(1-.14*t);xx=x+flow*t;yy=y+.028*t
        rings.extend([(z+h*t,ww,dd,xx,yy,min(.005,ww*.1)),
                      (z+h*next_t,ww,dd,xx,yy,min(.005,ww*.1))])
    o=loft(key,label,rings,'hair',.0009)
    o.data.materials.append(material('highlight'));o.data.materials.append(material('shadow'))
    for face in o.data.polygons:
        if face.normal.z>.8 and shade:face.material_index=1
        elif face.normal.z<-.8:face.material_index=2
    return o
for style in styles:
    key='hair-'+style;short=style in ['cropped','crest'];low=1.624
    loft(key,'continuous fitted scalp',[(low,.505,.407,0,.013,.038),(1.752,.534,.447,0,.021,.022),
                                      (1.787,.533,.448,0,.023,.021),(1.833,.465,.391,0,.026,.029),
                                      (1.855,.400,.319,-.013,.026,.022)],'hair',.002)
    nape_low=1.325 if style=='bob' else 1.477 if short else 1.433
    for i in range(7):
        x=-.231+i*.077;z=nape_low+.016*abs(i-3)
        lock(key,'nape directional lock '+str(i),x,.201,z,.104,.109,1.822-z,.005*(i-3),i%3==1)
    for sign in [-1,1]:
        for i in range(3):
            z=(1.356 if style=='bob' else 1.50 if short else 1.462)+i*.025
            lock(key,'temple directional lock '+str((sign,i)),sign*.253,-.058+i*.089,z,.089,.147,1.835-z,-sign*.022,i==2)
    if style in ['swept','ponytail','bun','braids','bob']:
        fringe=[(-.22,1.591,.074),(-.145,1.602,.107),(-.055,1.635,.111),(.035,1.679,.107),(.128,1.704,.091),(.208,1.661,.068)]
        if style=='bob':fringe=[(-.216,1.645,.078),(-.139,1.687,.100),(-.054,1.710,.104),(.037,1.671,.111),(.133,1.614,.099),(.214,1.565,.080)]
        for i,(x,z,w) in enumerate(fringe):
            lock(key,'asymmetric fringe '+str(i),x,-.216,z,w+.013,.091,1.83-z,.065,i in [1,4])
        # Unequal diagonal primary swathes; staggered secondary locks follow the
        # same part line instead of placing identical blocks in a crown grid.
        crowns=[(-.19,-.09,1.778,.13,.23,.088),(-.088,-.105,1.800,.153,.255,.10),
                (.038,-.055,1.821,.166,.265,.105),(.161,-.005,1.794,.155,.238,.10),
                (-.161,.11,1.777,.154,.21,.088),(-.034,.141,1.791,.172,.19,.107),
                (.106,.151,1.783,.162,.18,.097),(.207,.136,1.763,.092,.154,.083)]
        for i,(x,y,z,w,d,h) in enumerate(crowns):
            if style=='bob':x=-x;w*=1.03;h*=.82
            lock(key,'directional crown mass '+str(i),x,y,z,w,d,h,-.035,i in [1,4,6])
            if i in [1,2,4,5]:lock(key,'secondary parted ridge '+str(i),x-.021,y-.013,z+.058,w*.41,d*.84,h*.62,-.024,i==2)
    elif style=='crest':
        for i in range(6):
            lock(key,'central swept crest '+str(i),-.025,-.19+i*.073,1.775,.16,.103,.123+.026*math.sin(i*.65),-.033,i%3==0)
        for sign in [-1,1]:
            for i in range(4):lock(key,'crest close sides '+str((sign,i)),sign*.17,-.14+i*.085,1.76,.10,.11,.073,-sign*.022,i==1)
        for i in range(3):lock(key,'cropped frontal crest '+str(i),-.10+i*.087,-.206,1.644+i*.025,.096,.065,.16,-.025,i==2)
    elif style=='cropped':
        for row in range(4):
            for col in range(6):lock(key,'close grain '+str((row,col)),-.223+col*.085,-.158+row*.104,1.77,.091,.122,.059+((col+row*2)%4)*.006,-.012,(col+row)%5==0)
        for i in range(6):lock(key,'irregular cropped fringe '+str(i),-.215+i*.086,-.203,1.674+(i%3)*.012,.095,.06,.118,-.009,i==2)
    else: # scientist: swept salt-and-pepper silhouette with side tufts
        for row in range(3):
            for col in range(5):lock(key,'tousled lock '+str((row,col)),-.21+col*.104,-.13+row*.13,1.758,.123,.148,.1+((row+col)%3)*.020,(col-2)*.015,(col+row)%3==0)
        for sign in [-1,1]:
            for i in range(3):lock(key,'flared temple tuft '+str((sign,i)),sign*.27,-.07+i*.10,1.53,.075,.123,.208,sign*.03,i==1)
        for i in range(5):lock(key,'tousled fringe '+str(i),-.19+i*.096,-.21,1.625+(i%3)*.019,.105,.07,.19,.022,i==3)
    if style=='ponytail':
        # Continuous gathered side arc stays visibly separate from backpack.
        for i,(x,y,z,w,d,h) in enumerate([(.20,.21,1.80,.13,.12,.12),(.29,.29,1.72,.18,.16,.16),(.36,.33,1.56,.18,.17,.20),(.39,.33,1.40,.15,.15,.20),(.35,.30,1.27,.10,.11,.18)]):
            lock(key,'gathered ponytail segment '+str(i),x,y,z,w,d,h,-.02,i%2==0)
    if style=='bun':
        for j in range(3):
            for i in range(3):lock(key,'folded bun '+str((j,i)),-.095+i*.092,.205+j*.062,1.72,.116,.112,.14+.04*(i==1),-.014,(i+j)%3==0)
    if style=='braids':
        for sign in [-1,1]:
            for i in range(8):
                z=1.18+i*.077;x=sign*(.29+.018*math.sin(i*2));y=.16+.013*math.cos(i*2)
                lock(key,'woven braid '+str((sign,i)),x,y,z,.084,.086,.105,sign*.012,i%3==0)
        for sign in [-1,1]:box(key,'braid tie '+str(sign),(sign*.305,.168,1.212),(.081,.087,.027),'shadow',.001)

# Keep editable lock inputs; export their exact native union. This removes
# internal/coplanar surfaces without voxel resampling or silhouette smoothing.
for style in styles:
    key='hair-'+style;inputs=built[key]
    surface=inputs[0].copy();surface.data=inputs[0].data.copy();surface.name='GEO-'+key+'__native-union'
    for mod in list(surface.modifiers):surface.modifiers.remove(mod)
    destination=bpy.data.collections.new('DELIVERED-'+key);scene.collection.children.link(destination);destination.objects.link(surface)
    operands=bpy.data.collections.new('AUTHORING-LOCKS-'+style);scene.collection.children.link(operands)
    for o in inputs[1:]:
        for old in list(o.users_collection):old.objects.unlink(o)
        operands.objects.link(o)
    bpy.ops.object.select_all(action='DESELECT');surface.select_set(True);bpy.context.view_layer.objects.active=surface
    boolean=surface.modifiers.new('Exact directional lock union','BOOLEAN');boolean.operation='UNION';boolean.operand_type='COLLECTION';boolean.collection=operands;boolean.solver='EXACT';boolean.use_self=True
    bpy.ops.object.modifier_apply(modifier=boolean.name)
    group=surface.vertex_groups.get('head') or surface.vertex_groups.new(name='head');group.add(list(range(len(surface.data.vertices))),1,'REPLACE')
    deform=surface.modifiers.new('Unchanged shared head bind','ARMATURE');deform.object=rig
    for o in inputs:
        o['source_component_id']=key;del o['component_id'];o.hide_render=True;o.hide_set(True)
    operands.hide_render=True;operands.hide_viewport=True
    surface['component_id']=key;surface['native_union_input_count']=len(inputs);surface['detail_function']='Exact native union; individual original stepped locks retained hidden'
    built[key]=[surface]

manifest['revision']=9;manifest['parentSource']=str(SOURCE.relative_to(ROOT));manifest['parentSourceSha256']=hashlib.sha256(SOURCE.read_bytes()).hexdigest()
manifest['focus']={'updatedBases':['male','female'],'updatedComponents':['hair-'+s for s in styles],
                   'scope':'Head-only base edit, eight native hair replacements and seven facial texture atlases. All existing equipment, below-neck geometry and rig retained.',
                   'newDraftDesigns':[],'unchangedSets':list(manifest['sets'])}
manifest['facialAtlas']={'columns':16,'cellPixels':64,'faceWidthMeters':.456,'expressions':EXPRESSIONS,'details':DETAILS,'facialHair':BEARDS,'ages':AGES}
(OUT/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
(OUT/'source-edit-record.json').write_text(json.dumps({'removedHeadHairObjects':removed,'sourceSha256':manifest['parentSourceSha256'],'keptEquipmentDefinitions':90,'ownerFinalSignoff':None},indent=2)+'\n')

for o in list(bpy.data.objects):
    if o.type=='LIGHT':bpy.data.objects.remove(o,do_unlink=True)
world=bpy.data.worlds.new('Face study neutral world');world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.17,.20,.26,1);world.node_tree.nodes['Background'].inputs[1].default_value=.5;scene.world=world
for name,loc,power,size,color in [('key',(3,-4,5),450,4,(1,.94,.9)),('fill',(-3,-2,3),180,4,(.70,.82,1)),('rim',(1,3,4),220,3,(.65,.77,1))]:
    data=bpy.data.lights.new('Face '+name,'AREA');data.energy=power;data.shape='DISK';data.size=size;data.color=color
    o=bpy.data.objects.new('Face '+name,data);scene.collection.objects.link(o);o.location=loc;o.rotation_euler=(Vector((0,0,1.6))-o.location).to_track_quat('-Z','Y').to_euler()
scene.render.engine='CYCLES';scene.cycles.samples=32;scene.cycles.use_denoising=False;scene.cycles.transparent_max_bounces=64
scene.render.film_transparent=True;scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA';scene.render.resolution_percentage=100
scene.view_settings.view_transform='Standard';scene.view_settings.look='None';scene.camera.data.type='ORTHO'
def show(keys):
    covers={r for c in manifest['components'] if c['id'] in keys for r in c['covers']}
    for k,objs in built.items():
        for o in objs:o.hide_render=k not in keys or (k.startswith('base-') and k.split('-')[-1] in covers)
records=[]
def render(name,keys,view=(3,-6,1.6),full=False):
    show(keys);target=Vector((0,0,.99 if full else 1.59));scene.camera.location=target+Vector(view)
    scene.camera.rotation_euler=(target-scene.camera.location).to_track_quat('-Z','Y').to_euler();scene.camera.data.ortho_scale=2.3 if full else .96
    scene.render.resolution_x=512;scene.render.resolution_y=640 if full else 512;scene.render.filepath=str(OUT/(name+'.png'))
    bpy.ops.render.render(write_still=True);records.append({'file':name+'.png','keys':keys,'cameraDirection':view,'orthoScale':scene.camera.data.ortho_scale})
if a.renders:
    for body in ['male','female']:
        render(body+'-face-front',['base-'+body+'-core','hair-swept'],(0,-6,.2))
        render('base-'+body,manifest['baseGroups'][body]+['hair-swept'],full=True)
    for style in styles:
        render('hair-'+style,['base-female-core','hair-'+style])
        render('hair-'+style+'-rear',['base-female-core','hair-'+style],(3,6,2.0))
    for body in ['male','female']:
        render(body+'-medic-sealed',manifest['baseGroups'][body]+list(manifest['sets']['medic'].values()),full=True)
    # Save a deliberately saturated dye comparison without changing final material defaults.
    old={r:tuple(material(r).node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value) for r in ['hair','highlight','shadow']}
    for name,hexcolor in [('neon-pink','#ff319a'),('electric-blue','#148bff'),('neon-orange','#ff7318')]:
        rgb=linear(hexcolor)
        for role,mul in [('hair',1),('highlight',1.12),('shadow',.66)]:material(role).node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=(*(min(1,v*mul) for v in rgb),1)
        render(name,['base-female-core','hair-bob'])
    for role,value in old.items():material(role).node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=value
show(manifest['baseGroups']['female']+['hair-swept'])
bpy.context.preferences.filepaths.save_version=0;bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'blender-source.blend'))
(OUT/'capture-record.json').write_text(json.dumps({'renderer':f'Blender Cycles {scene.cycles.samples} samples, Standard, transparent, no denoiser/bloom','sourceSha256':hashlib.sha256((OUT/'blender-source.blend').read_bytes()).hexdigest(),'records':records,'limits':'Static neutral views; runtime rendering and motion are independently reviewed.'},indent=2)+'\n')

# Export batch by existing visibility component while retaining native input locks.
for key,objects in built.items():
    bpy.ops.object.select_all(action='DESELECT')
    for o in objects:o.hide_set(False);o.hide_viewport=False;o.hide_render=False;o.select_set(True)
    bpy.context.view_layer.objects.active=objects[0];bpy.ops.object.join();merged=bpy.context.object;merged.name='GEO-'+key;merged['component_id']=key;built[key]=[merged]
def export(name,keys,animations=False):
    bpy.ops.object.select_all(action='DESELECT');rig.select_set(True)
    for key in keys:
        for o in built[key]:o.select_set(True)
    for t in rig.animation_data.nla_tracks:t.mute=not animations
    bpy.ops.export_scene.gltf(filepath=str(OUT/(name+'.glb')),export_format='GLB',use_selection=True,export_animations=animations,
                              export_animation_mode='NLA_TRACKS',export_force_sampling=True,export_skins=True,export_extras=True,export_yup=True)
for style in styles:export('hair-'+style,['hair-'+style])
for body in ['male','female']:export('base-'+body,manifest['baseGroups'][body],True)
export('modular-crew',list(built),True)
print('FACE/HAIR CANDIDATE COMPLETE',OUT)
