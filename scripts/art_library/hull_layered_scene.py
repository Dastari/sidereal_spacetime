"""Editable layered Blender solids and separate sampled damage derivatives."""
from pathlib import Path
import hashlib
import json
import math
import sys

import bpy
from mathutils import Vector

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(HERE))
from hull_layered_contract import CELL, panel_layout, damage_cells
from hull_layered_materials import materials, FINISHES
from hull_voxel_study_panels import _box, export_panel
from hull_voxel_study_damage import mesh_cells

args = sys.argv[sys.argv.index('--')+1:]
OUT, STAGE = Path(args[0]), args[1]
ONLY = args[2] if len(args)>2 else None


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def uv(obj):
    """Fixed metric repeat; skin/armor edge strips use plain frame material."""
    mesh = obj.data
    layer = mesh.uv_layers.active or mesh.uv_layers.new(name='Metric1mx075m')
    for face in mesh.polygons:
        axis = max(range(3), key=lambda i: abs(face.normal[i]))
        for li in face.loop_indices:
            p = mesh.vertices[mesh.loops[li].vertex_index].co
            layer.data[li].uv = (p.y, p.z/.75) if axis == 0 else (p.x, p.z/.75) if axis == 1 else (p.y,p.x/.75)


def source(width, height, interior, mats, slug):
    collection = bpy.data.collections.new('AUTHORING-'+slug)
    bpy.context.scene.collection.children.link(collection)
    objs = []
    def add(name,bounds,role):
        ob = _box('GEO-'+slug+'-'+name,bounds,role,collection,mats)
        uv(ob)
        objs.append(ob)
    lo, hi = -width/2, width/2
    xmin, xmax = (-.125,.125) if interior else (0,.25)
    # Full pressure skin belongs to this review assembly; it does not silently
    # replace the existing installed structural wall or its pressure adapter.
    add('inner-skin',(xmin,xmin+CELL,lo,hi,0,height),0)
    cavity_start = xmin+CELL
    cavity_end = xmax-CELL if interior else .125
    armor_role = 0 if interior else 2
    add('outer-skin' if interior else 'outer-armor',(cavity_end,xmax,lo,hi,0,height),armor_role)
    for y0 in (lo, hi-CELL):
        add('edge-rib'+str(y0),(cavity_start,cavity_end,y0,y0+CELL,0,height),1)
    # Fixed pitch ribs: width and height changes add/terminate courses, never scale.
    for i in range(1,math.ceil(width/.5)):
        y0=lo+i*.5
        if y0+CELL < hi:
            add('rib'+str(i),(cavity_start,cavity_end,y0,y0+CELL,0,height),1)
    for z0 in [0,*[i*.75 for i in range(1,math.ceil(height/.75))],height-CELL]:
        if 0<=z0<=height-CELL:
            add('cross-rib'+str(z0),(cavity_start,cavity_end,lo,hi,z0,z0+CELL),1)
    # Paint termination overlays occupy the skin's existing volume. They are
    # material assignments in the sampled union, not protruding seam geometry.
    for z0,z1 in [(0,.0625),(height-.0625,height)]:
        add('finish-cap'+str(z0),(cavity_end,xmax,lo,hi,z0,z1),1)
    return collection, objs


def sample(objs,width):
    result={}
    for ob in objs:
        x0,x1,y0,y1,z0,z1=ob['authored_bounds_m']
        indices=[(round(x0/CELL),round(x1/CELL)),
                 (round((y0+width/2)/CELL),round((y1+width/2)/CELL)),
                 (round(z0/CELL),round(z1/CELL))]
        for x in range(*indices[0]):
            for y in range(*indices[1]):
                for z in range(*indices[2]):
                    result[(x,y,z)]=int(ob['material_role'])
    return result


def cooked(slug, retained, original, width, mats):
    # Existing cell mesher is immutable at 1/16m. Explicitly rescale its integer
    # vertices to this revision's 1/32m representation; UVs are rebuilt in metres.
    data=mesh_cells(retained,original=original,core_material=3,max_faces=100000)
    verts=[(v[0]/2,v[1]/2-width/2,v[2]/2) for v in data.vertices]
    mesh=bpy.data.meshes.new('MESH-'+slug)
    mesh.from_pydata(verts,[],data.faces);mesh.update()
    for m in mats:mesh.materials.append(m)
    for face,idx in zip(mesh.polygons,data.material_indices):face.material_index=idx
    ob=bpy.data.objects.new('GEO-'+slug,mesh)
    bpy.context.scene.collection.objects.link(ob);uv(ob)
    return ob


def build_one(finish,width,height,state,interior=False):
    layout=panel_layout(width,height,interior)
    slug=f'{"interior" if interior else finish}-w{round(width*32):03d}-h{round(height*32):03d}-{state}'
    mats=materials(OUT/'panels',finish)
    coll,solids=source(width,height,interior,mats,slug)
    occupancy=sample(solids,width)
    damage=damage_cells(occupancy,state,width,height,interior)
    root=bpy.data.objects.new('PANEL-'+slug,None)
    bpy.context.scene.collection.objects.link(root)
    ob=cooked(slug,damage.retained,occupancy,width,mats);ob.parent=root
    sockets={'HULL_ATTACH':(0,0,0),'HULL_EDGE_START':(0,-width/2,0),
             'HULL_EDGE_END':(0,width/2,0),'HULL_TOP':(0,0,height)}
    for name,pos in sockets.items():
        sock=bpy.data.objects.new(name,None);bpy.context.scene.collection.objects.link(sock)
        sock.parent=root;sock.location=pos;sock['interface_name']=name
    coll.hide_render=True;coll.hide_viewport=True
    root['width_m']=width;root['height_m']=height;root['cell_m']=CELL
    root['kind']='interior_partition' if interior else 'exterior_hull_panel'
    root['study_only']=True
    path=OUT/'panels'/(slug+'.glb');export_panel(root,path)
    meta={'slug':slug,'finish':finish,'width_m':width,'height_m':height,'state':state,
          'interior':interior,'cell_m':CELL,'layout':layout,'sockets_m':sockets,
          'lattice_origin_m':[0,-width/2,0],
          'glb':str(path.relative_to(OUT)),'glb_sha256':sha(path),
          'triangles':sum(len(p.vertices)-2 for p in ob.data.polygons),
          'removed_cells':len(damage.removed),'original_cells':len(occupancy)}
    rows=lambda d:[[*k,v] for k,v in sorted(d.items())]
    (OUT/'panels'/(slug+'.occupancy.json')).write_text(json.dumps({
        **meta,'original':rows(occupancy),'retained':rows(damage.retained),
        'removed':rows(damage.removed)},separators=(',',':'))+'\n')
    return root,meta


