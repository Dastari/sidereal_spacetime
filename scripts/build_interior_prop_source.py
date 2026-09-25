"""Editable miniature hydroponics. Closed Blender solids → immutable matter cells.

This authoring recipe makes the planter, soil, plumbing, grow bar and botanical
silhouettes; visual bevels are restored after solid sampling by the ship exporter.
"""
from pathlib import Path
import bpy, math, json, sys, hashlib
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'scripts'))
from voxelize_blender import voxelize
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.preferences.filepaths.save_version=0
bpy.context.scene.unit_settings.system='METRIC'
revision=int(sys.argv[sys.argv.index('--')+1]) if '--' in sys.argv else 6
materials={}
for key,color,metal,rough in [(3,'80939b',.8,.3),(6,'22343d',0,.68),(13,'393957',0,.38),(17,'457d42',0,.7),(18,'87bf63',0,.64),(27,'ced0df',0,.32),(31,'ffd7a1',0,.28),(34,'57bcec',0,.3),(36,'699a42',0,.65),(37,'584332',0,.88),(38,'a2b954',0,.67),(39,'b87752',0,.48)]:
    material=bpy.data.materials.new('MAT-interior-prop-'+str(key));material.use_nodes=True;material['voxel_material_id']=key
    rgb=tuple((int(color[i:i+2],16)/255/12.92 if int(color[i:i+2],16)/255<=.04045 else ((int(color[i:i+2],16)/255+.055)/1.055)**2.4) for i in (0,2,4))
    p=material.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*rgb,1)
    p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough
    if key in (31,34):p.inputs['Emission Color'].default_value=(*rgb,1);p.inputs['Emission Strength'].default_value=2.5
    materials[key]=material

def finish(obj,name,key,bevel=0):
    obj.name='GEO-hydro-'+name;obj.data.materials.append(materials[key]);obj['voxel_priority']=10 if key in (17,18,36,38) else 5 if key in (31,34,37) else 0
    if bevel:
        m=obj.modifiers.new('Molded polymer edge','BEVEL');m.width=bevel;m.segments=2
    return obj

def box(name,x,y,z,w,d,h,key,bevel=.015):
    bpy.ops.mesh.primitive_cube_add(size=1,location=(x,y,z+h/2));obj=bpy.context.object;obj.dimensions=(w,d,h)
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    return finish(obj,name,key,bevel)

def cylinder(name,at,radius,depth,key,vertices=12):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices,radius=radius,depth=depth,location=at)
    return finish(bpy.context.object,name,key,.008)

def pipe(name,start,end,radius,key):
    direction=Vector(end)-Vector(start)
    obj=cylinder(name,(Vector(start)+Vector(end))/2,radius,direction.length,key,10)
    obj.rotation_euler=direction.to_track_quat('Z','Y').to_euler();return obj

def leaf(name,start,end,width,key):
    direction=Vector(end)-Vector(start)
    # A thick, pointed lance, six-sided elliptical rings instead of cubic foliage.
    verts=[]
    for t,r in [(0,.12),(.28,1),(.67,.82),(1,.06)]:
        for i in range(6):
            a=i*math.tau/6
            verts.append((math.cos(a)*width*r/2,math.sin(a)*(.13 if revision>=2 else .10)*r/2,t*direction.length))
    faces=[tuple(reversed(range(6))),tuple(range(18,24))]
    for j in range(3):
        for i in range(6):faces.append((j*6+i,j*6+(i+1)%6,(j+1)*6+(i+1)%6,(j+1)*6+i))
    mesh=bpy.data.meshes.new(name);mesh.from_pydata(verts,[],faces);mesh.update()
    obj=bpy.data.objects.new('GEO-'+name,mesh);bpy.context.collection.objects.link(obj)
    obj.location=start;obj.rotation_euler=direction.to_track_quat('Z','Y').to_euler();finish(obj,name,key)

# Exact local footprint ±0.75 x ±0.3125. Base sits at the existing 0.25 m floor.
box('recessed-base',0,0,0,1.4375,.5625,.1875,13)
for x in [-.625,.625]:box('foot-'+str(x),x,0,0,.1875,.5,.0625,6,.006)
box('front-rail',0,-.25,.1875,1.5,.125,.1875,27)
box('back-rail',0,.25,.1875,1.5,.125,.1875,27)
for x in [-.6875,.6875]:box('end-cap-'+str(x),x,0,.1875,.125,.375,.1875,27)
box('soil-bed',-.125,0,.1875,1.0625,.375,.125,37,.006)
for x in [-.5,-.0625,.375]:
    box('front-insert-'+str(x),x,-.289,.0625,.3125,.047,.125,27,.005)
# Rear-supported grow bar keeps the planted area open and survives sampling.
for x in [-.65625,.65625]:
    box('grow-upright-'+str(x),x,.21875,.3125,.0625,.125,1.25,13,.008)
    box('upright-clip-'+str(x),x,.21875,.875,.125,.125,.125,27,.008)
