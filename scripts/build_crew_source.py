"""Original studless crew source + skinned animation proof; run via dev.py export-crew."""
import bpy, math, json, struct, sys, gzip, hashlib
from pathlib import Path
from mathutils import Vector
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'assets/runtime/crew'
OUT.mkdir(parents=True, exist_ok=True)
sys.path.insert(0,str(ROOT/'scripts'))
from build_crew_variants import build_variants, build_weapon_fixtures, hold_pose
from build_crew_animation import pose_legs
from build_crew_archetypes import build_archetypes, LOOKS
from render_crew_looks import apply_look, render_looks
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
materials = {}
for name, color, metal in [('suit',(0.12,.24,.37),.0),('accent',(.95,.43,.12),.0),('skin',(.72,.43,.27),0),('hair',(.11,.055,.045),0),('trim',(.69,.77,.83),.05),('rubber',(.025,.04,.065),0),('visor',(.008,.025,.055),.15),('light',(.1,.85,1),.1),('insignia',(.85,.50,.08),.15)]:
    m=bpy.data.materials.new('crew.'+name); m.diffuse_color=(*color,1); m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF'); p.inputs['Base Color'].default_value=(*color,1); p.inputs['Metallic'].default_value=metal; p.inputs['Roughness'].default_value=.25 if name=='visor' else (.36 if name in ['suit','accent','trim'] else .65)
    if name=='light': p.inputs['Emission Color'].default_value=(*color,1); p.inputs['Emission Strength'].default_value=1.3
    if name in ['suit','accent','trim']:
        p.inputs['Coat Weight'].default_value=.22;p.inputs['Coat Roughness'].default_value=.24
    if name=='visor':
        p.inputs['Roughness'].default_value=.18;p.inputs['Metallic'].default_value=.08
        p.inputs['Alpha'].default_value=.82;p.inputs['Transmission Weight'].default_value=.08;p.inputs['IOR'].default_value=1.46
        p.inputs['Coat Weight'].default_value=.5;p.inputs['Coat Roughness'].default_value=.15;m.diffuse_color=(*color,.82)
        if hasattr(m,'surface_render_method'):m.surface_render_method='DITHERED'
        m.use_backface_culling=True
    materials[name]=m
arm=bpy.data.armatures.new('CrewSkeleton'); rig=bpy.data.objects.new('RIG-frontier-crew',arm); bpy.context.collection.objects.link(rig); bpy.context.view_layer.objects.active=rig; rig.select_set(True)
bpy.ops.object.mode_set(mode='EDIT')
bones={
'root':((0,0,0),(0,0,.2),None),'pelvis':((0,0,.72),(0,0,.9),'root'),'spine':((0,0,.9),(0,0,1.23),'pelvis'),'head':((0,0,1.23),(0,0,1.7),'spine'),
}
for side,s in [('L',1),('R',-1)]:
    bones.update({f'upper_arm.{side}':((s*.31,0,1.19),(s*.39,0,.96),'spine'),f'forearm.{side}':((s*.39,0,.96),(s*.40,0,.75),f'upper_arm.{side}'),f'hand.{side}':((s*.40,0,.75),(s*.40,-.02,.64),f'forearm.{side}'),f'thigh.{side}':((s*.14,0,.75),(s*.14,0,.43),'pelvis'),f'shin.{side}':((s*.14,0,.43),(s*.14,0,.15),f'thigh.{side}'),f'foot.{side}':((s*.14,0,.15),(s*.14,-.18,.08),f'shin.{side}')})
for name,(head,tail,parent) in bones.items():
    b=arm.edit_bones.new(name); b.head=head; b.tail=tail
    if parent: b.parent=arm.edit_bones[parent]
bpy.ops.object.mode_set(mode='OBJECT'); rig.select_set(False)
parts=[]
def brick(name,loc,size,mat,bone,bevel=.015,attachment=None):
    bpy.ops.mesh.primitive_cube_add(size=1,location=loc); o=bpy.context.object; o.name='GEO-'+name; o.dimensions=size; bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    if bevel:
        mod=o.modifiers.new('Small molded edge','BEVEL'); mod.width=min(bevel,min(size)*.22); mod.segments=2 if min(size)>=.06 else 1; bpy.ops.object.modifier_apply(modifier=mod.name)
    o.data.materials.append(materials[mat]); group=o.vertex_groups.new(name=bone); group.add(list(range(len(o.data.vertices))),1,'REPLACE'); mod=o.modifiers.new('Crew skeleton','ARMATURE'); mod.object=rig; o.parent=rig
    if attachment: o['attachment']=attachment
    parts.append(o); return o
