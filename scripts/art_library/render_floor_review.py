"""Render saved authored floor meshes; retain high-detail bake source separately."""
from pathlib import Path
import json
import math
import sys
import shutil
import bpy
from mathutils import Vector

ROOT=Path(__file__).resolve().parents[2]
OUT=Path(sys.argv[sys.argv.index('--')+1])
bpy.ops.wm.open_mainfile(filepath=str(OUT/'floor-kit.blend'))
if (OUT/'component-board.png').exists():
    attempt=OUT/'attempts'/'initial-tight-framing'
    attempt.mkdir(parents=True,exist_ok=False)
    for p in OUT.rglob('*.png'):
        if 'attempts' in p.relative_to(OUT).parts or 'maps' in p.relative_to(OUT).parts:continue
        dest=attempt/p.relative_to(OUT);dest.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(p,dest)
    shutil.copyfile(OUT/'floor-kit.blend',attempt/'floor-kit.blend')
for collection in list(bpy.data.collections):
    if collection.name.startswith('REVIEW-BOARD'):
        for o in list(collection.objects):bpy.data.objects.remove(o,do_unlink=True)
        bpy.data.collections.remove(collection)
for o in list(bpy.data.objects):
    if o.name.startswith(('LIGHT-floor-','CAM-floor-')):bpy.data.objects.remove(o,do_unlink=True)
scene=bpy.context.scene
components=json.loads((OUT/'components.json').read_text())
masters=bpy.data.collections['RUNTIME-MASTERS']
scene.render.engine='CYCLES';scene.cycles.samples=24;scene.cycles.use_denoising=False
scene.render.film_transparent=True
scene.render.image_settings.color_mode='RGBA'
scene.render.resolution_percentage=100
review=bpy.data.collections.new('REVIEW-BOARD');scene.collection.children.link(review)
for i,c in enumerate(components):
    source=bpy.data.objects[c['node_prefix']]
    o=source.copy();o.data=source.data;review.objects.link(o)
    o.name='REVIEW-'+c['slug'];o.hide_render=False;o.hide_set(False)
    o.location=((i%4)*4.8,(i//4)*4.8,0)
    c['board_position_m']=list(o.location)

def aim(o,point):o.rotation_euler=(Vector(point)-o.location).to_track_quat('-Z','Y').to_euler()

for name,loc,power,size in [('key',(2,-3,12),1700,7),('fill',(-6,5,9),850,8)]:
    bpy.ops.object.light_add(type='AREA',location=loc);o=bpy.context.object;o.name='LIGHT-floor-'+name
    o.data.energy=power;o.data.shape='DISK';o.data.size=size;aim(o,(7,5,0))
bpy.ops.object.camera_add(location=(21,-19,22));camera=bpy.context.object;camera.name='CAM-floor-review'
camera.data.type='ORTHO';scene.camera=camera

def render(path,size,scale,loc,target):
    scene.render.resolution_x,scene.render.resolution_y=size
    camera.data.ortho_scale=scale;camera.location=loc;aim(camera,target)
    scene.render.filepath=str(path);bpy.ops.render.render(write_still=True)

render(OUT/'component-board.png',(1600,1120),23,(22,-20,23),(8,5.5,0))
render(OUT/'blender-top.png',(1600,1120),22,(8,5.5,25),(8,5.5,0))
for o in review.objects:o.hide_render=True
key=bpy.data.objects['LIGHT-floor-key'];fill=bpy.data.objects['LIGHT-floor-fill']
key.location=(1,-2,5);key.data.energy=600;key.data.size=4;aim(key,(1,1,0))
fill.location=(-3,2,4);fill.data.energy=250;fill.data.size=5;aim(fill,(1,1,0))
for c in components:
    o=bpy.data.objects[c['node_prefix']];o.hide_render=False;o.hide_set(False)
    hi=c['bounds']['max'];center=Vector((hi[0]/2,hi[1]/2,.09));span=max(hi[0],hi[1])
    distance=max(5,span*2)
    render(OUT/c['slug']/'cutout.png',(640,640),span*1.65,
      center+Vector((distance,-distance,distance)),center)
    render(OUT/c['slug']/'blender-top.png',(640,640),span*1.15,center+Vector((0,0,distance*2)),center)
    o.hide_render=True;o.hide_set(True)
for o in review.objects:o.hide_render=False
key.location=(2,-3,12);key.data.energy=1700;key.data.size=7;aim(key,(7,5,0))
fill.location=(-6,5,9);fill.data.energy=850;fill.data.size=8;aim(fill,(7,5,0))
camera.location=(22,-20,23);camera.data.ortho_scale=23;aim(camera,(8,5.5,0))
(OUT/'components.json').write_text(json.dumps(components,indent=2)+'\n')
# The revision's editable source opens on its review board with packed maps.
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'floor-kit.blend'))
print('FLOOR_RENDERS_COMPLETE',flush=True)
