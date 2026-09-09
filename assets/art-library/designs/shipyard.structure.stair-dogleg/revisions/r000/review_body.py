"""Actual Blender capsule fit evidence. Never edits the pinned visual source/GLB."""
import bpy,json,math,sys,hashlib
from pathlib import Path
from mathutils import Vector
OUT=Path(sys.argv[sys.argv.index('--')+1]).resolve()
assert not (OUT/'capsule-fit.blend').exists(), 'Preserve prior review evidence'
bpy.ops.wm.open_mainfile(filepath=str(OUT/'blender-source.blend'))
scene=bpy.context.scene
mat=bpy.data.materials.new('REVIEW-body-envelope-cyan');mat.use_nodes=True;mat.diffuse_color=(.035,.48,.7,1);p=mat.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(.035,.48,.7,1);p.inputs['Roughness'].default_value=.45
positions=[('flight-a-supported-stop',(1,2.33,.75)),('intermediate-turn',(2,5.0625,1.875)),('flight-b-supported-stop',(3,2.92,2.8125)),('upper-supported-stop',(3,.75,3.375))]
for name,(x,y,feet) in positions:
 rings=[]
 for j in range(9):a=-math.pi/2+j*math.pi/16;rings.append((.3*math.cos(a),feet+.3+.3*math.sin(a)))
 for j in range(9):a=j*math.pi/16;rings.append((.3*math.cos(a),feet+1.5+.3*math.sin(a)))
 verts=[(x+r*math.cos(i*math.tau/48),y+r*math.sin(i*math.tau/48),z) for r,z in rings for i in range(48)];faces=[(j*48+i,j*48+(i+1)%48,(j+1)*48+(i+1)%48,(j+1)*48+i) for j in range(len(rings)-1) for i in range(48)]
 me=bpy.data.meshes.new(name);me.from_pydata(verts,[],faces);me.update();o=bpy.data.objects.new('REVIEW-capsule-'+name,me);scene.collection.objects.link(o);me.materials.append(mat)
 for f in me.polygons:f.use_smooth=True
for o in bpy.data.collections['REVIEW-EXACT-NATIVE-PANELS'].objects:o.hide_render=not o.name.startswith('REVIEW-lower-floor')
cam=scene.camera;cam.location=(12,-9,11);target=Vector((2,3,2.45));cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.ortho_scale=11.0
scene.render.filepath=str(OUT/'capsule-fit.png');bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'capsule-fit.blend'));bpy.ops.render.render(write_still=True)
(OUT/'capsule-fit.json').write_text(json.dumps({'kind':'four independent qualified rest/turn placements shown together for review; not multiplayer authority or animation evidence','body':{'radiusM':.3,'heightM':1.8},'posesM':dict(positions),'context':'lower-floor-only presentation cutaway; roof/floor obstacles remain in full numeric audit','sourceBlendSha256':hashlib.sha256((OUT/'blender-source.blend').read_bytes()).hexdigest(),'reviewBlendSha256':hashlib.sha256((OUT/'capsule-fit.blend').read_bytes()).hexdigest(),'cameraM':list(cam.location),'targetM':list(target),'renderer':'Cycles CPU32'},indent=2)+'\n')
(OUT/'review_body.py').write_bytes(Path(__file__).read_bytes())
