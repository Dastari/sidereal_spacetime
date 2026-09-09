"""Exact native low-step/header qualification; no GLB edits or publication."""
from pathlib import Path
import hashlib,json,struct,math
from qualify_wayfarer_walking import geometry,hull,octagon
ROOT=Path(__file__).resolve().parents[1]
PATH='assets/runtime/assembly/hull/finish-r004/part-70c422bca2d395c35ecb/clean.glb'
SHA='825a836cb96f74363c83c1d5be4efc1a11df0ef71bbdafff8b2abb222cebdad6'
OUT=ROOT/'packages/content/src/wayfarer-threshold-proof.json'
def qualify():
 raw=(ROOT/PATH).read_bytes();assert hashlib.sha256(raw).hexdigest()==SHA
 n=struct.unpack_from('<I',raw,12)[0];g=json.loads(raw[20:20+n]);size,kind=struct.unpack_from('<I4s',raw,20+n);assert kind==b'BIN\x00';data=raw[28+n:28+n+size]
 assert all(set(n)<= {'name','extras','mesh'}for n in g['nodes'])
 def values(i):
  a=g['accessors'][i];v=g['bufferViews'][a['bufferView']];assert 'sparse'not in a and v['buffer']==0
  fmt={5126:'f',5123:'H',5125:'I'}[a['componentType']];width={'VEC3':3,'SCALAR':1}[a['type']];stride=v.get('byteStride',struct.calcsize(fmt)*width);off=v.get('byteOffset',0)+a.get('byteOffset',0)
  return [struct.unpack_from('<'+fmt*width,data,off+k*stride)for k in range(a['count'])]
 supports=[];sides=[[],[]];header=[]
 for name,coords in geometry(PATH,SHA,None):
  world=[(1-x,9-y,.1875+z)for x,y,z in coords]
  low=name=='GEO-Airlock threshold'or name.startswith('GEO-Amber threshold marker')
  if low:
   assert max(p[2] for p in world)-.1875<=.0625
   node=next(n for n in g['nodes']if n['name']==name);tops=[]
   for pr in g['meshes'][node['mesh']]['primitives']:
    vs=values(pr['attributes']['POSITION']);indices=[v[0]for v in values(pr['indices'])]
    for i in range(0,len(indices),3):
     tri=[(1-vs[j][0],9+vs[j][2],.1875+vs[j][1])for j in indices[i:i+3]]
     a,b,c=tri;nz=(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])
     if nz>1e-12:tops.append(tri)
   assert tops
   supports.append({'sourceNode':name,'topTrianglesM':tops,'maximumElevationM':max(p[2]for p in world)})
  elif min(p[2]for p in world)>.1875+.0625+1.8:
   header.append({'sourceNode':name,'minimumElevationM':min(p[2]for p in world)})
  else:
   xs=[p[0]for p in world];assert min(xs)>=.6249 or max(xs)<=-.6249,'Unexpected geometry occupies qualified doorway'
   sides[0 if max(xs)<0 else 1]+=world
 assert len(supports)==6 and len(header)==1
 return {'schema':'sidereal.wayfarer-low-step.v1','sourcePlacedId':'pilot-r004-airlock-frame-22','assetId':'part-70c422bca2d395c35ecb','path':PATH,'sha256':SHA,'positionM':[1,9,.1875],'rotationRadians':math.pi,'deckId':'wayfarer-main-deck','floorElevationM':.1875,'maximumStepM':.0625,'maximumBodyHeightM':1.8,'bodyRadiusM':.3,'sideObstacles':[{'vertices':octagon(hull(p))}for p in sides],'supportSurfaces':supports,'headerClearance':header,'minimumHeaderElevationM':min(h['minimumElevationM']for h in header),'qualifiedScope':'Exact static low-obstacle stepping and native upper-surface contact; no general stairs, structural load or pressure rating'}
if __name__=='__main__':
 import sys
 result=qualify();text=json.dumps(result,indent=2)+'\n'
 if '--write'in sys.argv:OUT.write_text(text)
 else:assert OUT.read_text()==text
 print(json.dumps({'status':'passed','supportSurfaces':len(result['supportSurfaces']),'nativeTopTriangles':sum(len(s['topTrianglesM'])for s in result['supportSurfaces']),'headerUndersideM':result['minimumHeaderElevationM'],'maximumStepM':result['maximumStepM']}))
