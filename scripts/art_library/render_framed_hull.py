"""Managed CPU renders of exact exported framed hull GLBs; no service or publish."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tomllib

ROOT = Path(__file__).resolve().parents[2]


def render(directory):
    import bpy
    from mathutils import Vector
    base = Path(directory)
    target = base/'renders'
    target.mkdir()
    rows = json.loads((base/'models.json').read_text())['models']
    captures = []
    for row in rows:
        bpy.ops.object.select_all(action='SELECT')
        bpy.ops.object.delete(use_global=False)
        bpy.ops.import_scene.gltf(filepath=str(base/row['path']))
        imported = list(bpy.context.scene.objects)
        lo,hi = Vector(row['bounds']['min']),Vector(row['bounds']['max'])
        center = (lo+hi)/2
        if row['family'] == 'side':
            offset = Vector((7,-4,3.7))
            scale = max(row['heightM']*1.33,row['widthM']*1.25,2.0)
        else:
            offset = Vector((5,-7,4)) if row['slug'] in ('front-sill-straight','front-sill-diagonal45','front-bow-transom') else Vector((7,8,5))
            scale = max((hi-lo).length*1.25,2.2)
        bpy.ops.object.camera_add(location=center+offset)
        camera = bpy.context.object
        camera.name = 'CAMERA-native-hull-review'
        camera.rotation_euler = (center-camera.location).to_track_quat('-Z','Y').to_euler()
        camera.data.type = 'ORTHO'
        camera.data.ortho_scale = scale
        scene = bpy.context.scene
        scene.camera = camera
        scene.render.engine = 'CYCLES'
        scene.cycles.device = 'CPU'
        scene.cycles.samples = 64
        scene.cycles.use_denoising = False
        scene.render.resolution_x = 1100
        scene.render.resolution_y = 1000
        scene.render.resolution_percentage = 100
        scene.render.film_transparent = True
        scene.view_settings.view_transform = 'AgX'
        scene.world.use_nodes = True
        scene.world.node_tree.nodes['Background'].inputs['Color'].default_value = (.15,.19,.25,1)
        scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value = .5
        for number,(offset,power,size) in enumerate(((Vector((4,-5,7)),800,5),(Vector((-3,5,4)),650,4),(Vector((5,6,1)),350,4))):
            bpy.ops.object.light_add(type='AREA',location=center+offset)
            light = bpy.context.object
            light.name = 'LIGHT-review-'+str(number)
            light.data.energy = power
            light.data.shape = 'DISK'
            light.data.size = size
            light.rotation_euler = (center-light.location).to_track_quat('-Z','Y').to_euler()
        path = target/(row['slug']+'.png')
        scene.render.filepath = str(path)
        bpy.ops.render.render(write_still=True)
        captures.append({'slug':row['slug'],'image':str(path.relative_to(base)),
                         'imageSha256':hashlib.sha256(path.read_bytes()).hexdigest(),
                         'modelSha256':row['sha256'],'cameraPosition':list(camera.location),
                         'cameraTarget':list(center),'orthoScale':scale,'viewport':[1100,1000],
                         'renderer':'Blender '+bpy.app.version_string+' / Cycles CPU 64 samples / AgX',
                         'provenance':'Fresh import of exact GLB export; no source geometry substituted'})
    (target/'captures.json').write_text(json.dumps(captures,indent=2)+'\n')


if __name__ == '__main__':
    if '--' in sys.argv:
        render(sys.argv[sys.argv.index('--')+1])
    else:
        parser = argparse.ArgumentParser(description=__doc__)
        parser.add_argument('--revision',type=int,default=1)
        args = parser.parse_args()
        base = ROOT/'assets/art-library/framed-wayfarer'/f'r{args.revision:03}'/'hull'
        cfg = tomllib.loads((ROOT/'dev.toml').read_text())
        subprocess.run([cfg['art']['blender'],'--background','--factory-startup','--threads','8',
                        '--python-exit-code','1','--python',str(Path(__file__).resolve()),'--',str(base)],check=True,cwd=ROOT)
