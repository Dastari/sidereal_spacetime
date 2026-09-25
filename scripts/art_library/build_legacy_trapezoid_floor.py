"""Managed, immutable Blender authoring for two legacy trapezoid floor footprints."""
from pathlib import Path
import hashlib
import json
import sys

ROOT = Path(__file__).resolve().parents[2]
DESIGN = 'shipyard.structure.legacy-trapezoid-floor'
BASE = ROOT/'assets/art-library/shipyard-floor/r002'
OUT = ROOT/'assets/art-library/designs'/DESIGN/'revisions/r001'

def sha(p):
    return hashlib.sha256(Path(p).read_bytes()).hexdigest()

def author():
    import bpy
    import bmesh
    from mathutils import Vector
    OUT.mkdir(parents=True, exist_ok=False)
    import shutil
    shutil.copy2(__file__, OUT/'recipe.py')
    bpy.ops.wm.open_mainfile(filepath=str(BASE/'floor-kit.blend'))
    bpy.context.preferences.filepaths.save_version = 0
    top = bpy.data.materials['MAT-deck-polymer-mapped']
    edge = bpy.data.materials['MAT-deck-indigo-edge']
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    for im in bpy.data.images:
        p = BASE/'maps'/Path(im.filepath).name
        if p.exists():
            im.filepath = str(p)
            im.pack()
    scene=bpy.context.scene
    scene.unit_settings.system='METRIC'
    scene.unit_settings.scale_length=1
    shapes = [('legacy-trapezoid-left', [[0,0],[64,0],[64,64],[32,64]]),
              ('legacy-trapezoid-right', [[0,0],[64,0],[32,64],[0,64]])]
    manifest={'schema':'sidereal.legacy-trapezoid-floor.v1','designId':DESIGN,'revision':1,
        'artApproval':'unapproved','physicalQualification':'unqualified','sourceBlendSha256':sha(BASE/'floor-kit.blend'),
        'sourceMaps':{p.name:sha(p) for p in sorted((BASE/'maps').glob('*.png'))},
        'axes':'Blender XY footprint / Z height; GLB X,-Z footprint / Y height',
        'floorBottomM':0,'floorTopM':.1875,'contactPolicy':'Integrated full nominal upper contact; no additional contact filler required.',
        'profiles':[]}
    objects=[]
    for slug, units in shapes:
        xy=[(x/32,y/32) for x,y in units]
        n=len(xy)
        verts=[(x,y,z) for z in [0,.1875] for x,y in xy]
        faces=[tuple(reversed(range(n))),tuple(range(n,2*n))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
        mesh=bpy.data.meshes.new('MESH-'+slug)
        mesh.from_pydata(verts,[],faces)
        mesh.update()
        mesh.materials.append(top)
        mesh.materials.append(edge)
        uv=mesh.uv_layers.new(name='UVMap')
        for f in mesh.polygons:
            f.material_index=0 if f.index==1 else 1
            for li in f.loop_indices:
                v=mesh.vertices[mesh.loops[li].vertex_index].co
                uv.data[li].uv=(v.x/2,v.y/2) if f.index==1 else (v.x/2,v.z/2)
        obj=bpy.data.objects.new('GEO-'+slug+'--floor',mesh)
        scene.collection.objects.link(obj)
        obj['surface_detail']='Exact r002 Blender-baked panel relief, fasteners, grips, normal/ORM/basecolor maps; 2m atlas.'
        obj['contact_policy']='Full nominal top including corner columns, authored directly rather than scaling a GLB or adding runtime geometry.'
        obj['art_approval']='unapproved'
        obj.modifiers.new('Explicit triangles for tangent export','TRIANGULATE')
        bm=bmesh.new();bm.from_mesh(mesh)
        volume=bm.calc_volume(signed=True)
        nonmanifold=sum(not e.is_manifold for e in bm.edges)
        assert nonmanifold==0 and abs(volume-.5625)<1e-9
        bm.free()
        bpy.ops.object.select_all(action='DESELECT')
        obj.select_set(True)
        bpy.context.view_layer.objects.active=obj
        path=OUT/(slug+'.glb')
        bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_apply=True,
            export_yup=True,export_materials='EXPORT',export_tangents=True)
        manifest['profiles'].append({'id':slug,'nodePrefix':obj.name,'footprint':units,'footprintM':xy,
            'glb':path.name,'sha256':sha(path),'floorBottomM':0,'floorTopM':.1875,
            'boundsM':{'min':[0,0,0],'max':[2,2,.1875]},'areaM2':3,'volumeM3':volume,'nonmanifoldEdges':nonmanifold,
            'runtimeTriangles':12,'materials':2,'normalMapped':True,'uvPeriodM':2,'floorContactIntegrated':True})
        objects.append(obj)
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'blender-source.blend'))
    manifest['editableSourceSha256']=sha(OUT/'blender-source.blend')
    (OUT/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
    # Review the exported bytes, not only the authoring mesh.
    for o in list(bpy.data.objects): bpy.data.objects.remove(o,do_unlink=True)
    scene.render.engine='CYCLES';scene.cycles.samples=24;scene.cycles.use_denoising=False
    scene.render.resolution_x=1000;scene.render.resolution_y=800;scene.render.resolution_percentage=100
    scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGB';scene.render.film_transparent=False
    scene.world.use_nodes=True
    scene.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.1,.12,.17,1)
    scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.6
    ld=bpy.data.lights.new('LIGHT-review','AREA');ld.energy=600;ld.shape='DISK';ld.size=5
    light=bpy.data.objects.new(ld.name,ld);scene.collection.objects.link(light);light.location=(1,-2,5)
    camera=bpy.data.objects.new('CAMERA-review',bpy.data.cameras.new('CAMERA-review'))
    scene.collection.objects.link(camera);camera.data.type='ORTHO';camera.data.ortho_scale=3.2;scene.camera=camera
    captures=[]
    for p in manifest['profiles']:
        before=set(bpy.data.objects)
        bpy.ops.import_scene.gltf(filepath=str(OUT/p['glb']))
        imported=list(set(bpy.data.objects)-before)
        for view,eye in [('close',(3,-3,4)),('top',(1,1,6))]:
            camera.location=eye
            camera.rotation_euler=(Vector((1,1,.1))-camera.location).to_track_quat('-Z','Y').to_euler()
            file=OUT/(p['id']+'-'+view+'.png')
            scene.render.filepath=str(file);bpy.ops.render.render(write_still=True)
            captures.append({'file':file.name,'sha256':sha(file),'glbSha256':p['sha256'],'cameraM':eye})
        for o in imported:bpy.data.objects.remove(o,do_unlink=True)
    (OUT/'capture.json').write_text(json.dumps({'engine':'Blender Cycles','blender':bpy.app.version_string,'resolution':[1000,800],'samples':24,'captures':captures},indent=2)+'\n')
    print('LEGACY_TRAPEZOID_COMPLETE',str(OUT))

if __name__=='__main__':
    if '--' in sys.argv:author()
    else:
        import tomllib
        sys.path.insert(0,str(ROOT))
        from scripts.dev import run
        cfg=tomllib.loads((ROOT/'dev.toml').read_text())
        run([cfg['art']['blender'],'--background','--threads','2','--python-exit-code','1','--python',str(Path(__file__).resolve()),'--'])
