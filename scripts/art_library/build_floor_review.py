"""Author a low-geometry modular floor and bake its surface relief in Blender.

No source reference raster is modified. High-detail editable Blender geometry
and shader microrelief are baked to a reusable tangent normal/material atlas.
Only the perimeter silhouette remains in the runtime mesh.
"""
from pathlib import Path
import hashlib
import json
import math
import sys

import bpy
import numpy as np
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
OUT = Path(sys.argv[sys.argv.index('--') + 1])
MAPS = OUT / 'maps'
MAPS.mkdir(exist_ok=True)
REV = int(OUT.name[1:])
DESIGN = 'shipyard.floor.mapped-deck-kit'
PITCH = 0.0625
THICKNESS = 0.1875
RES = 1024
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.preferences.filepaths.save_version = 0
scene = bpy.context.scene
scene.unit_settings.system = 'METRIC'
scene.unit_settings.scale_length = 1
scene.render.engine = 'CYCLES'
scene.cycles.device = 'CPU'
scene.cycles.samples = 16
scene.cycles.use_denoising = False
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGBA'
scene.render.image_settings.color_depth = '8'
scene.view_settings.view_transform = 'AgX'
scene.render.bake.margin = 12
scene.render.bake.use_selected_to_active = True
scene.render.bake.cage_extrusion = 0.06
scene.render.bake.max_ray_distance = 0.12
scene.render.bake.normal_space = 'TANGENT'
scene.render.bake.normal_r = 'POS_X'
scene.render.bake.normal_g = 'POS_Y'
scene.render.bake.normal_b = 'POS_Z'
scene.world = bpy.data.worlds.new('Neutral floor review world')
scene.world.use_nodes = True
scene.world.node_tree.nodes['Background'].inputs['Color'].default_value = (.18, .21, .27, 1)
scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value = .35


