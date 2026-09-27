"""Render the preserved native crater unit in isolation; no live publication."""
import bpy,sys
from pathlib import Path
from mathutils import Vector
out=Path(sys.argv[sys.argv.index('--')+1]);bpy.ops.wm.open_mainfile(filepath=str(out/'kit.blend'));scene=bpy.context.scene
center=Vector((5.4,0,-.02))
for ob in scene.objects:
 ob.hide_render=not(ob.type=='MESH' and ob.name.startswith('GEO-kit-4-'))
bpy.ops.object.camera_add(location=center+Vector((1.15,-1.6,1.4)));cam=bpy.context.object;cam.rotation_euler=(center-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=1.65;scene.camera=cam
world=bpy.data.worlds.new('Weak cold hero fill');world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.07,.09,.22,1);world.node_tree.nodes['Background'].inputs[1].default_value=.3;scene.world=world
for name,loc,color,power,size in [('Sun-key',(-3,-4,6),(1,.95,.9),750,3),('Ice-backlight',(2,3,2),(.15,.62,1),800,2.5)]:
 bpy.ops.object.light_add(type='AREA',location=center+Vector(loc));ob=bpy.context.object;ob.name=name;ob.data.energy=power;ob.data.color=color;ob.data.shape='DISK';ob.data.size=size;ob.rotation_euler=(center-ob.location).to_track_quat('-Z','Y').to_euler()
scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=64;scene.cycles.use_denoising=False;scene.render.resolution_x=768;scene.render.resolution_y=768;scene.render.resolution_percentage=100;scene.render.film_transparent=True;scene.view_settings.view_transform='AgX';scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA';scene.render.filepath=str(out/'hero-crater-blender.png');bpy.ops.wm.save_as_mainfile(filepath=str(out/'hero-crater.blend'));bpy.ops.render.render(write_still=True)