brick('waist',(0,0,.77),(.38,.26,.2),'rubber','pelvis')
brick('jacket',(0,0,1.02),(.46,.30,.40),'suit','spine',.035,attachment='body-jacket')
brick('chest-panel',(0,-.17,1.08),(.35,.07,.23),'accent','spine',attachment='body-jacket')
brick('collar',(0,0,1.245),(.31,.32,.075),'trim','spine')
brick('zip',(0,-.212,1.075),(.035,.012,.20),'rubber','spine',.002,attachment='body-jacket')
brick('chest-screen',(.092,-.22,1.12),(.075,.02,.046),'light','spine',.004,attachment='body-jacket')
brick('belt',(0,-.015,.835),(.42,.31,.07),'rubber','pelvis')
brick('buckle',(0,-.181,.835),(.08,.025,.055),'trim','pelvis',.004)
brick('head',(0,-.015,1.49),(.43,.37,.41),'skin','head',.026)
for s in [-1,1]:
    brick('ear'+str(s),(s*.227,-.005,1.48),(.065,.115,.105),'skin','head',.012)
    brick('eye'+str(s),(s*.105,-.207,1.51),(.045,.018,.068),'rubber','head',.002)
    brick('brow'+str(s),(s*.10,-.207,1.565),(.073,.022,.025),'hair','head',.002)
brick('nose',(0,-.216,1.46),(.055,.035,.06),'skin','head',.006)
brick('smile',(0,-.205,1.408),(.08,.012,.013),'hair','head',.002)
# Layered interlocking locks, rather than a single cube scalp.
brick('hair-back',(0,.13,1.57),(.46,.14,.28),'hair','head',.012,'hair-swept')
for row in range(3):
    for col in range(4):
        x=(col-1.5)*.112; y=(row-1)*.118
        brick(f'hair-lock-{row}-{col}',(x,y,1.707+(.022 if (col+row)%3 else 0)),(.12,.13,.12),'hair','head',.008,'hair-swept')
for i,(x,z) in enumerate([(-.18,1.615),(-.08,1.65),(.18,1.625)]): brick('fringe'+str(i),(x,-.172,z),(.105,.09,.14),'hair','head',.008,'hair-swept')
for side,s in [('L',1),('R',-1)]:
    brick('shoulder.'+side,(s*.325,0,1.17),(.22,.32,.18),'accent',f'upper_arm.{side}',.026)
    brick('upper-arm.'+side,(s*.375,0,1.04),(.16,.22,.24),'suit',f'upper_arm.{side}')
    brick('elbow.'+side,(s*.395,0,.925),(.16,.22,.085),'rubber',f'forearm.{side}')
    brick('forearm.'+side,(s*.40,0,.845),(.185,.235,.15),'trim',f'forearm.{side}')
    brick('glove.'+side,(s*.40,-.012,.713),(.16,.20,.13),'rubber',f'hand.{side}')
    brick('knuckle.'+side,(s*.40,-.115,.72),(.13,.04,.08),'accent',f'hand.{side}',.006)
    brick('thigh.'+side,(s*.14,0,.605),(.205,.25,.27),'suit',f'thigh.{side}')
    # A real visible joint sleeve and lateral pivot sit beneath independent armor.
    # Rigid weights preserve the studless pieces while exposing knee articulation.
    brick('knee-joint.'+side,(s*.14,0,.43),(.17,.205,.12),'rubber',f'shin.{side}',.035)
    for edge in [-1,1]:
        brick('knee-hinge.'+side+str(edge),(s*.14+edge*.097,0,.43),(.033,.115,.105),'trim',f'shin.{side}',.022)
    brick('knee.'+side,(s*.14,-.132,.425),(.175,.075,.105),'accent',f'shin.{side}',.022)
    brick('shin.'+side,(s*.14,0,.285),(.19,.23,.25),'suit',f'shin.{side}')
    brick('boot.'+side,(s*.14,-.045,.115),(.23,.37,.20),'rubber',f'foot.{side}',.02)
    brick('toe.'+side,(s*.14,-.185,.105),(.23,.12,.12),'trim',f'foot.{side}')
    brick('sole.'+side,(s*.14,-.045,.025),(.24,.38,.05),'rubber',f'foot.{side}',.007)
# Optional helmet covers hair; inset face window retains facial readability when open.
brick('helmet-crown',(0,.005,1.755),(.54,.48,.13),'trim','head',.026,'helmet-standard')
brick('helmet-stripe',(0,-.015,1.828),(.09,.43,.035),'accent','head',.007,'helmet-standard')
for s in [-1,1]:
    brick('helmet-side'+str(s),(s*.255,0,1.535),(.10,.45,.36),'trim','head',.016,'helmet-standard')
    brick('helmet-comms'+str(s),(s*.315,.03,1.54),(.06,.19,.17),'accent','head',.01,'helmet-standard')
