import bpy,json,math
from pathlib import Path
from mathutils import Vector
base=Path('/root/sidereal_spacetime/output/playwright/planet-reference-20260914');out=base/'crystal-moons-r010-parity';out.mkdir(exist_ok=True);reports=[]
for moon in (1,2):
 bpy.ops.wm.open_mainfile(filepath=str(base/f'crystal-moon-{moon}-r009/kit.blend'));kit=json.loads((base/f'crystal-moon-{moon}-r009/kit.json').read_text());phase=((((38^kit['compositionRecipe']['layoutSeed'])*1664525)+1013904223)&0xffffffff)/4294967296*math.pi*2;c=math.cos(phase);s=math.sin(phase);deps=bpy.context.evaluated_depsgraph_get();hits=[]
 for angle,alpha,beta in [('hero',math.atan2(4.3,2.45),math.acos(2.1/math.hypot(2.45,4.3,2.1))),('angle2',2.6529033447245056,1.1694941410002127)]:
  r=5.5;world=Vector((r*math.cos(alpha)*math.sin(beta),r*math.cos(beta),r*math.sin(alpha)*math.sin(beta)));location=Vector((c*world.x-s*world.z,-s*world.x-c*world.z,world.y));rotation=(-location).to_track_quat('-Z','Y').to_matrix()
  for x,y in [(310,190),(435,155),(510,190),(595,235),(655,315),(690,405),(625,485),(520,310),(440,355),(355,305),(490,245),(580,360),(580,205),(650,540)]:
   direction=rotation@Vector(((x/900-.5)*2*math.tan(.26),(.5-y/900)*2*math.tan(.26),-1)).normalized();hit,point,normal,face,obj,matrix=bpy.context.scene.ray_cast(deps,location,direction)
   if hit:
    poly=obj.data.polygons[face];hits.append({'angle':angle,'pixel':[x,y],'object':obj.name,'partId':obj.get('partId'),'polygon':face,'area':poly.area,'role':poly.material_index,'normal':list(normal),'position':list(point)})
 reports.append({'moon':moon,'hits':hits})
(out/'accent-polygon-candidates.json').write_text(json.dumps(reports,indent=2))
for r in reports:
 print('MOON',r['moon'])
 for h in r['hits']:print(h['angle'],h['pixel'],'area',round(h['area'],4),'role',h['role'],h['partId'],'face',h['polygon'])
