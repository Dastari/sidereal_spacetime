"""Editable original hard-surface engine; then sample its evaluated geometry."""
from pathlib import Path
import sys, json, math, hashlib
import bpy
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT/'scripts'))
from voxelize_blender import voxelize
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.scene.unit_settings.system = 'METRIC'
bpy.context.preferences.filepaths.save_version = 0

def mat(name, color, metal, rough, emission=0):
    result = bpy.data.materials.new(name); result.use_nodes = True
    p = result.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value = (*color, 1)
    p.inputs['Metallic'].default_value = metal; p.inputs['Roughness'].default_value = rough
    p.inputs['Emission Color'].default_value = (*color, 1)
    p.inputs['Emission Strength'].default_value = emission
    return result
paint = mat('Paint-porcelain', (.48,.51,.62), .38, .34)
steel = mat('Titanium', (.15,.19,.25), .85, .28)
dark = mat('Recess-indigo', (.022,.035,.065), .45, .45)
red = mat('Faction-burgundy', (.30,.018,.04), .35, .4)
brass = mat('Feed-copper', (.42,.19,.055), .8, .3)
cyan = mat('Emitter-ion-core', (.015,.48,.9), .05, .28, 5)
amber = mat('Emitter-warning', (.95,.28,.015), .05, .3, 2)

def finish(obj, name, material, bevel=0, priority=0):
    obj.name = 'GEO-'+name; obj.data.materials.append(material); obj['voxel_priority'] = priority
    if bevel:
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        mod = obj.modifiers.new('Machined edges', 'BEVEL'); mod.width=bevel; mod.segments=3
    return obj
def box(name, pos, size, material, bevel=.025, priority=0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=pos)
    obj=bpy.context.object; obj.dimensions=size
    return finish(obj,name,material,bevel,priority)
def cylinder(name, pos, radius, depth, material, priority=0):
    bpy.ops.mesh.primitive_cylinder_add(vertices=64, radius=radius, depth=depth, location=pos, rotation=(math.pi/2,0,0))
    return finish(bpy.context.object,name,material,.02,priority)
def lathe(name, profile, material):
    vertices=[(r*math.cos(a*math.tau/64),y,r*math.sin(a*math.tau/64)+1.05) for r,y in profile for a in range(64)]
    faces=[]
    for i in range(len(profile)):
        j=(i+1)%len(profile)
        for a in range(64): b=(a+1)%64; faces.append((i*64+a,i*64+b,j*64+b,j*64+a))
    mesh=bpy.data.meshes.new(name); mesh.from_pydata(vertices,[],faces); mesh.update()
    obj=bpy.data.objects.new('GEO-'+name,mesh); bpy.context.collection.objects.link(obj); mesh.materials.append(material)
    return obj

cylinder('pressure-vessel',(0,.45,1.05),.73,2.7,dark)
lathe('nozzle-bell',[(.68,-.7),(.75,-1.3),(1.02,-2.1),(.99,-2.3),(.83,-2.3),(.53,-1.35),(.50,-.7)],steel)
lathe('luminous-throat',[(.51,-1.2),(.55,-1.4),(.49,-1.47),(.43,-1.2)],cyan)['voxel_priority']=4
cylinder('core',(0,-.75,1.05),.50,.125,cyan,4)
for i,y in enumerate([-.7,.05,.8,1.55]):
    lathe('retaining-ring-'+str(i),[(.72,y-.09),(.85,y-.09),(.85,y+.09),(.72,y+.09)],steel)
for i in range(8):
    angle=i*math.tau/8
    x,z=.73*math.cos(angle),1.05+.73*math.sin(angle)
    plate=box('segmented-shroud-'+str(i),(x,.5,z),(.25,2.10,.40),red if i in (1,5) else paint,.05,2)
    plate.rotation_euler.y=-angle
    for j,y in enumerate([-.45,1.45]):
        box(f'locking-stud-{i}-{j}',(x*1.12,y,1.05+(z-1.05)*1.12),(.13,.16,.13),brass,.018,3)
for side in [-1,1]:
    cylinder('fuel-feed-'+str(side),(side*.93,.5,1.05),.105,1.8,brass,3)
    box('mount-'+str(side),(side*.7,1.75,.65),(.45,.5,.4),steel,.045)
    box('status-'+str(side),(side*.55,1.6,1.75),(.18,.30,.10),amber,.018,4)
box('upper-spine',(0,.55,1.85),(.35,2.6,.22),red,.045,2)
bpy.context.view_layer.update()
source=ROOT/'assets/source/engine_pod.blend'
bpy.ops.wm.save_as_mainfile(filepath=str(source))
out=ROOT/'assets/runtime/voxels/engine-pod-original.glb'
bpy.ops.export_scene.gltf(filepath=str(out),export_format='GLB',export_apply=True,export_cameras=False,export_lights=False,export_extras=True)
sampled=voxelize(list(bpy.context.scene.objects),2/32)
sampled['source']={'file':str(source.relative_to(ROOT)),'sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'blender':bpy.app.version_string}
(ROOT/'.runtime/art/engine-pod-samples.json').write_text(json.dumps(sampled))
print(json.dumps({'source':str(source),'solids':len(sampled['objects']),'voxels':len(sampled['cells']),'materials':len(sampled['palette'])-1}))
