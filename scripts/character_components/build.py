"""Split native crew source into editable, independently skinned equipment.
Blender-only: no voxel generators, resampling, live publication or DB access.
"""
import bpy,sys,json,math,hashlib,struct,argparse,collections
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'scripts'))
from render_crew_looks import visible,linear
from build_crew_archetypes import LOOKS
parser=argparse.ArgumentParser();parser.add_argument('--output',required=True);parser.add_argument('--renders',action='store_true');parser.add_argument('--render-only',action='store_true')
args=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
OUT=(ROOT/args.output).resolve()
assert OUT.is_relative_to(ROOT), 'Output must stay within the workspace'
if OUT.exists():
    if not args.render_only and any(OUT.iterdir()):
        raise RuntimeError('Revision output is not empty. Preserve it and select a new revision directory.')
    if args.render_only and any(OUT.glob('*.png')):
        raise RuntimeError('Saved renders are immutable. Copy the source to a new revision before rendering again.')
OUT.mkdir(parents=True,exist_ok=True)
REV=int(OUT.name[1:]) if OUT.name.startswith('r') and OUT.name[1:].isdigit() else 1
SOURCE=ROOT/'assets/source/crew-astra.blend'
bpy.ops.wm.open_mainfile(filepath=str(OUT/'blender-source.blend' if args.render_only else SOURCE))
rig=next(o for o in bpy.data.objects if o.type=='ARMATURE')
scene=bpy.context.scene
for t in rig.animation_data.nla_tracks:t.mute=True
rig.animation_data.action=None
for p in rig.pose.bones:p.rotation_euler=(0,0,0);p.location=(0,0,0)
scene.frame_set(1)
SLOTS=['helmet','visor','chest','shoulders','gloves','belt','legs','boots','back']
MASS={'helmet':.65,'visor':.12,'chest':1.4,'shoulders':.3,'gloves':.22,'belt':.25,'legs':.85,'boots':.65,'back':1.2}
GRID={'helmet':(2,2),'visor':(2,1),'chest':(2,3),'shoulders':(2,1),'gloves':(2,1),'belt':(2,1),'legs':(2,3),'boots':(2,2),'back':(3,4)}
LABEL={'helmet':'helmet','visor':'visor / optics','chest':'chest garment','shoulders':'shoulder guards','gloves':'gloves / gauntlets','belt':'utility belt','legs':'legwear','boots':'boots','back':'backpack'}

def part_slot(o):
    name=o.name.removeprefix('GEO-').lower();group=o.get('attachment','body')
    if group.startswith('hair-') or (group.startswith('helmet-') and ('hair' in name or 'side-lock' in name)):return 'hair'
    if group.startswith('backpack-'):return 'back'
    if group.startswith('visor-'):return 'visor'
    if group.startswith('helmet-'):
        return 'visor' if o.get('optical_surface') or any(x in name for x in ['visor','optic-','lens-','recon-mask']) else 'helmet'
    if group.startswith('weapon-'):return 'weapon'
    if group=='body' and (name in ['head','nose','smile'] or name.startswith(('ear','eye','brow'))):return 'face'
    if any(x in name for x in ['belt','buckle','pouch','utility-tool','mechanic-driver','heavy-skirt']):return 'belt'
    if any(x in name for x in ['shoulder','pauldron','epaulette']):return 'shoulders'
    if any(x in name for x in ['glove','knuckle','forearm','wrist','finger','rank']):return 'gloves'
    if any(x in name for x in ['boot','toe.','sole.']):return 'boots'
    if any(x in name for x in ['thigh','shin','knee','greave']) or name=='waist' or name.startswith('flight-seal'):return 'legs'
    return 'chest'

def bounds(objects):
    pts=[o.matrix_world@Vector(v) for o in objects for v in o.bound_box]
    lo=[min(p[i] for p in pts) for i in range(3)];hi=[max(p[i] for p in pts) for i in range(3)]
    return {'min':[round(v,5) for v in lo],'max':[round(v,5) for v in hi],'size':[round(hi[i]-lo[i],5) for i in range(3)]}

def collection(name):
    c=bpy.data.collections.new(name);scene.collection.children.link(c);return c

def link_only(o,c):
    for old in list(o.users_collection):old.objects.unlink(o)
    c.objects.link(o)