def build():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.preferences.filepaths.save_version=0
    bpy.context.scene.unit_settings.system='METRIC'
    (OUT/'panels').mkdir(exist_ok=True)
    jobs=[(f,2,3,s,False) for f in FINISHES for s in ('intact','crater','armor_open','through')]
    jobs += [('explorer',2,h,'intact',False) for h in (.75,1.5,1.84375,2.25)]
    jobs += [('explorer',w,3,'intact',False) for w in (.5,1)]
    jobs += [('explorer',2,3,s,True) for s in ('intact','crater','armor_open','through')]
    specs=[]
    for i,job in enumerate(jobs):
        panel,meta=build_one(*job);specs.append(meta)
        panel.location=(0,(i%6)*2.6,(i//6)*3.5)
        print(json.dumps({'built':meta['slug']}),flush=True)
    bpy.ops.file.pack_all()
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'study.blend'))
    (OUT/'specimens.json').write_text(json.dumps(specs,indent=2)+'\n')


def aim(obj,target):
    obj.rotation_euler=(Vector(target)-obj.location).to_track_quat('-Z','Y').to_euler()


def studio(target=(.1,0,1.5), scale=3.5, location=(7,-4,3.7)):
    s=bpy.context.scene;s.render.engine='CYCLES';s.cycles.samples=64
    s.cycles.use_denoising=False;s.render.film_transparent=True
    s.render.resolution_x=640;s.render.resolution_y=800;s.render.resolution_percentage=100
    s.render.image_settings.file_format='PNG';s.render.image_settings.color_mode='RGBA'
    s.view_settings.view_transform='AgX'
    s.world=bpy.data.worlds.new('Workshop');s.world.use_nodes=True
    ns=s.world.node_tree.nodes;env=ns.new('ShaderNodeTexEnvironment')
    env.image=bpy.data.images.load(str(ROOT/'assets/runtime/materials/frontier-workshop.hdr'))
    s.world.node_tree.links.new(env.outputs['Color'],ns['Background'].inputs['Color'])
    ns['Background'].inputs['Strength'].default_value=.35
    for name,pos,power,size in [('key',(5,-4,7),850,5),('fill',(4,5,3),500,4),('rim',(-3,1,5),600,3)]:
        bpy.ops.object.light_add(type='AREA',location=pos);ob=bpy.context.object
        ob.name='LIGHT-'+name;ob.data.energy=power;ob.data.size=size;aim(ob,target)
    bpy.ops.object.camera_add(location=location);cam=bpy.context.object
    cam.name='CAM-layered-study';cam.data.type='ORTHO';cam.data.ortho_scale=scale
    aim(cam,target);s.camera=cam
    return s


def render_one(meta):
    target=OUT/'renders'/(meta['slug']+'.png')
    if target.exists():return
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(OUT/meta['glb']))
    s=studio();s.render.filepath=str(target);bpy.ops.render.render(write_still=True)
    target.with_suffix('.json').write_text(json.dumps({'source_sha256':meta['glb_sha256'],
        'source':meta['glb'],'camera':list(s.camera.location),'scale':s.camera.data.ortho_scale,
        'renderer':bpy.app.version_string+' Cycles 64 samples',
        'note':'Actual reimported GLB; no painted holes'},indent=2)+'\n')
    print(json.dumps({'rendered':meta['slug']}),flush=True)


def anatomy():
    target=OUT/'renders'/'layer-anatomy.png'
    if target.exists():return
    bpy.ops.wm.read_factory_settings(use_empty=True)
    mats=materials(OUT/'panels','explorer')
    coll,objs=source(2,3,False,mats,'exploded')
    occupancy=sample(objs,2)
    coll.hide_render=True;coll.hide_viewport=True
    # Exploded positions are solely presentation; production sockets stay at X=0.
    for label,predicate,offset in [('skin',lambda c:c[0]==0,-.65),
                                   ('ribs',lambda c:0<c[0]<4,0),
                                   ('armor',lambda c:c[0]>=4,.65)]:
        layer={c:m for c,m in occupancy.items() if predicate(c)}
        ob=cooked('exploded-'+label,layer,layer,2,mats);ob.location.x=offset
    s=studio(target=(.1,0,1.5),scale=4.1,location=(6,-6,4.3))
    s.render.filepath=str(target);bpy.ops.render.render(write_still=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'anatomy.blend'))


if STAGE=='build':build()
elif STAGE=='render':
    (OUT/'renders').mkdir(exist_ok=True)
    for meta in json.loads((OUT/'specimens.json').read_text()):
        if ONLY is None or meta['slug']==ONLY:render_one(meta)
    if ONLY is None or ONLY=='anatomy':anatomy()
else:raise ValueError('Unknown stage')
