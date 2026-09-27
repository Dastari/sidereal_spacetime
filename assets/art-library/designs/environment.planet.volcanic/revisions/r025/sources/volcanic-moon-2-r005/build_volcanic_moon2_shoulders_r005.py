"""Native material-only r005 shoulder. Never rebuild or tessellate r004 surfaces.
blender -b -t 1 --python THIS -- NEW_OUTPUT
"""
import bpy, json, sys, shutil, hashlib
from pathlib import Path
from mathutils.bvhtree import BVHTree
root=Path(__file__).resolve().parents[2]
prior=root/'output/playwright/planet-reference-20260914/volcanic-moon-2-r004'
out=Path(sys.argv[sys.argv.index('--')+1]).resolve()
assert not out.exists(), 'Preserve every candidate revision'
out.mkdir(parents=True)
bpy.ops.wm.open_mainfile(filepath=str(prior/'kit.blend'))
kit=json.loads((prior/'kit.json').read_text())
variant=next(v for v in kit['variants'] if v['name']=='battered-region-b-edge')
parts=[o for o in bpy.context.scene.objects if o.type=='MESH' and (o.name.endswith('-hot-edge') or o.name=='GEO-battered-region-b-edge-exposed-hot-fracture-0')]
assert len(parts)>20
# All members of this native formation share the preserved presentation offset.
locations={o.name:o.location.copy() for o in parts}
for obj in parts:obj.location=(0,0,0)
role=len(kit['materials']);assert role==6
pigment=[.62,.027,.003]; emission=[1,.040,.002]; strength=.65
material=bpy.data.materials.new('planets--volcanic-moon-2-heated-shoulder');material.use_nodes=True
shader=material.node_tree.nodes.get('Principled BSDF')
shader.inputs['Base Color'].default_value=(*pigment,1)
shader.inputs['Roughness'].default_value=.82
shader.inputs['Metallic'].default_value=0
shader.inputs['Emission Color'].default_value=(*emission,1)
shader.inputs['Emission Strength'].default_value=strength
kit['materials'].append({'name':material.name,'linearColor':pigment,'roughness':.82,'metallic':0,'emissiveColor':emission,'emissiveStrength':strength})
# Nearest native core surface, not a seeded or camera-dependent mask.
hotverts=[];hottris=[]
for obj in parts:
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
  if closest is None or distance>.095 or abs(face.center.z-closest.z)>.055:continue
  # Reject big face coverage beyond the narrow adjacent-bank budget.
  if any(hot.find_nearest(obj.data.vertices[i].co)[3]>.15 for i in face.vertices):continue
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
 if p.stem!='battered-region-b-edge':shutil.copy2(p,out/p.name)
for p in prior.glob('rocky-*.png'):shutil.copy2(p,out/p.name)
bpy.ops.object.select_all(action='DESELECT')
for obj in parts:obj.select_set(True)
bpy.context.view_layer.objects.active=parts[0]
bpy.ops.export_scene.gltf(filepath=str(out/'battered-region-b-edge.glb'),export_format='GLB',use_selection=True,export_extras=True)
for obj in parts:obj.location=locations[obj.name]
bpy.ops.wm.save_as_mainfile(filepath=str(out/'kit.blend'))
(out/'kit.json').write_text(json.dumps(kit,separators=(',',':')))
shutil.copy2(__file__,out/Path(__file__).name)
(out/'preservation.json').write_text(json.dumps({'prior':str(prior),'priorKitSHA256':hashlib.sha256((prior/'kit.json').read_bytes()).hexdigest(),'scope':'material-only immediately adjacent cold faces on B-edge, placements2 and9','changedTriangles':count,'totalVariantTriangles':len(variant['triangleMaterials']),'maximumCenterDistance':.095,'maximumCornerDistance':.15,'selectedFaces':faces,'geometryNormalsUvs':'exact JSON unchanged; native mesh untouched','publication':'isolated draft, no owner sign-off'},indent=2))
print('VOLCANIC_R005_DONE',count,'triangles',len(faces),'faces',flush=True)
