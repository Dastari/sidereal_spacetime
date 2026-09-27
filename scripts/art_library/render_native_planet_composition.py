"""Review the exact runtime-composed native geometry in Blender, without publishing."""
import bpy,json,sys
from pathlib import Path
from mathutils import Vector
out=Path(sys.argv[sys.argv.index('--')+1]);seed=int(sys.argv[sys.argv.index('--')+2]);data=json.loads((out/('composed-%d.json'%seed)).read_text())
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False);scene=bpy.context.scene
for index,batch in enumerate(data['batches']):
 role=data['materials'][index];m=bpy.data.materials.new(role['name']);m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*role['linearColor'],1);p.inputs['Roughness'].default_value=role['roughness'];p.inputs['IOR'].default_value=1.31
 v=batch['positions'];verts=[(v[i],-v[i+2],v[i+1]) for i in range(0,len(v),3)];ix=batch['indices'];faces=[(ix[i],ix[i+2],ix[i+1]) for i in range(0,len(ix),3)]
 me=bpy.data.meshes.new(role['name']);me.from_pydata(verts,[],faces);me.materials.append(m);ob=bpy.data.objects.new('GEO-composed-'+role['name'],me);scene.collection.objects.link(ob)
bpy.ops.object.camera_add(location=(2.45,-4.3,2.1));cam=bpy.context.object;cam.rotation_euler=(-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=2.65;scene.camera=cam
world=bpy.data.worlds.new('Cool weak fill');world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.07,.09,.22,1);world.node_tree.nodes['Background'].inputs[1].default_value=.3;scene.world=world
for name,loc,color,power,size in [('Sun-key',(-3,-4,6),(1,.95,.90),750,3),('Ice-backlight',(2,3,2),(.15,.62,1),800,2.5)]:
 bpy.ops.object.light_add(type='AREA',location=loc);ob=bpy.context.object;ob.name=name;ob.data.energy=power;ob.data.color=color;ob.data.shape='DISK';ob.data.size=size;ob.rotation_euler=(-ob.location).to_track_quat('-Z','Y').to_euler()
scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=32;scene.cycles.use_denoising=False;scene.render.resolution_x=768;scene.render.resolution_y=768;scene.render.resolution_percentage=100;scene.render.film_transparent=True;scene.view_settings.view_transform='AgX';scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA';scene.render.filepath=str(out/('composed-%d-blender.png'%seed));bpy.ops.wm.save_as_mainfile(filepath=str(out/('composed-%d.blend'%seed)));bpy.ops.render.render(write_still=True)
