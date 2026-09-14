"""CPU-only source/sampled visual acceptance; writes review images, no live assets."""
from pathlib import Path
import bpy,json,sys
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'scripts'))
from voxel_visual_surface import welded_surface,bevel_surface
revision=int(sys.argv[sys.argv.index('--')+1]) if '--' in sys.argv else 1
bpy.ops.wm.open_mainfile(filepath=str(ROOT/f'.runtime/art/interior-props/iteration-{revision}/source.blend'))
scene=bpy.context.scene
for obj in list(scene.objects):obj.location.x-=1.
data=json.loads((ROOT/'.runtime/art/interior-hydroponics-mesh.json').read_text())
if revision>=6:
    source=json.loads((ROOT/f'.runtime/art/interior-props/iteration-{revision}/samples.json').read_text())
    visual=source['visualSurface'];mapping={p['voxelMaterialId']:i for i,p in enumerate(data['palette']) if p}
    kept=[(f,m) for f,m in zip(data['faces'],data['materials']) if data['palette'][m]['voxelMaterialId'] not in (17,18,36,38)]
    ids=list(dict.fromkeys(i for face,_ in kept for i in face));remap={old:new for new,old in enumerate(ids)}
    data['vertices']=[data['vertices'][i] for i in ids]
    data['faces']=[[remap[i] for i in f] for f,_ in kept];data['materials']=[m for _,m in kept]
    offset=len(data['vertices']);data['vertices'].extend(visual['vertices'])
    data['faces'].extend([[i+offset for i in f] for f in visual['faces']]);data['materials'].extend(mapping[m] for m in visual['materials'])
verts,faces=welded_surface(data)
mesh=bpy.data.meshes.new('Sampled hydro');mesh.from_pydata(verts,[],faces);mesh.update()
obj=bpy.data.objects.new('GEO-sampled-hydro',mesh);scene.collection.objects.link(obj);obj.location.x=1.
colors=mesh.color_attributes.new(name='palette',type='FLOAT_COLOR',domain='CORNER')
for desc in data['palette'][1:]:mesh.materials.append(bpy.data.materials[desc['name']])
for face,material in zip(mesh.polygons,data['materials']):
    face.material_index=material-1
    for i in face.loop_indices:colors.data[i].color=(*data['palette'][material]['color'],1)
metrics=bevel_surface(obj,data['cellMeters'])
scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=48;scene.cycles.use_denoising=False
scene.world=bpy.data.worlds.new('review-world');scene.world.color=(.045,.055,.075)
# Neutral matte plinth receives contact shadows without competing with foliage.
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.02));floor=bpy.context.object
mat=bpy.data.materials.new('review-floor');mat.diffuse_color=(.08,.10,.14,1);floor.data.materials.append(mat)
for name,loc,power,size,color in [('key',(-3,-4,7),550,5,(1,.88,.73)),('fill',(3,1,5),400,4,(.64,.8,1))]:
    light=bpy.data.lights.new(name,'AREA');light.energy=power;light.shape='DISK';light.size=size;light.color=color
    item=bpy.data.objects.new(name,light);scene.collection.objects.link(item);item.location=loc;item.rotation_euler=(Vector((0,0,.7))-item.location).to_track_quat('-Z','Y').to_euler()
for x in [-1.,1.]:
    light=bpy.data.lights.new('grow-panel-review','AREA');light.energy=3;light.shape='RECTANGLE';light.size=1.1;light.size_y=.15;light.color=(1,.86,.62)
    item=bpy.data.objects.new('grow-panel-review',light);scene.collection.objects.link(item);item.location=(x,.09,1.49)
# Labels are honest about which representation is being compared.
for label,x in [('BLENDER SOURCE',-1.),('SAMPLED + AUTHORED LEAVES' if revision>=6 else 'SAMPLED + BEVEL',1.)]:
    bpy.ops.object.text_add(location=(x-.7,-.45,-.005),rotation=(0,0,0))
    obj=bpy.context.object;obj.data.body=label;obj.data.size=.075 if revision>=6 else .11
    obj.data.extrude=0;obj.data.materials.append(bpy.data.materials['MAT-interior-prop-27'])
cam=bpy.data.cameras.new('review-camera');camera=bpy.data.objects.new('review-camera',cam);scene.collection.objects.link(camera)
camera.location=(3.2,-6,4.0);camera.rotation_euler=(Vector((0,0,.8))-camera.location).to_track_quat('-Z','Y').to_euler();cam.type='ORTHO';cam.ortho_scale=4.25;scene.camera=camera
folder=ROOT/'output/playwright';folder.mkdir(parents=True,exist_ok=True)
for suffix,w,h in [('close',1280,800),('game-scale',512,320)]:
    scene.render.resolution_x=w;scene.render.resolution_y=h;scene.render.resolution_percentage=100
    scene.render.filepath=str(folder/f'hydroponics-iteration-{revision}-{suffix}.png');bpy.ops.render.render(write_still=True)
print(json.dumps(metrics))