def material(name, color, roughness=.35, metallic=0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    p = m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value = (*color, 1)
    p.inputs['Roughness'].default_value = roughness
    p.inputs['Metallic'].default_value = metallic
    p.inputs['IOR'].default_value = 1.46
    p.inputs['Coat Weight'].default_value = .08
    p.inputs['Coat Roughness'].default_value = .20
    m.use_backface_culling = True
    return m


shell = material('MAT-high-polymer-pale', (.43, .46, .55), .34)
shell2 = material('MAT-high-polymer-cool', (.37, .41, .50), .37)
seals = material('MAT-high-indigo-seam', (.035, .044, .073), .48)
hardware = material('MAT-high-fastener-steel', (.17, .20, .24), .34, .75)
amber = material('MAT-high-amber-paint', (.65, .29, .045), .38)
for m in [shell, shell2]:
    nodes, links = m.node_tree.nodes, m.node_tree.links
    noise = nodes.new('ShaderNodeTexNoise')
    noise.inputs['Scale'].default_value = 290
    noise.inputs['Detail'].default_value = 1.5
    coord = nodes.new('ShaderNodeTexCoord')
    links.new(coord.outputs['Position'] if 'Position' in coord.outputs else coord.outputs['Generated'], noise.inputs['Vector'])
    bump = nodes.new('ShaderNodeBump')
    bump.inputs['Distance'].default_value = .00020
    bump.inputs['Strength'].default_value = .10
    links.new(noise.outputs['Fac'], bump.inputs['Height'])
    links.new(bump.outputs['Normal'], nodes.get('Principled BSDF').inputs['Normal'])

high = bpy.data.collections.new('BAKE-SOURCE-editable-relief')
scene.collection.children.link(high)
masters = bpy.data.collections.new('RUNTIME-MASTERS')
scene.collection.children.link(masters)


def move_to(obj, collection):
    for c in list(obj.users_collection):
        c.objects.unlink(obj)
    collection.objects.link(obj)


def box(name, lo, hi, mat, bevel=0, collection=high):
    bpy.ops.mesh.primitive_cube_add(size=1, location=[(a+b)/2 for a,b in zip(lo,hi)])
    o = bpy.context.object
    o.name = 'GEO-' + name
    o.dimensions = [b-a for a,b in zip(lo,hi)]
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    o.data.materials.append(mat)
    if bevel:
        b = o.modifiers.new('Authored source edge radius', 'BEVEL')
        b.width = bevel
        b.segments = 3
        n = o.modifiers.new('Weighted source normals', 'WEIGHTED_NORMAL')
        n.keep_sharp = True
    move_to(o, collection)
    return o


# The actual source relief is shallow: 12 mm plate rise, 7 mm chamfer,
# 2 mm fastener rise and fine grip bars. It is not exported as runtime geometry.
box('bake-sealed-base', (-.12,-.12,-.015), (2.12,2.12,.0005), seals)
for ix in range(2):
    for iy in range(2):
        x, y = ix, iy
        box(f'bake-panel-{ix}-{iy}', (x+.014,y+.014,-.008), (x+.986,y+.986,.012), shell if (ix+iy)%2==0 else shell2, .007)
        for dx in [.082,.918]:
            for dy in [.082,.918]:
                bpy.ops.mesh.primitive_cylinder_add(vertices=12, radius=.021, depth=.002, location=(x+dx,y+dy,.013))
                o=bpy.context.object;o.name=f'GEO-bake-fastener-{ix}-{iy}-{dx}-{dy}'
                o.data.materials.append(hardware);move_to(o,high)
                b=o.modifiers.new('Screw edge bevel','BEVEL');b.width=.001;b.segments=2
                box('bake-screw-slot', (x+dx-.011,y+dy-.002,.0141),(x+dx+.011,y+dy+.002,.0142),seals)
        # Tiny grip cuts read in a grazing normal response, not as raised cubes.
        for j in range(5):
            px=x+.36+j*.055
            box(f'bake-grip-{ix}-{iy}-{j}',(px,y+.08,.0121),(px+.021,y+.205,.014),shell2,.001)
        for dx in [.12,.76]:
            box('bake-painted-registration', (x+dx,y+.026,.0122),(x+dx+.12,y+.046,.0124),amber)

# True UV bake target, one 2 m period. The authored geometry source is retained.
mesh=bpy.data.meshes.new('MESH-floor-bake-target')
mesh.from_pydata([(0,0,0),(2,0,0),(2,2,0),(0,2,0)],[],[(0,1,2,3)])
mesh.uv_layers.new(name='UVMap')
for i,uv in enumerate([(0,0),(1,0),(1,1),(0,1)]):mesh.uv_layers.active.data[i].uv=uv
target=bpy.data.objects.new('GEO-floor-bake-target',mesh);scene.collection.objects.link(target)
target_mat=material('MAT-bake-target',(.5,.5,.5))
target.data.materials.append(target_mat)
source_materials=list({m for o in high.objects for m in o.data.materials})


def save_image(im, path):
    im.filepath_raw=str(path);im.file_format='PNG';im.save();im.pack()


def bake(name, kind, emission=None):
    im=bpy.data.images.new('TEX-floor-'+name,width=RES,height=RES,alpha=False,is_data=name!='basecolor')
    im.colorspace_settings.name='sRGB' if name=='basecolor' else 'Non-Color'
    tex=target_mat.node_tree.nodes.new('ShaderNodeTexImage');tex.image=im
    target_mat.node_tree.nodes.active=tex
    restore=[]
    if emission:
        for m in source_materials:
            nodes,links=m.node_tree.nodes,m.node_tree.links
            output=nodes.get('Material Output');socket=output.inputs['Surface']
            prior=socket.links[0].from_socket
            e=nodes.new('ShaderNodeEmission')
            if emission=='height':
                g=nodes.new('ShaderNodeNewGeometry');s=nodes.new('ShaderNodeSeparateXYZ')
                links.new(g.outputs['Position'],s.inputs['Vector'])
                mul=nodes.new('ShaderNodeMath');mul.operation='MULTIPLY';mul.inputs[1].default_value=1/.016
                links.new(s.outputs['Z'],mul.inputs[0]);links.new(mul.outputs[0],e.inputs['Color'])
                extra=[g,s,mul]
            else:
                p=nodes.get('Principled BSDF');v=p.inputs['Metallic'].default_value
                e.inputs['Color'].default_value=(v,v,v,1);extra=[]
            links.new(e.outputs[0],socket);restore.append((m,prior,e,extra))
    bpy.ops.object.select_all(action='DESELECT')
    for o in high.objects:o.select_set(True)
    target.select_set(True);bpy.context.view_layer.objects.active=target
    scene.render.bake.use_pass_direct=False;scene.render.bake.use_pass_indirect=False;scene.render.bake.use_pass_color=True
    print('BAKE_START',name,flush=True)
    bpy.ops.object.bake(type=kind)
    save_image(im,MAPS/(name+'.png'))
    target_mat.node_tree.nodes.remove(tex)
    for m,prior,e,extra in restore:
        m.node_tree.links.new(prior,m.node_tree.nodes.get('Material Output').inputs['Surface'])
        for n in [e,*extra]:m.node_tree.nodes.remove(n)
    return im


maps={name:bake(name,kind,emit) for name,kind,emit in [
    ('basecolor','DIFFUSE',None),('normal','NORMAL',None),('roughness','ROUGHNESS',None),
    ('ao','AO',None),('height','EMIT','height'),('metallic','EMIT','metallic')]}
# Standard glTF channel packing: R occlusion, G roughness, B metallic.
data=np.ones((RES*RES,4),dtype=np.float32)
for channel,key in enumerate(['ao','roughness','metallic']):
    pixels=np.empty(RES*RES*4,dtype=np.float32);maps[key].pixels.foreach_get(pixels)
    data[:,channel]=pixels.reshape(-1,4)[:,0]
orm=bpy.data.images.new('TEX-floor-ORM',width=RES,height=RES,alpha=False,is_data=True)
orm.colorspace_settings.name='Non-Color';orm.pixels.foreach_set(data.ravel());save_image(orm,MAPS/'orm.png');maps['orm']=orm
bpy.data.objects.remove(target,do_unlink=True)
for o in high.objects:o.hide_render=True;o.hide_set(True)
high.hide_render=True

top=material('MAT-deck-polymer-mapped',(.5,.5,.5))
nodes,links=top.node_tree.nodes,top.node_tree.links;p=nodes.get('Principled BSDF')
for key in ['basecolor','normal','orm']:
    tex=nodes.new('ShaderNodeTexImage');tex.image=maps[key];tex.extension='REPEAT';tex.label=key
    if key=='basecolor':links.new(tex.outputs['Color'],p.inputs['Base Color'])
    elif key=='normal':
        n=nodes.new('ShaderNodeNormalMap');n.inputs['Strength'].default_value=.8
        links.new(tex.outputs['Color'],n.inputs['Color']);links.new(n.outputs['Normal'],p.inputs['Normal'])
    else:
        sep=nodes.new('ShaderNodeSeparateColor');links.new(tex.outputs['Color'],sep.inputs['Color'])
        links.new(sep.outputs['Green'],p.inputs['Roughness']);links.new(sep.outputs['Blue'],p.inputs['Metallic'])
        group=bpy.data.node_groups.new('glTF Material Output','ShaderNodeTree')
        group.interface.new_socket(name='Occlusion',in_out='INPUT',socket_type='NodeSocketFloat')
        gn=nodes.new('ShaderNodeGroup');gn.node_tree=group;links.new(sep.outputs['Red'],gn.inputs['Occlusion'])
edge=material('MAT-deck-indigo-edge',(.055,.068,.11),.41)

SHAPES=[
 ('square-2m','Square / 2 × 2 m',[(0,0),(2,0),(2,2),(0,2)]),
 ('half-2x1','Half / 2 × 1 m',[(0,0),(2,0),(2,1),(0,1)]),
 ('quarter-1m','Quarter / 1 × 1 m',[(0,0),(1,0),(1,1),(0,1)]),
 ('strip-4x1','Long strip / 4 × 1 m',[(0,0),(4,0),(4,1),(0,1)]),
 ('triangle-45','Triangle / 2 × 2 m / 45°',[(0,0),(2,0),(0,2)]),
 ('triangle-long-left','Long triangle left / 4 × 2 m',[(0,0),(4,0),(0,2)]),
 ('triangle-long-right','Long triangle right / 4 × 2 m',[(0,0),(4,0),(4,2)]),
 ('triangle-slim-left','Slender triangle left / 4 × 1 m',[(0,0),(4,0),(0,1)]),
 ('triangle-slim-right','Slender triangle right / 4 × 1 m',[(0,0),(4,0),(4,1)]),
 ('corner-clipped','Clipped corner / 2 × 2 m',[(0,0),(2,0),(2,1),(1,2),(0,2)]),
 ('taper-4m','Taper / 4 m / 2 to 1 m',[(0,0),(2,0),(1.5,4),(.5,4)]),
 ('triangle-1m','Small triangle / 1 × 1 m / 45°',[(0,0),(1,0),(0,1)]),
]


def area(xy):
    return .5*sum(xy[i][0]*xy[(i+1)%len(xy)][1]-xy[(i+1)%len(xy)][0]*xy[i][1] for i in range(len(xy)))


def prism(slug,label,xy):
    assert area(xy)>0
    n=len(xy)
    verts=[(x,y,z) for z in [0,THICKNESS] for x,y in xy]
    faces=[tuple(reversed(range(n))),tuple(range(n,2*n))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
    mesh=bpy.data.meshes.new('MESH-floor-'+slug);mesh.from_pydata(verts,[],faces);mesh.update()
    uv=mesh.uv_layers.new(name='UVMap')
    for f in mesh.polygons:
        f.material_index=0 if f.index==1 else 1
        for j in f.loop_indices:
            v=mesh.vertices[mesh.loops[j].vertex_index].co
            # Constant 512 px/metre: a 4 m piece repeats the 2 m atlas twice.
            uv.data[j].uv=(v.x/2,v.y/2) if f.index==1 else (v.x/2,v.z/2)
    obj=bpy.data.objects.new('GEO-floor-'+slug,mesh);masters.objects.link(obj)
    mesh.materials.append(top);mesh.materials.append(edge)
    b=obj.modifiers.new('Real perimeter chamfer only','BEVEL');b.width=.004;b.segments=2;b.affect='EDGES'
    b.material=1
    w=obj.modifiers.new('Weighted perimeter normals','WEIGHTED_NORMAL');w.keep_sharp=True
    obj.modifiers.new('Explicit triangles for tangent export','TRIANGULATE')
    obj['surface_detail']='2 m Blender-baked normal/roughness/AO atlas; no raised runtime panel details'
    obj['top_surface_z_m']=THICKNESS
    obj['design_id']=DESIGN
    obj['revision']=REV
    return obj


def export(objects,path):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objects:o.hide_set(False);o.select_set(True)
    bpy.context.view_layer.objects.active=objects[0]
    bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,
        export_apply=True,export_yup=True,export_materials='EXPORT',export_tangents=True)


components=[]
for slug,label,xy in SHAPES:
    obj=prism(slug,label,xy)
    content=json.dumps({'recipe':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),'shape':xy,'slug':slug,'revision':REV},sort_keys=True)
    asset_id='part-'+hashlib.sha256(content.encode()).hexdigest()[:20]
    obj.name='GEO-'+asset_id+'--floor'
    obj['asset_id']=asset_id
    directory=OUT/slug;directory.mkdir(exist_ok=True)
    export([obj],directory/'model.glb')
    evaluated=obj.evaluated_get(bpy.context.evaluated_depsgraph_get()).to_mesh()
    evaluated.calc_loop_triangles()
    count=len(evaluated.loop_triangles)
    measured={'min':[min(v.co[i] for v in evaluated.vertices) for i in range(3)],'max':[max(v.co[i] for v in evaluated.vertices) for i in range(3)]}
    obj.evaluated_get(bpy.context.evaluated_depsgraph_get()).to_mesh_clear()
    components.append({'slug':slug,'label':label,'id':asset_id,'node_prefix':obj.name,'polygon_xy_m':xy,
      'area_m2':area(xy),'thickness_m':THICKNESS,'bounds':measured,'runtime_triangles':count,
      'uv_period_m':2,'texels_per_m':RES/2,'perimeter_bevel_m':.004,'lights':[],
      'source_mesh':'floor-kit.blend / RUNTIME-MASTERS / '+obj.name,
      'normal_bake_source':'BAKE-SOURCE-editable-relief','supported_rotation':'quarter turns; shape angle is authored',
      'gameplay':{'status':'proposal; no authority change','dry_mass_kg':None,'payload_kg_m2':None,'health_hp':None,
       'basis':'Requires installed structural material/support definition. Visual thickness and texture do not determine strength or mass.'}})
