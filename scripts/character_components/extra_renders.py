import bpy,json,sys
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'.runtime/character-components/r002'
bpy.ops.wm.open_mainfile(filepath=str(OUT/'blender-source.blend'))
s=bpy.context.scene;s.render.engine='CYCLES';s.cycles.samples=32;s.cycles.use_denoising=False;s.render.film_transparent=True;s.render.resolution_percentage=100;s.render.image_settings.color_mode='RGBA'
parts=[o for o in bpy.data.objects if o.type=='MESH' and o.get('component_id')];m=json.loads((OUT/'manifest.json').read_text())
rig=next(o for o in bpy.data.objects if o.type=='ARMATURE')
for t in rig.animation_data.nla_tracks:t.mute=True
rig.animation_data.action=None
for p in rig.pose.bones:p.rotation_euler=(0,0,0);p.location=(0,0,0)
for hair in [h for h in m['hairStyles'] if h!='none']:
 selected=[o for o in parts if o.get('component_id')=='hair-'+hair]
 for o in parts:o.hide_render=o not in selected
 pts=[o.matrix_world@Vector(c) for o in selected for c in o.bound_box];lo=Vector([min(p[i] for p in pts) for i in range(3)]);hi=Vector([max(p[i] for p in pts) for i in range(3)]);center=(lo+hi)/2
 s.camera.location=center+Vector((3,-5,2.1));s.camera.rotation_euler=(center-s.camera.location).to_track_quat('-Z','Y').to_euler();s.camera.data.ortho_scale=max(hi-lo)*1.75
 s.render.resolution_x=384;s.render.resolution_y=384;s.render.filepath=str(OUT/f'hair-{hair}-only.png');bpy.ops.render.render(write_still=True)
keys={*m['baseGroups']['female'],*m['sets']['medic'].values()}
for o in parts:
 key=o['component_id'];region=key.split('-')[-1] if key.startswith('base-') else ''
 o.hide_render=key not in keys or region in ['torso','upperarms','forearms','hands','legs','feet']
s.camera.location=(0,0,6);s.camera.rotation_euler=(Vector((0,0,1))-s.camera.location).to_track_quat('-Z','Y').to_euler();s.camera.data.ortho_scale=1.3;s.render.resolution_x=640;s.render.resolution_y=640;s.render.filepath=str(OUT/'blender-top.png');bpy.ops.render.render(write_still=True)
