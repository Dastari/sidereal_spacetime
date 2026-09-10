"""Exact native structural envelope inspection, including proposed roof closure.
No missing triangle repair, no entire-ship gas allocation, no runtime mutation.
"""
import sys,json,hashlib,math
from pathlib import Path
import numpy as np,manifold3d as m
from qualify_wayfarer_airlock_inlet import native_parts,ROOT,solid
KIT=ROOT/'assets/art-library/designs/shipyard.structure.wayfarer-airlock-inlet/revisions/r000/a003'
ROOF=ROOT/'assets/art-library/designs/shipyard.structure.roof-closure/revisions/r000/a001'
cache={}
def shape(path,sha,prefix):
 key=(str(path),sha,prefix)
 if key not in cache:
  assert hashlib.sha256(path.read_bytes()).hexdigest()==sha
  cache[key]=native_parts(path,prefix)[0]
 return cache[key]
def inspect(return_shell=False, world_precision=False, normalize_void=False):
 mapping=json.loads((KIT/'replacement-mapping.json').read_text());skip={p['sourcePlacedId']for p in mapping['replacements']};parts=[];pins=[];rejected=[]
 for p in mapping['preserveOriginalPlacements']:
  if p['sourcePlacedId']in skip or p['role']not in ['structural-wall-unqualified','structural-floor','roof-visual','interior-partition-unqualified']:continue
  v=p['visual'];path=ROOT/'assets/runtime'/v['url'].removeprefix('/assets/')if v else ROOT/'assets/runtime/assembly/parts.glb';sha=v['sha256']if v else hashlib.sha256(path.read_bytes()).hexdigest();prefix=v.get('nodePrefix')if v else'GEO-'+p['assetId']+'--';o=p['originalPlacement']
  try:body=shape(path,sha,prefix);body=body.scale([-1,1,1])if o['flipped']else body;body=body.rotate([0,0,o['rotation']*180/math.pi]).translate(o['position'])
  except Exception as e:rejected.append({'id':p['sourcePlacedId'],'reason':str(e)});print('REJECTED',p['sourcePlacedId'],str(e),flush=True);continue
  parts.append(body);pins.append({'id':p['sourcePlacedId'],'path':str(path.relative_to(ROOT)),'sha256':sha,'nodePrefix':prefix,'transform':o})
  if len(parts)%20==0:print('Validatednativeparts',len(parts),flush=True)
 for p in mapping['replacements']+mapping['additions']:
  if p['layer']=='armor':continue
  v=p['nativeVisual'];o=p['placement'];body=shape(ROOT/v['path'],v['sha256'],v['nodePrefix']).rotate([0,0,o['rotation']*180/math.pi]).translate(o['position']);parts.append(body);pins.append({'id':p['sourcePlacedId'],**v,'transform':o})
 audit=json.loads((ROOT/'assets/art-library/designs/shipyard.structure.external-airlock/revisions/r000/audit-a007.json').read_text())
 for p in mapping['attachedNativeParts']:
  v=audit['sourcePins'][p['source']];assert hashlib.sha256((ROOT/v['path']).read_bytes()).hexdigest()==v['sha256'];body=solid(p['source'],p['nodePrefix']).rotate([0,0,p['quarterTurns']*90]).translate(p['originM']);parts.append(body);pins.append({'id':p['id'],**v,'nodePrefix':p['nodePrefix'],'originM':p['originM'],'quarterTurns':p['quarterTurns']})
 # Native airlock pressure closure uses exact existing gasket endpoint at10nm contact datum.
 for origin,q in [([7,-5,-1e-8],1),([11,-3,-1e-8],3)]:
  v=audit['sourcePins']['gasket'];parts.append(solid('gasket','GEO-door-perimeter-seal--surface').rotate([0,0,q*90]).translate(origin))
 manifest=json.loads((ROOF/'delivery-manifest.json').read_text());new={p['id']:p for p in manifest['parts']};placements=[]
 def joint(kind,origin,q=0):
  p=new[kind];parts.append(shape(ROOF/p['file'],p['sha256'],p['nodePrefix']).rotate([0,0,q*90]).translate(origin));placements.append({'id':'candidate-roof-closure-'+str(len(placements)),'part':kind,'originM':origin,'quarterTurns':q,'source':p})
 for x in [-3,-1,1,3]:
  for y in [-7,-5,-3,-1,1,3,5]:joint('junction-square',[x,y,2.6875])
 for x in [-3,-1,1]:joint('step-rail-2m',[x,7,2.6875])
 for x in [-1,1]:joint('junction-square',[x,9,2.625])
 for x in [-3,3]:joint('step-rail-2m',[x,7,2.6875],1)
 # Native seam rails close underside bevel channels; floor plugs stay below walking datum.
 for y in [-9,-7,-5,-3,-1,1,3,5,7]:
  for x in [-5,-3,-1,1,3]:joint('step-rail-2m' if y==-9 else 'rail-2m',[x,y,2.6875])
 for x in [-5,-3,-1,1,3,5]:
  for y in [-9,-7,-5,-3,-1,1,3,5]:joint('step-rail-2m' if abs(x)==5 else 'rail-2m',[x,y,2.6875],1)
 for x in [-3,-1,1,3]:
  for y in [-7,-5,-3,-1,1,3,5,7]:joint('junction-square',[x,y,.015625])
 # Authored vertical seam companion closes rounded/staggered native wall interfaces.
 wall_dir=ROOF.parent/'a002';wall_part=next(p for p in json.loads((wall_dir/'delivery-manifest.json').read_text())['parts']if p['id']=='wall-seam-2p5m')
 def wall_joint(origin,q=0):
  parts.append(shape(wall_dir/wall_part['file'],wall_part['sha256'],wall_part['nodePrefix']).rotate([0,0,q*90]).translate(origin))
  placements.append({'id':'candidate-wall-closure-'+str(len(placements)),'part':wall_part['id'],'originM':origin,'quarterTurns':q,'source':wall_part,'sourceDirectory':str(wall_dir.relative_to(ROOT))})
 for x in [-5,-3,-1,1,3,5]:wall_joint([x,-9,.1875])
 for side in [-1,1]:
  for y in [-7,-5,-3,-1,1,3,5,7,9]:wall_joint([side*5,y,.1875],1)
 # Complete the front shoulder and lower vestibule interfaces without touching R006.
 for x in [-5,-3,-1,1,3]:joint('step-rail-2m',[x,9,2.6875])
 for x in [-5,5]:joint('step-rail-2m',[x,7,2.6875],1)
 for x in [-1,1]:joint('rail-2m',[x,7,2.625],1)
 for x in [-3,3]:wall_joint([x,9,.1875])
 shoulder_dir=ROOF.parent/'a003';shoulder=next(p for p in json.loads((shoulder_dir/'delivery-manifest.json').read_text())['parts']if p['id']=='shoulder-panel-0p5m')
 for side in [-1,1]:
  origin=[side*2.8125,9,.1875];parts.append(shape(shoulder_dir/shoulder['file'],shoulder['sha256'],shoulder['nodePrefix']).translate(origin));placements.append({'id':'candidate-shoulder-closure-'+str(side),'part':shoulder['id'],'originM':origin,'quarterTurns':0,'source':shoulder,'sourceDirectory':str(shoulder_dir.relative_to(ROOT))})
 # R006 cockpit floor backing starts62.5mm above original main-floor underside.
 for x in [-1,1]:
  for y in [7,9,11]:joint('junction-square',[x,y,.0625])
 if world_precision:
  normalized=[]
  for original in parts:
   mesh=original.to_mesh64();vertices=np.asarray(mesh.vert_properties)[:,:3];rounded=np.round(vertices,6)
   assert np.max(np.abs(vertices-rounded))<=.000000500001
   candidate=m.Manifold(m.Mesh64(np.ascontiguousarray(rounded),np.array(mesh.tri_verts,dtype=np.uint64,copy=True,order="C")))
   assert candidate.status()==m.Error.NoError,str(candidate.status())
   normalized.append(candidate)
  parts=normalized
 print('Unionstructuralparts',len(parts),'rejected',len(rejected),flush=True)
 shell=m.Manifold.batch_boolean(parts,m.OpType.Add);print('Shellstatus',str(shell.status()),'triangles',shell.num_tri(),flush=True)
 if return_shell:return shell
 bound=m.Manifold.cube([22,26,8]).translate([-7,-11,-2]);void=bound-shell;components=[];probe=m.Manifold.cube([.01,.01,.01]).translate([-.005,-.005,1.195]);chamber=m.Manifold.cube([.01,.01,.01]).translate([8.995,-4.005,1.195])
 normalization=None
 if normalize_void:
  from native_void_components import components_without_zero_area_bridges
  decomposed,normalization=components_without_zero_area_bridges(void)
 else:decomposed=void.decompose()
 for c in decomposed:
  if c.volume()<1e-8:continue
  bb=c.bounding_box();components.append({'volumeM3':c.volume(),'boundsM':bb,'containsMainInteriorProbe':(c^probe).volume()>5e-7,'containsAirlockChamberProbe':(c^chamber).volume()>5e-7,'touchesInspectionBoundary':any(abs(bb[j]-[-7,-11,-2,15,15,6][j])<1e-6 for j in range(6))})
 return {'schema':'sidereal.wayfarer-native-enclosure-inspection.v1','status':'inspection-only-no-airtight-approval','sourceRejected':rejected,'zeroAreaNormalization':normalization,'nativeAirlockSolidPolicy':'Existing exact-GLB triangle signatures plus authored constituent solids/contact plan; no synthetic old mesh caps','sourcePins':pins,'proposedNewRoofPlacements':placements,'structuralSolidNativeTriangles':shell.num_tri(),'freeComponents':components,'mainInteriorFiniteClosed':any(c['containsMainInteriorProbe']and not c['touchesInspectionBoundary']for c in components)and not rejected,'limits':['All original art and262placements preserved; source volumes independently validated, no invented closing faces.','Excluded equipment and armor are not silently treated as pressure walls. Their fluid displacement remains a later accounting subtraction.','Probe/component result qualifies only tested exact structural composition; no gas stores or gameplay changed.']}
if __name__=='__main__':
 result=inspect();out=ROOF/'whole-ship-enclosure-inspection-a010.json'
 if out.exists():assert json.loads(out.read_text())==json.loads(json.dumps(result)),'Preserve existing inspection'
 else:out.write_text(json.dumps(result,indent=2)+'\n')
 print(json.dumps({'finite':result['mainInteriorFiniteClosed'],'rejected':result['sourceRejected'],'components':result['freeComponents'],'out':str(out)}))
