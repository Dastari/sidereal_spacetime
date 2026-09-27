"""Native material-only r006 selected A shoulders, following root bank-hit evidence.
blender -b -t 1 --python THIS -- NEW_OUTPUT ROOT_SELECTION_JSON
"""
import bpy, json, sys, shutil, hashlib
from pathlib import Path
from mathutils.bvhtree import BVHTree
root=Path(__file__).resolve().parents[2]
prior=root/'output/playwright/planet-reference-20260914/volcanic-moon-2-r005'
selection_path=Path(sys.argv[sys.argv.index('--')+2]).resolve()
selection=json.loads(selection_path.read_text())
assert selection['variant']=='battered-region-a'
assert selection['evidence'] and selection['hotObjects'], 'Root-resolved actual bank evidence required'
center_limit=selection['maximumCenterDistance'];corner_limit=selection['maximumCornerDistance'];height_limit=selection['maximumHeightDifference']
assert 0<center_limit<=.16 and center_limit<=corner_limit<=.24 and 0<height_limit<=.10
out=Path(sys.argv[sys.argv.index('--')+1]).resolve()
assert not out.exists(), 'Preserve every candidate revision'
out.mkdir(parents=True)
bpy.ops.wm.open_mainfile(filepath=str(prior/'kit.blend'))
kit=json.loads((prior/'kit.json').read_text())
variant=next(v for v in kit['variants'] if v['name']=='battered-region-a')
parts=[o for o in bpy.context.scene.objects if o.type=='MESH' and o.name.startswith('GEO-battered-region-a')]
assert len(parts)>20
# All members of this native formation share the preserved presentation offset.
locations={o.name:o.location.copy() for o in parts}
for obj in parts:obj.location=(0,0,0)
role=6;assert len(kit['materials'])==7
material=bpy.data.materials[kit['materials'][role]['name']]
# Nearest native core surface, not a seeded or camera-dependent mask.
hotverts=[];hottris=[]
assert set(selection['hotObjects'])<=set(o.name for o in parts)
for obj in parts:
 if obj.name not in selection['hotObjects']:continue
 obj.data.calc_loop_triangles()
 for tri in obj.data.loop_triangles:
  if tri.material_index!=4:continue
  start=len(hotverts);hotverts.extend(obj.data.vertices[i].co.copy() for i in tri.vertices);hottris.append((start,start+1,start+2))
assert hottris
hot=BVHTree.FromPolygons(hotverts,hottris,all_triangles=True)
def key(points):return tuple(sorted(tuple(round(float(c),7) for c in p) for p in points))
changed={};faces=[]
for obj in parts:
 obj.data.materials.append(material)
 for face in obj.data.polygons:
  if face.material_index not in (0,1,3,5) or face.normal.z<-.05 or face.center.z<.07:continue
  closest,normal,index,distance=hot.find_nearest(face.center)
  if closest is None or distance>center_limit or abs(face.center.z-closest.z)>height_limit:continue
  # Reject big face coverage beyond the narrow adjacent-bank budget.
  if any(hot.find_nearest(obj.data.vertices[i].co)[3]>corner_limit for i in face.vertices):continue
  old=face.material_index;face.material_index=role
  faces.append({'object':obj.name,'face':face.index,'previousRole':old,'distance':distance})
 obj.data.calc_loop_triangles()
 for tri in obj.data.loop_triangles:
  if tri.material_index==role:changed[key([obj.data.vertices[i].co for i in tri.vertices])]=role
assert faces,'No immediately adjacent cold faces selected'
count=0
for t in range(len(variant['triangleMaterials'])):
 points=[variant['positions'][i*3:i*3+3] for i in variant['indices'][t*3:t*3+3]]
 if key(points) in changed:
  assert variant['triangleMaterials'][t] in (0,1,3,5)
  variant['triangleMaterials'][t]=role;count+=1
assert count==len(changed),(count,len(changed))
assert 0<count<len(variant['triangleMaterials'])*.035,(count,len(variant['triangleMaterials']))
for p in prior.glob('*.glb'):
 if p.stem!='battered-region-a':shutil.copy2(p,out/p.name)
for p in prior.glob('rocky-*.png'):shutil.copy2(p,out/p.name)
bpy.ops.object.select_all(action='DESELECT')
for obj in parts:obj.select_set(True)
bpy.context.view_layer.objects.active=parts[0]
bpy.ops.export_scene.gltf(filepath=str(out/'battered-region-a.glb'),export_format='GLB',use_selection=True,export_extras=True)
for obj in parts:obj.location=locations[obj.name]
bpy.ops.wm.save_as_mainfile(filepath=str(out/'kit.blend'))
(out/'kit.json').write_text(json.dumps(kit,separators=(',',':')))
shutil.copy2(__file__,out/Path(__file__).name)
(out/'preservation.json').write_text(json.dumps({'prior':str(prior),'priorKitSHA256':hashlib.sha256((prior/'kit.json').read_bytes()).hexdigest(),'scope':'material-only root-selected A hot banks; prior B-edge shoulders exact','rootSelection':selection,'changedTriangles':count,'totalVariantTriangles':len(variant['triangleMaterials']),'maximumCenterDistance':center_limit,'maximumCornerDistance':corner_limit,'selectedFaces':faces,'geometryNormalsUvs':'exact JSON unchanged; native mesh untouched','publication':'isolated draft, no owner sign-off'},indent=2))
shutil.copy2(selection_path,out/'root-selection.json')
print('VOLCANIC_R006_DONE',count,'triangles',len(faces),'faces',flush=True)