palette={}
def material(key,role,profile=None):
    token=(key,role)
    if token in palette:return palette[token]
    original=bpy.data.materials.get('crew.'+role)
    m=original.copy();m.name=f'component.{key}.{role}' if key not in ['base','hair'] else 'crew.'+role+'.modular'
    color=(profile or {}).get(role)
    if color:
        rgb=linear(color);p=m.node_tree.nodes.get('Principled BSDF');alpha=.82 if role=='visor' else 1
        p.inputs['Base Color'].default_value=(*rgb,1);m.diffuse_color=(*rgb,alpha)
        if role=='light':p.inputs['Emission Color'].default_value=(*rgb,1)
    palette[token]=m;return m

built=collections.defaultdict(list)
def clone(o,key,c,profile=None):
    p=o.copy();p.data=o.data.copy();c.objects.link(p);p.hide_render=False;p.hide_viewport=False;p.hide_set(False)
    p.name=f'GEO-{key}__{o.name.removeprefix("GEO-")}';p['component_id']=key;p['source_object']=o.name
    for i,m in enumerate(p.data.materials):p.data.materials[i]=material(key if profile else ('hair' if key.startswith('hair-') else 'base'),m.name.replace('crew.',''),profile)
    built[key].append(p);return p

def brick(name,loc,size,role,bone,key,c,bevel=.018):
    bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=bpy.context.object;o.name=f'GEO-{key}__{name}';o.dimensions=size
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    mod=o.modifiers.new('Authored molded edge','BEVEL');mod.width=min(bevel,min(size)*.22);mod.segments=3
    bpy.ops.object.modifier_apply(modifier=mod.name)
    o.data.materials.append(material('hair' if key.startswith('hair-') else 'base',role))
    g=o.vertex_groups.new(name=bone);g.add(list(range(len(o.data.vertices))),1,'REPLACE');mod=o.modifiers.new('Shared crew skeleton','ARMATURE');mod.object=rig;o.parent=rig
    o['component_id']=key;link_only(o,c);built[key].append(o);return o