brick('helmet-jaw',(0,-.045,1.32),(.51,.41,.10),'trim','head',.015,'helmet-standard')
brick('helmet-visor',(0,-.222,1.52),(.43,.05,.26),'visor','head',.018,'visor-standard')
brick('visor-reflection',(-.09,-.25,1.59),(.17,.008,.018),'light','head',.002,'visor-standard')
brick('backpack',(0,.255,1.065),(.36,.22,.39),'trim','spine',.02,'backpack-utility')
brick('backpack-panel',(0,.38,1.075),(.26,.045,.25),'suit','spine',.012,'backpack-utility')
for s in [-1,1]: brick('backpack-cell'+str(s),(s*.15,.36,1.07),(.06,.08,.22),'accent','spine',.008,'backpack-utility')
build_variants(brick)
build_archetypes(brick,rig,parts,materials)
# Head surfaces grow around the unchanged head pivot; skeleton and sockets remain identical.
for o in parts:
    if len(o.vertex_groups)==1 and o.vertex_groups[0].name=="head":
        pivot=Vector((0,0,1.23)); matrix=o.matrix_world.copy(); inverse=matrix.inverted()
        for v in o.data.vertices:
            relative=matrix@v.co-pivot
            v.co=inverse@(pivot+Vector((relative.x*1.22,relative.y*1.18,relative.z*1.16)))
build_weapon_fixtures(brick,rig)
# Sample ONLY a rigid helmet accessory in rest pose. Weighted body remains skinned.
# Closed individual solids preserve palette identity; never remesh/de-skin the rig.
from voxelize_blender import voxelize
helmet_parts=[o for o in parts if o.get('attachment')=='helmet-standard' and not o.get('optical_surface')]
optical_parts=[o.name for o in parts if o.get('optical_surface')]
assert optical_parts and all(o not in helmet_parts for o in parts if o.get('optical_surface'))
for i,o in enumerate(helmet_parts): o['voxel_priority']=i
# Regression check: robust ray advance must not weaken closed-solid validation.
bpy.ops.mesh.primitive_plane_add(size=.1)
invalid=bpy.context.object; invalid.name='GEO-invalid-open-probe'; invalid.data.materials.append(materials['trim'])
try:
    voxelize([invalid],.004)
except ValueError as error:
    assert 'open or non-manifold' in str(error)
else:
    raise AssertionError('Open geometry was incorrectly accepted')
bpy.data.objects.remove(invalid,do_unlink=True)
sample=voxelize(helmet_parts,.00625,max_samples=4_000_000)
sample['usage']='opaque rigid helmet frame occupancy study; optical visors explicitly excluded; not active damage or skinned body geometry'
raw_sample=(json.dumps(sample,separators=(',',':'))+'\n').encode()
raw_dir=ROOT/'.runtime/art'; raw_dir.mkdir(parents=True,exist_ok=True)
(raw_dir/'crew-helmet-occupancy.json').write_bytes(raw_sample)
packed=gzip.compress(raw_sample,mtime=0)
(OUT/'helmet-occupancy.json.gz').write_bytes(packed)
(OUT/'helmet-occupancy-summary.json').write_text(json.dumps({'schema':1,'usage':sample['usage'],'cellMeters':sample['cellMeters'],'occupiedCells':len(sample['cells']),'sourceSolids':len(sample['objects']),'excludedOpticalSurfaces':optical_parts,'palette':sample['palette'],'sourceGenerator':'scripts/build_crew_source.py','samplerSha256':hashlib.sha256((ROOT/'scripts/voxelize_blender.py').read_bytes()).hexdigest(),'compressedSha256':hashlib.sha256(packed).hexdigest(),'uncompressedSha256':hashlib.sha256(raw_sample).hexdigest(),'compressedBytes':len(packed),'uncompressedBytes':len(raw_sample)},indent=2)+'\n')
(OUT/'helmet-occupancy.json').unlink(missing_ok=True)