box('grow-bar-dark',0,.1875,1.5,1.5,.25,.1875,13)
box('grow-bar-pale',0,.15625,1.5625,1.5,.3125,.125,27)
box('warm-diffuser',0,.09375,1.5,1.125,.1875,.0625,31,.005)
for x in [-.625,.625]:box('grow-bar-end-'+str(x),x,.15625,1.4375,.25,.3125,.1875,27)
for x in [-.375,0,.375]:box('grow-bar-cooling-'+str(x),x,.1875,1.6875,.25,.1875,.0625,13,.006)
# Three separate cultivated plants, with terra-cotta pots and visible soil wells.
for plant,(x,height,phase) in enumerate([(-.46875,.62,.15),(-.09375,.84,1.1),(.28125,.55,.6)]):
    cylinder('pot-'+str(plant),(x,-.03125,.34375),.145,.1875,39)
    cylinder('soil-'+str(plant),(x,-.03125,.4375),.12,.0625,37)
    pipe('stem-'+str(plant),(x,-.03125,.4375),(x,-.03125,.4375+height),.042,17)
    for level in range(3):
        z=.53+height*level*.24
        for side in [-1,1]:
            angle=phase+level*.8+(0 if side==1 else math.pi)
            length=(.32 if plant!=1 else .37) if revision>=2 else (.25 if plant!=1 else .29)
            end=(x+math.cos(angle)*length,-.03125+math.sin(angle)*min(length,.19),z+.20)
            # Clamp leaves to the existing tray footprint, keeping visible gaps.
            end=(max(-.67,min(.55,end[0])),max(-.21,min(.16,end[1])),end[2])
            leaf(f'leaf-{plant}-{level}-{side}',(x,-.03125,z),end,(.22 if level<2 else .18) if revision>=2 else (.15 if level<2 else .13),[36,18,38][(level+plant)%3])
    leaf('crown-'+str(plant),(x,-.03125,.4375+height-.12),(x+.025,-.03125,.4375+height+.11),.18 if revision>=2 else .13,18)
if revision>=2:
    # Diagonal side shoots make each plant a cultivated cluster, not a cross.
    for plant,x in enumerate([-.46875,-.09375,.28125]):
        start=(x,-.03125,.52)
        end=(x+.11,-.11,.85 if plant!=1 else .99)
        pipe('side-stem-'+str(plant),start,end,.042,17)
        leaf('side-shoot-'+str(plant),end,(x+.16,-.12,end[2]+.23),.18,36)
        leaf('front-leaf-'+str(plant),(x,-.03125,.68),(x-.08,-.23,.90),.21,18)
    # Front service recesses, bright retainers and a readable inset controller.
    for x in [-.5,-.0625,.375]:
        box('service-inset-'+str(x),x,-.28125,.0625,.1875,.0625,.0625,13,.003)
    for x in [-.65625,.65625]:
        box('retainer-'+str(x),x,-.265625,.0625,.0625,.09375,.1875,3,.005)
# Feed unit fits within the right end; opaque vessel preserves the sampler contract.
cylinder('feed-vessel',(.5625,-.03125,.625),.09375,.4375,27)
cylinder('feed-cap',(.5625,-.03125,.875),.09375,.0625,3)
pipe('feed-pipe-down',(.5625,.0625,.625),(.5625,.0625,.34375),.05,3)
pipe('feed-pipe-run',(.5625,.0625,.34375),(.375,.0625,.34375),.05,3)
box('control-housing',.5625,-.171875,.46875,.25,.15625,.1875,13)
box('control-display',.59375,-.28125,.5,.0625 if revision>=2 else .125,.0625,.0625,34,.004)
# Canonical authored source is retained. Per-iteration copies are local evidence.
source=ROOT/'assets/source/interior_hydroponics.blend'
bpy.ops.wm.save_as_mainfile(filepath=str(source))
stage=ROOT/f'.runtime/art/interior-props/iteration-{revision}';stage.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=str(stage/'source.blend'),copy=True)
pitch=.03125 if revision==4 else .0625
sampled=voxelize(list(bpy.context.scene.objects),pitch)
# Retain evaluated botanical surfaces separately from their immutable samples.
# This is explicitly a presentation refinement, not a higher-detail matter claim.
visual={'kind':'authored-botanical-surface','vertices':[],'faces':[],'materials':[]}
for obj in bpy.context.scene.objects:
    if obj.type!='MESH' or int(obj.data.materials[0].get('voxel_material_id',0)) not in (17,18,36,38):continue
    evaluated=obj.evaluated_get(bpy.context.evaluated_depsgraph_get());mesh=evaluated.to_mesh()
    offset=len(visual['vertices'])
    visual['vertices'].extend([list(evaluated.matrix_world@v.co) for v in mesh.vertices])
    visual['faces'].extend([[offset+i for i in p.vertices] for p in mesh.polygons])
    visual['materials'].extend([int(mesh.materials[p.material_index]['voxel_material_id']) for p in mesh.polygons])
    evaluated.to_mesh_clear()
sampled['visualSurface']=visual
(stage/'samples.json').write_text(json.dumps(sampled,separators=(',',':')))
folder=ROOT/'assets/runtime/voxels';folder.mkdir(parents=True,exist_ok=True)
out=folder/'interior-props.voxels.json';out.write_text(json.dumps({'hydroponics':sampled},separators=(',',':')))
original=folder/'interior-hydroponics-original.glb'
bpy.ops.export_scene.gltf(filepath=str(original),export_format='GLB',export_apply=True,export_cameras=False,export_lights=False)
manifest={'schema':'sidereal.interior-prop-source.v1','cellMeters':pitch,'occupied':len(sampled['cells']),'outputs':{str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest() for p in [source,out,original]},'tools':{str(p):hashlib.sha256((ROOT/p).read_bytes()).hexdigest() for p in ['scripts/build_interior_prop_source.py','scripts/voxelize_blender.py']}}
(folder/'interior-props-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(json.dumps({'hydroponics_cells':len(sampled['cells']),'revision':revision,'objects':len(sampled['objects']) if 'objects' in sampled else len(bpy.context.scene.objects)}))