if not args.render_only:
    originals=[o for o in bpy.data.objects if o.type=='MESH'];audit=[]
    archive=collection('REFERENCE-original-parts (hidden, unchanged)')
    for o in originals:
        audit.append({'object':o.name,'legacyGroup':o.get('attachment','body'),'slot':part_slot(o),'bones':[g.name for g in o.vertex_groups]})
        link_only(o,archive);o.hide_render=True
    # Do not disable the source collection until duplicates have been created.
    entries=[];sets={}
    for look,profile in LOOKS.items():
        groups=collections.defaultdict(list)
        for o in originals:
            if visible(o.get('attachment','body'),look,profile):
                slot=part_slot(o)
                if slot in SLOTS:groups[slot].append(o)
        sets[look]={}
        for slot,objects in groups.items():
            key=f'{look}-{slot}';c=collection('COMP-'+key);sets[look][slot]=key
            for o in objects:clone(o,key,c,profile)
            entries.append({'id':key,'archetype':look,'slot':slot,'name':f'{profile["name"]} {LABEL[slot]}','massKg':round(MASS[slot]*(1.6 if look=='marine' else 1),3),'grid':list(GRID[slot]),'bodyTypes':['male','female'],'sourceObjects':[o.name for o in objects],'collection':c.name,'covers':{'chest':['torso','upperarms'],'gloves':['forearms','hands'],'legs':['legs'],'boots':['feet']}.get(slot,[]),'hidesHair':slot=='helmet','statsStatus':'implemented lab mass / storage footprint; no defense, class, seal or resistance granted','revision':REV,'ownerFinalSignoff':None})
    # Preserve legacy standard/explorer accessories too, including pieces absent from the ten presets.
    represented={n for e in entries for n in e['sourceObjects']}
    for group in sorted({o.get('attachment','body') for o in originals}):
        unclaimed=[o for o in originals if o.get('attachment','body')==group and o.name not in represented and part_slot(o) in SLOTS]
        per=collections.defaultdict(list)
        for o in unclaimed:per[part_slot(o)].append(o)
        for slot,objects in per.items():
            key=f'legacy-{group}-{slot}';c=collection('COMP-'+key)
            for o in objects:clone(o,key,c,LOOKS['engineer'])
            entries.append({'id':key,'archetype':'legacy','slot':slot,'name':group.replace('-',' ').title()+' '+LABEL[slot],'massKg':MASS[slot],'grid':list(GRID[slot]),'bodyTypes':['male','female'],'sourceObjects':[o.name for o in objects],'collection':c.name,'covers':[],'hidesHair':slot=='helmet','statsStatus':'implemented lab mass / storage footprint only','revision':REV,'ownerFinalSignoff':None})
    # Both adult stylized bases share every rest matrix, joint center and socket.
    basegroups={}
    for body in ['male','female']:
        c=collection('BASE-'+body);keys=[]
        def add(name,loc,size,role,bone,region='core',bevel=.018):
            key=f'base-{body}-{region}';keys.append(key);return brick(name,loc,size,role,bone,key,c,bevel)
        for o in originals:
            if part_slot(o)=='face':clone(o,f'base-{body}-core',c)
        # Subtle shape changes within the common fit envelope, no explicit anatomy.
        torso=add('torso',(0,.005,1.025),(.398 if body=='male' else .375,.265,.39),'skin','spine','torso',.035)
        if body=='female':
            for v in torso.data.vertices:
                if v.co.z<0:v.co.x*=.86
        add('neck',(0,0,1.255),(.235,.235,.14),'skin','spine')
        add('pelvis',(0,0,.779),(.337 if body=='male' else .355,.226,.16),'skin','pelvis','legs')
        add('modesty-waist',(0,-.003,.778),(.36 if body=='male' else .375,.245,.17),'rubber','pelvis','modesty',.02)
        if body=='female':
            add('modesty-chest-cover',(0,-.001,1.115),(.389,.277,.223),'rubber','spine','modesty',.025)
            for s in [-1,1]:add('modesty-strap'+str(s),(s*.117,0,1.21),(.045,.25,.095),'rubber','spine','modesty',.01)
        for side,s in [('L',1),('R',-1)]:
            add('shorts-'+side,(s*.14,0,.672),(.19,.232,.16),'rubber','thigh.'+side,'modesty',.02)
            add('upperarm-'+side,(s*.355,0,1.088),(.167,.202,.296),'skin','upper_arm.'+side,'upperarms',.032)
            add('elbow-'+side,(s*.393,0,.933),(.138,.185,.115),'skin','forearm.'+side,'forearms',.03)
            add('forearm-'+side,(s*.4,0,.836),(.142,.182,.191),'skin','forearm.'+side,'forearms',.03)
            add('hand-'+side,(s*.4,-.006,.716),(.139,.168,.126),'skin','hand.'+side,'hands',.021)
            add('thumb-'+side,(s*.332,-.015,.726),(.038,.10,.073),'skin','hand.'+side,'hands',.012)
            add('thigh-'+side,(s*.14,0,.576),(.177,.212,.287),'skin','thigh.'+side,'legs',.03)
            add('knee-'+side,(s*.14,0,.427),(.155,.18,.114),'skin','shin.'+side,'legs',.03)
            add('shin-'+side,(s*.14,0,.285),(.158,.19,.247),'skin','shin.'+side,'legs',.026)
            add('bare-foot-'+side,(s*.14,-.067,.064),(.181,.304,.126),'skin','foot.'+side,'feet',.028)
        basegroups[body]=sorted(set(keys+[f'base-{body}-core']))
    hairstyles=['swept','cropped','crest','scientist']
    for hair in hairstyles:
        key='hair-'+hair;c=collection('HAIR-'+hair)
        for o in originals:
            if o.get('attachment')==key:clone(o,key,c)
    # Short fitted liner is separate hair, never a welded part of a cap.
    c=collection('HAIR-helmet-liner')
    for o in originals:
        if o.get('attachment')=='helmet-captain' and part_slot(o)=='hair':clone(o,'hair-helmet-liner',c)
    for hair in ['bob','ponytail','bun','braids']:
        hairstyles.append(hair);key='hair-'+hair;c=collection('HAIR-'+hair)
        def lock(name,loc,size):return brick(name,loc,size,'hair','head',key,c,.022)
        for o in originals:
            if o.get('attachment')=='hair-cropped':clone(o,key,c)
        for s in [-1,1]:
            lock('temple'+str(s),(s*.274,0,1.704),(.10,.38,.265))
            lock('fringe'+str(s),(s*.125,-.238,1.824),(.253,.087,.125))
        if hair=='bob':
            lock('back',(0,.243,1.66),(.56,.13,.34))
            for s in [-1,1]:lock('cheek-lock'+str(s),(s*.274,-.08,1.568),(.095,.28,.15))
        elif hair=='bun':
            lock('bun-knot',(0,.338,1.80),(.25,.21,.24));lock('bun-band',(0,.26,1.8),(.21,.04,.18))
        elif hair=='ponytail':
            lock('tail-tie',(0,.29,1.77),(.145,.085,.13));lock('tail',(0,.348,1.615),(.185,.145,.30));lock('tail-tip',(0,.355,1.452),(.138,.127,.10))
        else:
            for s in [-1,1]:
                for i in range(5):lock(f'braid-{s}-{i}',(s*(.24+(.01 if i%2 else 0)),.17,1.57-i*.06),(.115,.125,.079))
    # Keep existing pose fixtures as optional separate meshes (not inventory equipment).
    for weapon in ['pistol','rifle']:
        key='weapon-'+weapon;c=collection('POSE-'+weapon)
        for o in originals:
            if o.get('attachment')==key:clone(o,key,c)
    # All original geometry has a declared destination, even comparisons not used by presets.
    assert len(audit)==550
    archive.hide_render=True;archive.hide_viewport=True
    bpy.context.view_layer.update()
    for entry in entries:
        entry['boundsMeters']=bounds(built[entry['id']]);entry['glb']=entry['id']+'.glb';entry['image']=entry['id']+'.png'
    manifest={'schema':1,'revision':REV,'source':str(SOURCE.relative_to(ROOT)),'sourceSha256':hashlib.sha256(SOURCE.read_bytes()).hexdigest(),'rig':{'id':'crew-shared-16-v1','boneCount':len(rig.data.bones),'bones':[{'name':b.name,'parent':b.parent.name if b.parent else None,'matrix':[list(row) for row in b.matrix_local]} for b in rig.data.bones],'clips':[t.name for t in rig.animation_data.nla_tracks]},'bodyTypes':['male','female'],'hairStyles':['none',*hairstyles],'sets':sets,'components':entries,'sourceAudit':audit,'baseGroups':basegroups,'hairPolicy':'Full helmets hide hair; caps show an independently colored fitted hair liner; hair choice is retained and reappears when unequipped.','ownerFinalSignoff':None}
    (OUT/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
    # Source stays exploded into labeled collections; all parts retain weights/materials.
    bpy.context.preferences.filepaths.save_version=0
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'blender-source.blend'))
else:
    manifest=json.loads((OUT/'manifest.json').read_text())
    for o in bpy.data.objects:
        if o.type=='MESH' and o.get('component_id'):built[o['component_id']].append(o)