# All clips deform weighted geometry through bones; root translation is always zero.
# Pelvis movement is small in-place weight transfer, never actor locomotion.
rig.animation_data_create(); bpy.context.scene.render.fps=24
clip_names=[]
for weapon in ['', 'Pistol', 'Rifle']:
  for gait,length in [('Idle',48),('Walk',24),('Sprint',18),('Seated',24)]:
    clip=gait+('-'+weapon if weapon else '')
    clip_names.append(clip)
    action=bpy.data.actions.new(clip); rig.animation_data.action=action
    for frame in range(1,length+2):
        bpy.context.scene.frame_set(frame)
        phase=(frame-1)/length*math.tau
        for p in rig.pose.bones: p.rotation_mode='XYZ'; p.rotation_euler=(0,0,0); p.location=(0,0,0)
        if gait=='Idle':
            rig.pose.bones['pelvis'].location.x=.005*math.sin(phase)
            rig.pose.bones['pelvis'].location.y=-.012+.003*math.sin(phase)
            rig.pose.bones['spine'].rotation_euler.x=.022*math.sin(phase)
            rig.pose.bones['spine'].rotation_euler.z=.016*math.sin(phase)
            rig.pose.bones['head'].rotation_euler.y=.045*math.sin(phase)
            for side in ['L','R']:
                rig.pose.bones[f'forearm.{side}'].rotation_euler.x=-.10-.025*math.sin(phase)
        elif gait in ['Walk','Sprint']:
            sprint=gait=='Sprint'
            rig.pose.bones['pelvis'].location.y=(-.09 if sprint else -.05)+(.016 if sprint else .008)*math.cos(phase*2)
            rig.pose.bones['pelvis'].location.x=(.021 if sprint else .014)*math.cos(phase)
            rig.pose.bones['pelvis'].rotation_euler.y=.065*math.sin(phase)
            rig.pose.bones['pelvis'].rotation_euler.z=.045*math.cos(phase)
            rig.pose.bones['spine'].rotation_euler.x=(.18 if sprint else .065)+.018*math.cos(phase*2)
            rig.pose.bones['spine'].rotation_euler.y=-.10*math.sin(phase)
            rig.pose.bones['spine'].rotation_euler.z=-.035*math.cos(phase)
            for side,offset in [('L',0),('R',math.pi)]:
                swing=math.sin(phase+offset)
                rig.pose.bones[f'thigh.{side}'].rotation_euler.x=(.88 if sprint else .53)*swing
                rig.pose.bones[f'shin.{side}'].rotation_euler.x=-(1.12 if sprint else .68)*max(0,-swing)-.055
                rig.pose.bones[f'foot.{side}'].rotation_euler.x=(.23 if sprint else .16)*math.sin(phase+offset+.35)
                rig.pose.bones[f'upper_arm.{side}'].rotation_euler.x=-(.76 if sprint else .45)*swing
                rig.pose.bones[f'upper_arm.{side}'].rotation_euler.z=(.065 if side=='L' else -.065)
                rig.pose.bones[f'forearm.{side}'].rotation_euler.x=-(.72 if sprint else .18)-(.22 if sprint else .13)*max(0,swing)
                rig.pose.bones[f'hand.{side}'].rotation_euler.x=.04*math.sin(phase+offset-.3)
            rig.pose.bones['head'].rotation_euler.x=-.06 if sprint else -.025
            rig.pose.bones['head'].rotation_euler.y=.04*math.sin(phase)
        else:
            rig.pose.bones['pelvis'].location.y=-.18
            rig.pose.bones['spine'].rotation_euler.x=.045
            for side in ['L','R']:
                rig.pose.bones[f'thigh.{side}'].rotation_euler.x=-math.pi/2
                rig.pose.bones[f'shin.{side}'].rotation_euler.x=math.pi/2
                rig.pose.bones[f'upper_arm.{side}'].rotation_euler.x=-.30
                rig.pose.bones[f'forearm.{side}'].rotation_euler.x=-.70
        pose_legs(rig,gait,phase)
        if weapon: hold_pose(rig,weapon,phase,gait in ['Walk','Sprint'])
        for p in rig.pose.bones:
            p.keyframe_insert('rotation_euler',frame=frame,group=p.name); p.keyframe_insert('location',frame=frame,group=p.name)
    if hasattr(action,'fcurves'):
        for curve in action.fcurves:
            for key in curve.keyframe_points: key.interpolation='LINEAR'
    track=rig.animation_data.nla_tracks.new(); track.name=clip; track.strips.new(clip,1,action)
    rig.animation_data.action=None
