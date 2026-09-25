"""Bake original brushed-metal data maps and a neutral HDR reflection rig in Blender."""
from pathlib import Path
import bpy, math, hashlib, json
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'assets/runtime/materials';OUT.mkdir(parents=True,exist_ok=True)
stamp=OUT/'manifest.json'
recipe_hash=hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
if stamp.exists() and json.loads(stamp.read_text()).get('recipe_sha256')==recipe_hash:
 print('Metal materials already baked from this recipe.')
else:
 bpy.ops.wm.read_factory_settings(use_empty=True)
 scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.use_denoising=False;scene.cycles.samples=4
 bpy.ops.mesh.primitive_plane_add(size=2)
 plane=bpy.context.object;plane.name='GEO-brushed-metal-bake'
 mat=bpy.data.materials.new('MAT-brushed-metal-source');mat.use_nodes=True;plane.data.materials.append(mat)
 nodes=mat.node_tree.nodes;links=mat.node_tree.links;bsdf=nodes.get('Principled BSDF')
 uv=nodes.new('ShaderNodeTexCoord');mapping=nodes.new('ShaderNodeMapping');mapping.inputs['Scale'].default_value=(2,48,1)
 links.new(uv.outputs['UV'],mapping.inputs['Vector'])
 noise=nodes.new('ShaderNodeTexNoise');noise.inputs['Scale'].default_value=8;noise.inputs['Detail'].default_value=2
 links.new(mapping.outputs['Vector'],noise.inputs['Vector'])
 bump=nodes.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.18;bump.inputs['Distance'].default_value=.003
 links.new(noise.outputs['Fac'],bump.inputs['Height']);links.new(bump.outputs['Normal'],bsdf.inputs['Normal'])
 rough=nodes.new('ShaderNodeMapRange');rough.inputs['From Min'].default_value=0;rough.inputs['From Max'].default_value=1
 rough.inputs['To Min'].default_value=.28;rough.inputs['To Max'].default_value=.46
 links.new(noise.outputs['Fac'],rough.inputs['Value']);links.new(rough.outputs['Result'],bsdf.inputs['Roughness'])
 bsdf.inputs['Metallic'].default_value=.8
 for name,kind in [('brushed-normal','NORMAL'),('brushed-roughness','ROUGHNESS')]:
  image=bpy.data.images.new(name,width=512,height=512,alpha=False,is_data=True);image.colorspace_settings.name='Non-Color'
  target=nodes.new('ShaderNodeTexImage');target.image=image;nodes.active=target
  bpy.ops.object.bake(type=kind,margin=4)
  image.filepath_raw=str(OUT/(name+'.png'));image.file_format='PNG';image.save();nodes.remove(target)
 bpy.context.preferences.filepaths.save_version=0
 bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'assets/source/brushed_metal.blend'))
 # A neutral studio/cabin reflection environment, independent of colored sky vistas.
 bpy.ops.wm.read_factory_settings(use_empty=True)
 scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.use_denoising=False;scene.cycles.samples=16
 world=bpy.data.worlds.new('neutral-reflection-world');world.use_nodes=True;scene.world=world
 world.node_tree.nodes['Background'].inputs['Color'].default_value=(.025,.035,.055,1)
 world.node_tree.nodes['Background'].inputs['Strength'].default_value=.4
 for i,(position,size,color,strength) in enumerate([
  ((0,0,4),(5,2,1),(.92,.96,1),4),((3,1,2),(2,4,1),(.72,.82,1),2),((-3,-1,2),(2,3,1),(1,.94,.85),2.5),((0,-4,1),(3,1,1),(.55,.65,.8),1),
 ]):
  bpy.ops.mesh.primitive_plane_add(size=1,location=position);obj=bpy.context.object;obj.name='GEO-reflection-panel-'+str(i)
  obj.scale=size;obj.rotation_euler=(-Vector(position)).to_track_quat('Z','Y').to_euler()
  material=bpy.data.materials.new('MAT-panel-'+str(i));material.use_nodes=True
  shader=material.node_tree.nodes.get('Principled BSDF');shader.inputs['Emission Color'].default_value=(*color,1);shader.inputs['Emission Strength'].default_value=strength;obj.data.materials.append(material)
 bpy.ops.object.camera_add(location=(0,0,0));camera=bpy.context.object;camera.name='CAM-reflection-capture';camera.data.type='PANO';camera.data.panorama_type='EQUIRECTANGULAR';scene.camera=camera
 scene.render.resolution_x=512;scene.render.resolution_y=256;scene.render.resolution_percentage=100
 scene.render.image_settings.file_format='HDR';scene.render.filepath=str(OUT/'frontier-workshop.hdr')
 bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'assets/source/reflection_workshop.blend'))
 bpy.ops.render.render(write_still=True)
 outputs=[OUT/'brushed-normal.png',OUT/'brushed-roughness.png',OUT/'frontier-workshop.hdr']
 stamp.write_text(json.dumps({'date':'2026-09-08','blender':bpy.app.version_string,'recipe_sha256':recipe_hash,'provenance':'Original procedural Blender bake and reflection rig','outputs':{p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in outputs}},indent=2)+'\n')