def reset_pose():
    rig.animation_data.action=None
    for t in rig.animation_data.nla_tracks:t.mute=True
    scene.frame_set(1)
    for p in rig.pose.bones:p.rotation_euler=(0,0,0);p.location=(0,0,0)
    bpy.context.view_layer.update()

def show(keys):
    hidden=set()
    for e in manifest['components']:
        if e['id'] in keys:hidden.update(e['covers'])
    for key,objects in built.items():
        region=key.split('-')[-1] if key.startswith('base-') else ''
        for o in objects:o.hide_render=key not in keys or region in hidden

def render(file,keys,individual=False):
    show(keys);objects=[o for k in keys for o in built[k]]
    b=bounds(objects);center=Vector([(b['min'][i]+b['max'][i])/2 for i in range(3)])
    scene.camera.location=center+Vector((3,-5,2.1));scene.camera.rotation_euler=(-Vector((3,-5,2.1))).to_track_quat('-Z','Y').to_euler()
    scene.camera.data.ortho_scale=max(b['size'][2]*1.4,b['size'][0]*1.7,b['size'][1]*1.7,.2) if individual else 2.6
    scene.render.resolution_x=384 if individual else 480;scene.render.resolution_y=384 if individual else 640
    scene.render.filepath=str(file);bpy.ops.render.render(write_still=True)

