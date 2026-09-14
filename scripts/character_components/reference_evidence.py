"""Additional diagnostic renders from an immutable candidate native source."""
import bpy,json,argparse,sys,hashlib
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2]
p=argparse.ArgumentParser();p.add_argument('--evidence-source',required=True);p.add_argument('--output',required=True)
a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);source=(ROOT/a.evidence_source).resolve();out=(ROOT/a.output).resolve()
assert source.is_relative_to(ROOT) and out.is_relative_to(ROOT) and not out.exists();out.mkdir(parents=True)
bpy.ops.wm.open_mainfile(filepath=str(source));scene=bpy.context.scene;rig=next(o for o in bpy.data.objects if o.type=='ARMATURE');manifest=json.loads(source.with_name('manifest.json').read_text())
for t in rig.animation_data.nla_tracks:t.mute=True
rig.animation_data.action=None
for b in rig.pose.bones:b.rotation_mode='XYZ';b.rotation_euler=(0,0,0);b.location=(0,0,0)
scene.cycles.samples=48;scene.cycles.use_denoising=False;scene.render.film_transparent=False
scene.world.node_tree.nodes.get('Background').inputs[0].default_value=(.6,.65,.72,1)
scene.world.node_tree.nodes.get('Background').inputs[1].default_value=.6
clay=bpy.data.materials.new('Diagnostic diffuse clay');clay.use_nodes=True;n=clay.node_tree.nodes.get('Principled BSDF');n.inputs['Base Color'].default_value=(.45,.45,.45,1);n.inputs['Roughness'].default_value=.9
records=[]
def capture(name,keys,target,direction,scale,override=False):
 covers={r for c in manifest['components'] if c['id'] in keys for r in c['covers']}
 for o in bpy.data.objects:
  if o.type=='MESH':
   k=o.get('component_id','');o.hide_render=k not in keys or (k.startswith('base-') and k.split('-')[-1] in covers)
 scene.view_layers[0].material_override=clay if override else None
 target=Vector(target);scene.camera.location=target+Vector(direction);scene.camera.rotation_euler=(target-scene.camera.location).to_track_quat('-Z','Y').to_euler();scene.camera.data.ortho_scale=scale
 scene.render.resolution_x=600;scene.render.resolution_y=600;scene.render.filepath=str(out/(name+'.png'));bpy.ops.render.render(write_still=True)
 records.append({'file':name+'.png','keys':keys,'target':list(target),'direction':direction,'orthoScale':scale,'clayOverride':override})
for h in ['swept','crest','ponytail']:
 capture(h+'-upper-rear-clay',['base-female-core','hair-'+h],(0,.04,1.68),(3,6,4),1.0,True)
capture('ponytail-side-clay',['base-female-core','hair-ponytail'],(.13,.1,1.6),(6,0,1),1.05,True)
capture('sealed-optical-close',manifest['baseGroups']['male']+['medic-helmet','medic-visor'],(0,0,1.6),(3,-6,1.6),.91)
# Capture reference-like asymmetry without altering any bind or animation asset.
rig.pose.bones['upper_arm.L'].rotation_euler.x=-.18;rig.pose.bones['forearm.L'].rotation_euler.x=-1.05;rig.pose.bones['upper_arm.R'].rotation_euler.x=.10;rig.pose.bones['forearm.R'].rotation_euler.x=-.12
for light in [o for o in bpy.data.objects if o.type=='LIGHT']:
 light.data.color=(.58,.67,1) if 'key' in light.name else (.35,.5,1)
for body in ['female','male']:
 keys=manifest['baseGroups'][body]+[v for slot,v in manifest['sets']['medic'].items() if slot not in ['helmet','visor']]+['medic-open-comms','hair-ponytail' if body=='female' else 'hair-swept']
 capture(body+'-reference-light-stance',keys,(0,0,.99),(3,-6,2.2),2.36)
(out/'capture-record.json').write_text(json.dumps({'source':str(source.relative_to(ROOT)),'sourceSha256':hashlib.sha256(source.read_bytes()).hexdigest(),'renderer':'Blender Cycles 48 samples, no denoising, no bloom','records':records,'limits':'Review-only stance; no native source, rig, animation or publication mutation.'},indent=2)+'\n')
