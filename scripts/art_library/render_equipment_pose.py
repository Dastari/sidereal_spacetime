"""Reproduce the runtime solved skeleton in editable Blender source for source review."""
import bpy,json,sys
from pathlib import Path
from mathutils import Matrix,Vector
root=Path(__file__).resolve().parents[2];sys.path.insert(0,str(root/'scripts'))
from render_crew_looks import apply_look
tag=sys.argv[sys.argv.index('--')+1] if '--' in sys.argv else 'first'
asset=sys.argv[sys.argv.index('--')+2] if '--' in sys.argv and len(sys.argv)>sys.argv.index('--')+2 else 'carbine'
folder=root/'assets/art-library/designs/crew.animation.aim/revisions/r002'
bpy.ops.wm.open_mainfile(filepath=str(folder/'blender-source.blend'));bpy.context.preferences.filepaths.save_version=0
rig=next(o for o in bpy.data.objects if o.type=='ARMATURE');rig.animation_data.action=None
for track in rig.animation_data.nla_tracks:track.mute=True
state=json.loads((folder/('solved-pose.json' if asset=='carbine' else f'solved-{asset}.json')).read_text())
C=Matrix(((-1,0,0,0),(0,0,1,0),(0,1,0,0),(0,0,0,1)))
B=Matrix(((1,0,0,0),(0,0,1,0),(0,-1,0,0),(0,0,0,1)))
def matrix(values):return Matrix([[values[c*4+r] for c in range(4)] for r in range(4)])
for bone in rig.pose.bones:
 if bone.name in state['bones']:
  bone.matrix=C@matrix(state['bones'][bone.name]);bpy.context.view_layer.update()
parts=[o for o in bpy.data.objects if o.type=='MESH' and len(o.vertex_groups)>0];materials={m.name.replace('crew.',''):m for m in bpy.data.materials if m.name.startswith('crew.')};apply_look('marine',parts,materials)
with bpy.data.libraries.load(str(folder/'equipment/handheld-source.blend'),link=False) as (src,dst):dst.objects=[name for name in src.objects if name in [asset,'GEO-'+asset]]
for obj in dst.objects:bpy.context.collection.objects.link(obj)
weapon=bpy.data.objects[asset];weapon.matrix_world=C@matrix(state['equipment'])@B
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=16;scene.render.resolution_x=600;scene.render.resolution_y=700;scene.render.resolution_percentage=100;scene.render.film_transparent=True;scene.render.image_settings.color_mode='RGBA';scene.camera.data.ortho_scale=2.6
bpy.ops.wm.save_as_mainfile(filepath=str(folder/f'solved-review-{tag}.blend'))
for name,pos in [('front',(-3,-5,2.7)),('side',(-6,0,2.4)),('rear',(0,6,2.4))]:
 scene.camera.location=pos;scene.camera.rotation_euler=(Vector((0,0,1.03))-scene.camera.location).to_track_quat('-Z','Y').to_euler();scene.render.filepath=str(folder/('blender-'+tag+'-'+name+'.png'));bpy.ops.render.render(write_still=True)
