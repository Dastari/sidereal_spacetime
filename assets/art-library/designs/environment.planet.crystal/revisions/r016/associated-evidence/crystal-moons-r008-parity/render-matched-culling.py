import bpy,bmesh,json,math
from pathlib import Path
from mathutils import Vector
root=Path('/root/sidereal_spacetime/output/playwright/planet-reference-20260914');out=root/'crystal-moons-r008-parity';records=[]
for id in[1,2]:
 bpy.ops.wm.open_mainfile(filepath=str(root/f'crystal-moon-{id}-r008/kit.blend'));scene=bpy.context.scene;obj=next(o for o in bpy.data.objects if o.type=='MESH')
 kit=json.loads((root/f'crystal-moon-{id}-r008/kit.json').read_text());capture=json.loads((root/f'crystal-moon-{id}-r004/native-body-seed38.json').read_text());phase=((((38^kit['compositionRecipe']['layoutSeed'])*1664525)+1013904223)&0xffffffff)/4294967296*math.pi*2;c=math.cos(phase);s=math.sin(phase);alpha=capture['camera']['alpha'];beta=capture['camera']['beta'];radius=5.5
 world=Vector((radius*math.cos(alpha)*math.sin(beta),radius*math.cos(beta),radius*math.sin(alpha)*math.sin(beta)));source=Vector((c*world.x-s*world.z,-s*world.x-c*world.z,world.y))
 camera=scene.camera;camera.location=source;camera.rotation_euler=(-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.type='PERSP';camera.data.angle=.52;scene.render.resolution_x=900;scene.render.resolution_y=900;scene.render.resolution_percentage=100;scene.cycles.samples=32;scene.render.threads_mode='FIXED';scene.render.threads=2
 for mode in ['native-two-sided','gltf-front-faces-only']:
  if mode=='gltf-front-faces-only':
   for mat in obj.data.materials:
    nodes=mat.node_tree.nodes;links=mat.node_tree.links;output=next(n for n in nodes if n.type=='OUTPUT_MATERIAL'and n.is_active_output);surface=output.inputs['Surface'].links[0].from_socket
    mix=nodes.new('ShaderNodeMixShader');back=nodes.new('ShaderNodeNewGeometry');transparent=nodes.new('ShaderNodeBsdfTransparent');links.new(back.outputs['Backfacing'],mix.inputs[0]);links.new(surface,mix.inputs[1]);links.new(transparent.outputs[0],mix.inputs[2]);links.new(mix.outputs[0],output.inputs['Surface'])
  scene.render.filepath=str(out/f'moon-{id}-{mode}-matched-angle2.png');bpy.ops.render.render(write_still=True);scene.render.resolution_x=78 if id==1 else 65;scene.render.resolution_y=scene.render.resolution_x;scene.render.filepath=str(out/f'moon-{id}-{mode}-reference-scale.png');bpy.ops.render.render(write_still=True);scene.render.resolution_x=900;scene.render.resolution_y=900
 records.append({'id':id,'runtimeAngle2':{'alpha':alpha,'beta':beta,'radius':radius,'fov':.52},'nativeCameraInversePlacement':list(source),'phase':phase,'sourceUnchanged':True,'lightSetup':'native source unchanged for both comparisons; no pixel-identical runtime light claim'})
(out/'matched-camera.json').write_text(json.dumps(records,indent=2))