if args.renders:
    scene.render.engine='CYCLES';scene.cycles.samples=32;scene.cycles.use_denoising=False
    scene.render.resolution_percentage=100;scene.render.film_transparent=True
    scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA'
    scene.camera.data.type='ORTHO'
    for entry in manifest['components']:render(OUT/entry['image'],[entry['id']],True)
    for body in manifest['bodyTypes']:
        render(OUT/f'base-{body}.png',manifest['baseGroups'][body])
        for look,slots in manifest['sets'].items():
            render(OUT/f'{body}-{look}.png',[*manifest['baseGroups'][body],*slots.values(),*(['hair-scientist'] if look=='scientist' else [])])
    for hair in manifest['hairStyles']:
        if hair!='none':render(OUT/f'hair-{hair}.png',['base-female-core','hair-'+hair],True)
    mixed=['medic-chest','engineer-helmet','recon-visor','marine-shoulders','security-gloves','mechanic-belt','pilot-legs','salvage-boots','scientist-back']
    for body in manifest['bodyTypes']:render(OUT/f'{body}-mixed.png',manifest['baseGroups'][body]+mixed)
    (OUT/'render-evidence.json').write_text(json.dumps({'renderer':'Blender Cycles 32 samples','baseBodies':2,'fullSets':20,'mixedSets':2,'componentImages':len(manifest['components']),'hairImages':8},indent=2))
if args.render_only:sys.exit(0)
reset_pose()
# Archived originals retain their names in the editable source, but cannot claim
# a runtime component name while Blender batches the selected export.
for o in bpy.data.objects:
    if o.type=='MESH' and not o.get('component_id'):o.name='REFERENCE-'+o.name
# Preserve weights while batching only within an independently equipped component/region.
for key,objects in built.items():
    bpy.ops.object.select_all(action='DESELECT')
    for o in objects:o.hide_render=False;o.select_set(True)
    bpy.context.view_layer.objects.active=objects[0];bpy.ops.object.join();merged=bpy.context.object;merged.name='GEO-'+key;built[key]=[merged]
    assert all(v.groups and abs(sum(g.weight for g in v.groups)-1)<1e-5 for v in merged.data.vertices),'Missing/unnormalized skin weights: '+key

def export(path,keys,animations=False):
    bpy.ops.object.select_all(action='DESELECT');rig.select_set(True)
    for key in keys:
        for o in built[key]:o.select_set(True)
    for t in rig.animation_data.nla_tracks:t.mute=not animations
    bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_animations=animations,export_animation_mode='NLA_TRACKS',export_force_sampling=True,export_skins=True,export_extras=True,export_yup=True)
    data=path.read_bytes();size=struct.unpack_from('<I',data,12)[0];g=json.loads(data[20:20+size])
    assert g.get('skins') and all('JOINTS_0' in p['attributes'] and 'WEIGHTS_0' in p['attributes'] for m in g['meshes'] for p in m['primitives'])
    return g
for entry in manifest['components']:export(OUT/entry['glb'],[entry['id']])
for body in manifest['bodyTypes']:export(OUT/f'base-{body}.glb',manifest['baseGroups'][body],True)
for hair in manifest['hairStyles']:
    if hair!='none':export(OUT/f'hair-{hair}.glb',['hair-'+hair])
g=export(OUT/'modular-crew.glb',list(built),True)
assert {a['name'] for a in g['animations']}==set(manifest['rig']['clips'])
assert len(g['skins'][0]['joints'])==16
optical=[m for m in g['materials'] if m['name'].endswith('.visor')]
assert optical and all(m.get('alphaMode')=='BLEND' and m.get('extensions',{}).get('KHR_materials_transmission',{}).get('transmissionFactor',0)>0 for m in optical)
(OUT/'validation.json').write_text(json.dumps({'passed':True,'rigBones':16,'animations':len(g['animations']),'components':len(manifest['components']),'originalPartsAudited':len(manifest['sourceAudit']),'weightedMeshes':len(g['meshes']),'primitives':sum(len(m['primitives']) for m in g['meshes']),'opticalMaterials':len(optical),'runtimeBytes':(OUT/'modular-crew.glb').stat().st_size,'sourceSha256':hashlib.sha256((OUT/'blender-source.blend').read_bytes()).hexdigest(),'runtimeSha256':hashlib.sha256((OUT/'modular-crew.glb').read_bytes()).hexdigest()},indent=2)+'\n')
print('MODULAR CREW BUILD COMPLETE',OUT)