export(list(masters.objects),OUT/'kit.glb')
(OUT/'components.json').write_text(json.dumps(components,indent=2)+'\n')
spec={'design_id':DESIGN,'revision':REV,'status':'unsigned draft','owner_direction':'Add angled floor shapes and long triangles; replace raised shallow detail with normal/bump maps to lower rendering cost.',
 'shape_count':len(components),'units':'metres; Blender XY deck plane, Z up; renderer X/height/-Y',
 'nominal_grid_m':2,'placement_snap_m':1/32,'thickness_m':THICKNESS,'top_plane_m':THICKNESS,
 'visual_geometry':'Closed extruded silhouette, 4 mm two-segment perimeter bevel; no raised panel/fastener/grip runtime geometry.',
 'maps':{'size_px':RES,'period_m':2,'normal':'Blender Cycles selected-to-active tangent-space +Y; includes authored plate bevel/fastener/grip detail and subtle shader bump',
 'height':'Editable 0–16 mm source height, retained separately; not runtime displacement',
 'orm':'R ambient occlusion, G roughness, B metallic; no directional light baked into base color',
 'material':'Predominantly nonmetal molded polymer; steel only in small fastener texture regions; no floor emitters or per-tile lights'},
 'lighting':'Normals need illumination and do not reduce light count automatically. Compare identical lights first, then one key + environment/fill; no frame-rate claim without measurement.',
 'proxies':'Any occupancy/collision representation is independent; angled previews require polygon-derived occupancy, not filled bounding boxes.',
 'components':components}
(OUT/'specification.json').write_text(json.dumps(spec,indent=2)+'\n')
for obj in masters.objects:obj.hide_render=True;obj.hide_set(True)
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'floor-kit.blend'))
print('FLOOR_BUILD_COMPLETE',len(components),flush=True)
