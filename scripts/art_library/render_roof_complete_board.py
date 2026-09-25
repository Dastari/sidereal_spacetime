"""Additional full-kit board evidence. Does not mutate source or exports."""
from pathlib import Path
import bpy,sys,json,shutil
from mathutils import Vector
O=Path(sys.argv[sys.argv.index('--')+1]);bpy.ops.wm.open_mainfile(filepath=str(O/'roof-kit.blend'));s=bpy.context.scene
for ob in s.objects:ob.hide_render=True
components=json.loads((O/'components.json').read_text());board=[]
for i,c in enumerate(components):
 offset=Vector(((i%4)*7.,(i//4)*5.6,0))
 for name in c['objects']:
  src=bpy.data.objects[name];ob=src.copy();ob.data=src.data;s.collection.objects.link(ob);ob.location+=offset;ob.hide_render=False;ob.hide_set(False);board.append(ob)
verts=[ob.matrix_world@Vector(v) for ob in board for v in ob.bound_box]
bpy.context.view_layer.update();verts=[ob.matrix_world@Vector(v) for ob in board for v in ob.bound_box];lo=Vector([min(v[i] for v in verts) for i in range(3)]);hi=Vector([max(v[i] for v in verts) for i in range(3)]);target=(lo+hi)/2
for name,offset,power,size in [('key',(-12,-12,24),5200,15),('fill',(12,18,20),2600,18)]:
 bpy.ops.object.light_add(type='AREA',location=target+Vector(offset));ob=bpy.context.object;ob.name='LIGHT-board-'+name;ob.data.energy=power;ob.data.size=size;ob.rotation_euler=(target-ob.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add(location=target+Vector((15,-21,48)));camera=bpy.context.object;camera.data.type='ORTHO';camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler();s.camera=camera
s.render.resolution_x=1700;s.render.resolution_y=1900;s.render.resolution_percentage=100
rotation=camera.rotation_euler.to_matrix().transposed();projected=[rotation@(v-target) for v in verts];width=max(v.x for v in projected)-min(v.x for v in projected);height=max(v.y for v in projected)-min(v.y for v in projected);camera.data.ortho_scale=max(width,height*s.render.resolution_x/s.render.resolution_y)*1.18
# Fit against Blender's actual sensor-fit frame, including portrait aspect.
frame=camera.data.view_frame(scene=s);fw=max(v.x for v in frame)-min(v.x for v in frame);fh=max(v.y for v in frame)-min(v.y for v in frame)
mid=Vector(((max(v.x for v in projected)+min(v.x for v in projected))/2,(max(v.y for v in projected)+min(v.y for v in projected))/2,0));offset=camera.rotation_euler.to_matrix()@mid;camera.location+=offset;target+=offset;camera.data.ortho_scale*=max(width/fw,height/fh)*1.18
if (O/'component-board-complete.png').exists():
 a=O/'attempts'/'component-board-first-fit';a.mkdir(parents=True,exist_ok=True);shutil.move(str(O/'component-board-complete.png'),a/'component-board.png')
s.render.engine='CYCLES';s.cycles.samples=32;s.cycles.use_denoising=False;s.render.film_transparent=True;s.render.image_settings.color_mode='RGBA';s.render.filepath=str(O/'component-board-complete.png');bpy.ops.render.render(write_still=True)
(O/'component-board-complete-capture.json').write_text(json.dumps({'component_count':len(components),'source_unchanged':True,'source':'roof-kit.blend','image':'component-board-complete.png','renderer':'Blender4.3.2 Cycles32samples','camera':{'position':list(camera.location),'target':list(target),'orthographic_scale':camera.data.ortho_scale,'resolution':[1700,1900]},'projected_geometry_size_m':[width,height],'margin_factor':1.18},indent=2))
