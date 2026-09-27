import bpy,json,math
from pathlib import Path
from mathutils import Vector
base=Path('/root/sidereal_spacetime/output/playwright/planet-reference-20260914');cameras=json.loads((base/'crystal-moons-r005-parity/matched-camera.json').read_text());reports=[]
for moon in [1,2]:
 bpy.ops.wm.open_mainfile(filepath=str(base/f'crystal-moon-{moon}-r008/kit.blend'));location=Vector(cameras[moon-1]['nativeCameraInversePlacement']);rotation=(-location).to_track_quat('-Z','Y').to_matrix();deps=bpy.context.evaluated_depsgraph_get();hits=[]
 for label,x,y in [('upper-crown',450,225),('left-bank',235,470),('front-lower',380,610),('front-right',590,470)]:
  direction=rotation@Vector(((x/900-.5)*2*math.tan(.26),(.5-y/900)*2*math.tan(.26),-1)).normalized();hit,point,normal,face,obj,matrix=bpy.context.scene.ray_cast(deps,location,direction)
  if hit:hits.append({'label':label,'pixel':[x,y],'object':obj.name,'partId':obj.get('partId'),'face':face,'position':list(point),'normal':list(normal)})
 reports.append({'moon':moon,'hits':hits})
(base/'crystal-moons-r008-parity/wide-face-placement-trace.json').write_text(json.dumps(reports,indent=2));print(json.dumps(reports,indent=2))
