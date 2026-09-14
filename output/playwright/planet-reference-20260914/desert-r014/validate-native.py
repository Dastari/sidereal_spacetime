import bpy,json,math
from pathlib import Path
out=Path(__file__).resolve().parent
bpy.ops.wm.open_mainfile(filepath=str(out/'kit.blend'))
rows=[]
for obj in bpy.context.scene.objects:
 if obj.type!='MESH' or '-restricted-head-' not in obj.name:continue
 xyz=[v.co for v in obj.data.vertices];width=max(v.x for v in xyz)-min(v.x for v in xyz);depth=max(v.y for v in xyz)-min(v.y for v in xyz)
 assert width>.35 and depth>.35,(obj.name,width,depth)
 rows.append({'part':obj.name,'width':width,'depth':depth})
assert len(rows)==10
k=json.loads((out/'kit.json').read_text());old=json.loads((out.parent/'desert-r013'/'kit.json').read_text());assert k['materials']==old['materials']
variants=[]
for v in k['variants']:
 assert len(v['normals'])==len(v['positions']) and len(v['uvs'])==len(v['positions'])//3*2
 mx=0
 if not v['name'].startswith('ground'):
  p=v['positions'];ix=v['indices']
  for t in range(0,len(ix),3):
   q=[p[ix[t+j]*3:ix[t+j]*3+3] for j in range(3)];mx=max(mx,*(math.dist(q[j],q[(j+1)%3]) for j in range(3)))
  assert mx<=.30001,(v['name'],mx)
 variants.append({'name':v['name'],'triangles':len(v['indices'])//3,'maxEdge':mx or None})
for name in ['desert-cap-albedo.png','desert-wall-albedo.png']:assert (out/name).read_bytes()==(out.parent/'desert-r013'/name).read_bytes()
(out/'regression-validation.json').write_text(json.dumps({'heads':rows,'variants':variants,'materialsExactR13':True,'texturesExactR13':True,'sourceDefectFixed':'Dedicated immutable pillar profile; regional terrace outline no longer changes summit footprint.'},indent=2))
print('DESERT14_NATIVE_REGRESSIONS_PASS')
