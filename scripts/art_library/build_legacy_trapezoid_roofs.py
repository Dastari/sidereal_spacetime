"""Managed immutable r002 roof companions; preserves both r001 floor bytes."""
from pathlib import Path
import sys
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'assets/art-library/designs/shipyard.structure.legacy-trapezoid-floor/revisions/r002'

def main():
    # Share the exact roof125 Blender mesh recipe and supported native roof materials.
    source=ROOT/'scripts/art_library/build_roof125.py'
    namespace={'__file__':__file__,'__name__':'legacy_roof_authoring'}
    exec(compile(source.read_text().split('objects={};polygons={};validation={};interfaces={}')[0],str(source),'exec'),namespace)
    import bpy,json,hashlib,shutil,struct,math
    from mathutils import Vector
    author=namespace['author'];sha=namespace['sha'];cross=namespace['cross'];area=namespace['area']
    prev=OUT.parent/'r001'
    floor=json.loads((prev/'manifest.json').read_text())
    manifest={'schema':'sidereal.legacy-trapezoid-companions.v1','revision':2,'artApproval':'unapproved',
        'physicalQualification':'unqualified','roofRecipeSha256':sha(source),
        'roofMaterialSourceSha256':sha(namespace['SOURCE']),'profiles':[]}
    for p in floor['profiles']:
        shutil.copy2(prev/p['glb'],OUT/p['glb'])
        assert sha(OUT/p['glb'])==p['sha256']
        manifest['profiles'].append(dict(p,kind='floor'))
    objects=[]
    for p in floor['profiles']:
        sid=p['id']+'-roof';obj,polygon,volume=author({'id':sid,'footprintUnits':p['footprint']})
        obj.modifiers.new('Explicit triangles for portable tangent export','TRIANGULATE')
        bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj
        path=OUT/(sid+'.glb')
        bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_apply=True,export_extras=True,export_yup=True,export_tangents=True)
        raw=path.read_bytes();g=json.loads(raw[20:20+struct.unpack_from('<I',raw,12)[0]])
        assert all('uri' not in image for image in g.get('images',[]))
        before=set(bpy.data.objects);bpy.ops.import_scene.gltf(filepath=str(path));imported=list(set(bpy.data.objects)-before)
        coverage=0;triangles=0
        for o in imported:
            if o.type!='MESH':continue
            pts=[o.matrix_world@v.co for v in o.data.vertices]
            for v in pts:
                assert -1e-6<=v.z<=.125001
                assert all(cross(a,b,v)>=-1e-6*math.dist(a,b) for a,b in zip(polygon,polygon[1:]+polygon[:1]))
            o.data.calc_loop_triangles();triangles+=len(o.data.loop_triangles)
            for t in o.data.loop_triangles:
                vs=[pts[i] for i in t.vertices]
                if all(abs(v.z)<1e-6 for v in vs):coverage+=abs(area([(v.x,v.y) for v in vs]))
        assert abs(coverage-3)<1e-6,(sid,coverage)
        for o in imported:bpy.data.objects.remove(o,do_unlink=True)
        manifest['profiles'].append({'kind':'roof','id':sid,'floorId':p['id'],'glb':path.name,'sha256':sha(path),
            'nodePrefix':obj.name,'footprint':p['footprint'],'footprintM':polygon,'roofBottomM':0,'roofTopM':.125,
            'boundsM':{'min':[0,0,0],'max':[2,2,.125]},'closedManifold':True,'volumeM3':volume,
            'undersideCoverageM2':coverage,'allExportedVerticesContained':True,'runtimeTriangles':triangles,
            'materials':len(g['materials']),'embeddedImages':len(g.get('images',[])),'externalResources':False,
            'ceilingMaterial':'MAT-roof-ceiling','detail':'Native recessed pale panels, dark grooves, steel rim, wine service hatch, cyan accent and textured ceiling.'})
        objects.append(obj)
    for im in bpy.data.images:
        if im.has_data:im.pack()
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'blender-source.blend'))
    manifest['editableSourceSha256']=sha(OUT/'blender-source.blend')
    (OUT/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
    # Render reimported export bytes from above and underside.
    for o in list(bpy.data.objects):bpy.data.objects.remove(o,do_unlink=True)
    scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=24;scene.cycles.use_denoising=False
    scene.render.resolution_x=900;scene.render.resolution_y=900;scene.render.resolution_percentage=100
    scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGB';scene.render.film_transparent=False
    scene.world=bpy.data.worlds.new('WORLD-roof-review');scene.world.use_nodes=True
    scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.12,.15,.2,1)
    scene.world.node_tree.nodes['Background'].inputs[1].default_value=.5
    for name,pos in [('top',(2,-3,5)),('underside',(2,-3,-5))]:
        ld=bpy.data.lights.new('LIGHT-'+name,'AREA');ld.energy=900;ld.size=5
        light=bpy.data.objects.new(ld.name,ld);scene.collection.objects.link(light);light.location=pos
        light.rotation_euler=(Vector((1,1,.0625))-light.location).to_track_quat('-Z','Y').to_euler()
    camera=bpy.data.objects.new('CAMERA-review',bpy.data.cameras.new('CAMERA-review'));scene.collection.objects.link(camera)
    camera.data.type='ORTHO';camera.data.ortho_scale=3.4;scene.camera=camera
    captures=[]
    for p in manifest['profiles']:
        if p['kind']!='roof':continue
        before=set(bpy.data.objects);bpy.ops.import_scene.gltf(filepath=str(OUT/p['glb']));imported=list(set(bpy.data.objects)-before)
        for view,eye in [('close',(3,-3,4)),('underside',(3,-3,-4))]:
            camera.location=eye;camera.rotation_euler=(Vector((1,1,.0625))-camera.location).to_track_quat('-Z','Y').to_euler()
            file=OUT/(p['id']+'-'+view+'.png');scene.render.filepath=str(file);bpy.ops.render.render(write_still=True)
            captures.append({'file':file.name,'sha256':sha(file),'glbSha256':p['sha256'],'cameraM':eye})
        for o in imported:bpy.data.objects.remove(o,do_unlink=True)
    (OUT/'capture.json').write_text(json.dumps({'engine':'Cycles','blender':bpy.app.version_string,'resolution':[900,900],'samples':24,'captures':captures},indent=2)+'\n')
    print('LEGACY_ROOF_COMPLETE',str(OUT))

if __name__=='__main__':
    if '--' in sys.argv:main()
    else:
        import tomllib
        sys.path.insert(0,str(ROOT))
        from scripts.dev import run
        cfg=tomllib.loads((ROOT/'dev.toml').read_text())
        run([cfg['art']['blender'],'--background','--threads','2','--python-exit-code','1','--python',str(Path(__file__).resolve()),'--',str(OUT)])