for track in rig.animation_data.nla_tracks: track.mute=True
bpy.context.scene.frame_set(1)
for p in rig.pose.bones: p.rotation_euler=(0,0,0); p.location=(0,0,0)
# Review source camera, usable lighting; excluded from runtime export.
bpy.ops.object.camera_add(location=(3,-5,3)); camera=bpy.context.object; camera.name='Review camera'; camera.rotation_euler=(Vector((0,0,.9))-camera.location).to_track_quat('-Z','Y').to_euler(); camera.data.type='ORTHO'; camera.data.ortho_scale=2.5; bpy.context.scene.camera=camera
for location,power,size in [((2,-3,4),280,2.5),((-3,-1,2),65,3),((0,3,3),240,2)]:
    bpy.ops.object.light_add(type='AREA',location=location); light=bpy.context.object; light.data.energy=power; light.data.shape='DISK'; light.data.size=size; light.rotation_euler=(Vector((0,0,1))-light.location).to_track_quat('-Z','Y').to_euler()
scene=bpy.context.scene; scene.render.engine='CYCLES'; scene.cycles.samples=24; scene.cycles.use_denoising=False; scene.render.resolution_x=640; scene.render.resolution_y=640; scene.render.resolution_percentage=100; scene.world.color=(.035,.035,.035); scene.view_settings.view_transform='AgX'; scene.view_settings.look='AgX - Medium High Contrast'; scene.view_settings.exposure=-.25
apply_look('engineer',parts,materials)
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'assets/source/crew-astra.blend'))
render_looks(scene,parts,materials,OUT)
scene.render.filepath=str(OUT/'review.png'); bpy.ops.render.render(write_still=True)
for o in parts: o.hide_render=False
# Keep the editable source as independent construction parts, but batch runtime
# parts by toggle. Vertex groups survive joining and share the same skeleton.
batches=[]
source_count=len(parts)
source_bounds=[o.matrix_world@Vector(corner) for o in parts for corner in o.bound_box]
source_height=max(p.z for p in source_bounds)-min(p.z for p in source_bounds)
categories=sorted({o.get('attachment','body') for o in parts})
groups={category:[o for o in parts if o.get('attachment','body')==category] for category in categories}
for category,members in groups.items():
    bpy.ops.object.select_all(action='DESELECT')
    for o in members: o.select_set(True)
    bpy.context.view_layer.objects.active=members[0]
    bpy.ops.object.join()
    merged=bpy.context.object; merged.name='GEO-'+category; batches.append(merged)
bpy.ops.object.select_all(action='DESELECT'); rig.select_set(True)
for o in batches: o.select_set(True)
for track in rig.animation_data.nla_tracks: track.mute=False
bpy.ops.export_scene.gltf(filepath=str(OUT/'frontier-crew.glb'),export_format='GLB',use_selection=True,export_animations=True,export_animation_mode='NLA_TRACKS',export_force_sampling=True,export_skins=True,export_extras=True,export_yup=True)
raw=(OUT/'frontier-crew.glb').read_bytes(); size=struct.unpack_from('<I',raw,12)[0]; gltf=json.loads(raw[20:20+size])
assert len(gltf.get('skins',[]))>0
visor_material=next(m for m in gltf['materials'] if m['name']=='crew.visor')
assert visor_material.get('alphaMode')=='BLEND', 'Optical visor lost transparency'
assert visor_material.get('extensions',{}).get('KHR_materials_transmission',{}).get('transmissionFactor',0)>0
assert set(clip_names) == {a['name'] for a in gltf['animations']}
assert all('JOINTS_0' in p['attributes'] and 'WEIGHTS_0' in p['attributes'] for m in gltf['meshes'] for p in m['primitives'])
report={'generator':'scripts/build_crew_source.py','original':True,'referenceUse':'Visual proportion, studless construction and customization direction only; no third-party pixels or meshes reused.','bones':len(arm.bones),'sourceParts':source_count,'weightedMeshes':len(batches),'drawPrimitives':sum(len(m['primitives']) for m in gltf['meshes']),'animations':[{ 'name':a['name'],'channels':len(a['channels'])} for a in gltf['animations']],'materialRoles':list(materials),'attachments':categories,'outfits':list(LOOKS),'source':'assets/source/crew-astra.blend','paletteSource':'packages/content/src/crew-looks.json','opticalVisors':optical_parts,'weapons':'Original nonfunctional pistol/rifle pose fixtures, not combat items','tallestVariantHeightMeters':round(source_height,5),'headSurfaceScale':[1.22,1.18,1.16],'sourceSha256':hashlib.sha256((ROOT/'assets/source/crew-astra.blend').read_bytes()).hexdigest(),'runtimeSha256':hashlib.sha256(raw).hexdigest(),'forward':'Blender -Y; glTF/Babylon +Z after standard Y-up export; runtime rotates visual by pi to local -Z','scope':'Ten original presentation looks; authoritative inventory still owns equipped hand/back; no role or combat grants from appearance.'}
(OUT/'manifest.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report))
