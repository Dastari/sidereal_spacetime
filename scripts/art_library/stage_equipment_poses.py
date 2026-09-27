"""Stage editable controllers and aim actions without touching canonical source/exports.
Invoked by run_equipment_poses.py using dev.toml's Blender. No publication.
"""
import bpy, json, math, hashlib, sys
from pathlib import Path
from mathutils import Vector, Quaternion
ROOT=Path(__file__).resolve().parents[2]
OUT=Path(sys.argv[sys.argv.index('--')+1])
if (OUT/'blender-source.blend').exists(): raise RuntimeError('Immutable revision output already exists')
bpy.ops.wm.open_mainfile(filepath=str(ROOT/'assets/source/crew-astra.blend'))
bpy.context.preferences.filepaths.save_version=0
rig=next(o for o in bpy.data.objects if o.type=='ARMATURE')
bpy.context.view_layer.objects.active=rig
bpy.ops.object.mode_set(mode='EDIT')
for side,sign in [('R',-1),('L',1)]:
 for name,location in [('ShoulderPocket',(sign*.26,-.16,1.2)),('ElbowPole',(sign*.7,-.2,.9)),('HandTarget',(sign*.3,-.35,1.15)),('EyeReference',(sign*.10,-.24,1.5))]:
  b=rig.data.edit_bones.new('CTRL-'+name+'.'+side);b.head=location;b.tail=Vector(location)+Vector((0,0,.08));b.use_deform=False
bpy.ops.object.mode_set(mode='OBJECT')
# Controls are editable authoring aids. Runtime uses analytical IK on the original 16 bones.
for side in ['R','L']:
 c=rig.pose.bones['forearm.'+side].constraints.new('IK');c.name='POSE-ArmIK-'+side;c.target=rig;c.subtarget='CTRL-HandTarget.'+side;c.pole_target=rig;c.pole_subtarget='CTRL-ElbowPole.'+side;c.chain_count=2;c.use_stretch=False;c.influence=0
 c=rig.pose.bones['upper_arm.'+side].constraints.new('LIMIT_ROTATION');c.name='POSE-ShoulderLimits';c.owner_space='LOCAL';c.use_limit_x=True;c.min_x=-2.6;c.max_x=2.6;c.influence=0
profiles=['RIFLE','LONG_RIFLE','PISTOL_TWO_HAND','PISTOL_ONE_HAND','FLASHLIGHT','HANDHELD_DEVICE','TOOL']
original=rig.animation_data.action if rig.animation_data else None
rest={b.name:(b.location.copy(),b.rotation_quaternion.copy(),b.scale.copy(),b.rotation_euler.copy(),b.rotation_mode) for b in rig.pose.bones}
samples={}
for profile in profiles:
 samples[profile]={}
 for yaw in [-45,0,45]:
  for pitch in [-60,0,60]:
   action=bpy.data.actions.new(f'{profile}.Aim.{yaw}.{pitch}');rig.animation_data.action=action
   for b in rig.pose.bones:
    b.rotation_mode='XYZ';b.location=(0,0,0);b.rotation_quaternion=Quaternion();b.scale=(1,1,1)
   spine=rig.pose.bones['spine'];spine.rotation_quaternion=Quaternion((0,0,1),math.radians(yaw)*.15) @ Quaternion((1,0,0),math.radians(pitch)*-.2)
   rig.pose.bones['head'].rotation_quaternion=Quaternion((0,0,1),-math.radians(yaw)*.15) @ Quaternion((1,0,0),math.radians(pitch)*-.15)
   rig.pose.bones['pelvis'].location.z=-.025
   # Ready arm shape is authored; runtime retargets precise item socket contacts.
   for side,sign in [('R',-1),('L',1)]:
    active=side=='R' or profile in ['RIFLE','LONG_RIFLE','PISTOL_TWO_HAND']
    rig.pose.bones['upper_arm.'+side].rotation_quaternion=Quaternion((1,0,0),(-.85 if active else -.2)-math.radians(pitch)*.35) @ Quaternion((0,1,0),sign*.16)
    rig.pose.bones['forearm.'+side].rotation_quaternion=Quaternion((1,0,0),-.55 if active else -.35)
   samples[profile][f'{yaw},{pitch}']={b.name:list(b.rotation_quaternion) for b in rig.pose.bones if b.name in ['spine','head','upper_arm.R','upper_arm.L','forearm.R','forearm.L']}
   for b in rig.pose.bones:
    if b.bone.use_deform:
     for frame in [1,2]:
      b.rotation_euler=b.rotation_quaternion.to_euler();b.keyframe_insert('rotation_euler',frame=frame,group=b.name);b.keyframe_insert('location',frame=frame,group=b.name)
   action.use_fake_user=True
   track=rig.animation_data.nla_tracks.new();track.name=action.name;track.strips.new(action.name,1,action);track.mute=True
rig.animation_data.action=original
for name,(loc,rot,scale,euler,mode) in rest.items():
 b=rig.pose.bones[name];b.location=loc;b.rotation_quaternion=rot;b.scale=scale;b.rotation_euler=euler;b.rotation_mode=mode
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'blender-source.blend'))
# Batch only the runtime copy by existing visibility slot; editable parts stay in source.
parts=[o for o in bpy.data.objects if o.type=='MESH' and len(o.vertex_groups)>0]
groups={}
for o in parts:
 o.hide_set(False);o.hide_render=False;groups.setdefault(o.get('attachment','body'),[]).append(o)
batches=[]
for category,members in groups.items():
 bpy.ops.object.select_all(action='DESELECT')
 for o in members:o.select_set(True)
 bpy.context.view_layer.objects.active=members[0];bpy.ops.object.join();o=bpy.context.object;o.name='GEO-'+category;batches.append(o)
bpy.ops.object.select_all(action='DESELECT');rig.select_set(True)
for o in batches:o.select_set(True)
for track in rig.animation_data.nla_tracks:track.mute=False
rig.animation_data.action=None
# Export only deformation bones; retain controller/deformation distinction in source.
bpy.ops.export_scene.gltf(filepath=str(OUT/'crew-poses.glb'),export_format='GLB',export_animations=True,export_def_bones=True,export_extras=True,export_cameras=False,export_lights=False,export_animation_mode='NLA_TRACKS',use_selection=True,export_force_sampling=True)
(OUT/'aim-samples.json').write_text(json.dumps({'version':1,'space':'Blender bone-local quaternion WXYZ; runtime conversion required','samples':samples},indent=2))
print('STAGED',OUT)
