import sys,json,math,hashlib,uuid
from pathlib import Path
sys.path.insert(0,str(Path('.runtime/construction-boundary-kit/python-libs').resolve()))
from shapely.geometry import Polygon,LineString,Point
from shapely.ops import unary_union
from shapely.affinity import rotate,translate
OUT=Path('.runtime/construction-boundary-kit/r004/candidate-a006');OUT.mkdir(parents=True,exist_ok=True)
floorpath=Path('packages/content/src/construction-floor-interfaces.json');floors=json.loads(floorpath.read_text());H=.046875;TOP=3;BOTTOM=.1875
parts={};fixtures=[]
def rot(v,q):
 for _ in range(q%4):v=[-v[1],v[0]]
 return v

def unit(v):l=math.hypot(*v);return [x/l for x in v]
def prim(v):g=math.gcd(abs(v[0]),abs(v[1]));return [v[0]//g,v[1]//g]
def canonical(rays):
 choices=[(sorted([rot(r,q)for r in rays]),q)for q in range(4)];return min(choices,key=lambda x:x[0])
def uid(k):return str(uuid.uuid5(uuid.NAMESPACE_URL,'sidereal:boundary:r004:'+k))
def polycoords(p):return [[round(x,14),round(y,14)]for x,y in list(p.exterior.coords)[:-1]]
def node_part(rays):
 rays,q=canonical(rays);signature=json.dumps(rays,separators=(',',':'));pid='node-'+hashlib.sha256(signature.encode()).hexdigest()[:12]
 if pid in parts:return pid,(4-q)%4
 us=[unit(r)for r in rays]
 if len(rays)==2:
  angle=math.acos(max(-1,min(1,sum(us[0][k]*us[1][k]for k in range(2)))))
  if abs(angle-math.pi)<1e-8:cut=.0625
  elif angle>=math.pi/2-1e-8:cut=.0625
  else:cut=math.ceil((.0625/math.tan(angle/2)+.015625)*32-1e-10)/32
  profile=LineString([[us[0][k]*cut for k in range(2)],[0,0],[us[1][k]*cut for k in range(2)]]).buffer(H,cap_style='flat',join_style='mitre',mitre_limit=1000)
 elif len(rays)==3 and all(x==0 or y==0 for x,y in rays):
  cut=.0625;profile=unary_union([LineString([[0,0],[u[0]*cut,u[1]*cut]]).buffer(H,cap_style='flat')for u in us])
 else:raise ValueError('Unsupported node signature '+signature)
 assert profile.is_valid and profile.geom_type=='Polygon' and not profile.interiors
 ports=[{'directionUnits':r,'positionM':[u[0]*cut,u[1]*cut],'normalOut':u,'segmentM':[[u[0]*cut-u[1]*H,u[1]*cut+u[0]*H],[u[0]*cut+u[1]*H,u[1]*cut-u[0]*H]],'widthM':2*H,'verticalRangeM':[BOTTOM,TOP],'nominalContactAreaM2':2*H*(TOP-BOTTOM)}for r,u in zip(rays,us)]
 parts[pid]={'id':pid,'assetUuid':uid(pid),'kind':'node','signatureRays':rays,'cutbackM':cut,'corePolygonM':polycoords(profile),'ports':ports,'sourceSpanUnits':None,'scope':'two-ray convex/reentrant/straight physical node'if len(rays)==2 else'orthogonal T node'}
 return pid,(4-q)%4

def wall_part(delta,start,end):
 q=next(q for q in range(4)if rot(delta,q)[0]>0 and rot(delta,q)[1]>=0);v=rot(delta,q);sig=json.dumps([v,start,end],separators=(',',':'));pid='span-'+hashlib.sha256(sig.encode()).hexdigest()[:12]
 if pid in parts:return pid,(4-q)%4
 d=[x/32 for x in v];u=unit(d);n=[-u[1],u[0]];a=[u[i]*start for i in range(2)];b=[d[i]-u[i]*end for i in range(2)];L=math.hypot(*d)-start-end;assert L>.05,(v,start,end)
 poly=[[p[i]+s*n[i]*H for i in range(2)]for p,s in [(a,-1),(b,-1),(b,1),(a,1)]]
 ports=[{'endpoint':k,'positionM':p,'normalOut':[direction*x for x in u],'segmentM':[[p[i]+s*n[i]*H for i in range(2)]for s in [-1,1]],'widthM':2*H,'verticalRangeM':[BOTTOM,TOP],'nominalContactAreaM2':2*H*(TOP-BOTTOM)}for k,p,direction in [('start',a,-1),('end',b,1)]]
 parts[pid]={'id':pid,'assetUuid':uid(pid),'kind':'span','sourceSpanUnits':v,'startCutbackM':start,'endCutbackM':end,'bodyLengthM':L,'corePolygonM':poly,'ports':ports,'sourceStartM':[0,0],'sourceEndM':d,'scope':'exact native authored length and paired endpoint variant; never scaled'}
 return pid,(4-q)%4

def build(name,loop,extra=None,nativefloors=None):
 extra=extra or[];points={};edges=[]
 for a,b in list(zip(loop,loop[1:]+loop[:1]))+extra:
  a=tuple(a);b=tuple(b);edges.append((a,b));points.setdefault(a,[]).append(prim([b[i]-a[i]for i in range(2)]));points.setdefault(b,[]).append(prim([a[i]-b[i]for i in range(2)]))
 placements=[];nodeinfo={}
 for i,(point,rays)in enumerate(sorted(points.items())):
  pid,q=node_part(rays);row={'key':name+':node:'+','.join(map(str,point)),'partId':pid,'originUnits':list(point),'quarterTurns':q,'role':'boundary-node'};placements.append(row);nodeinfo[point]=(row,parts[pid]['cutbackM'])
 for i,(a,b)in enumerate(edges):
  pid,q=wall_part([b[k]-a[k]for k in range(2)],nodeinfo[a][1],nodeinfo[b][1]);placements.append({'key':name+':span:'+str(i),'partId':pid,'originUnits':list(a),'quarterTurns':q,'role':'partition-span'if i>=len(loop)else'perimeter-span','aUnits':list(a),'bUnits':list(b),'startNodeKey':nodeinfo[a][0]['key'],'endNodeKey':nodeinfo[b][0]['key']})
 polygons=[]
 for p in placements:
  pp=Polygon(parts[p['partId']]['corePolygonM']);pp=translate(rotate(pp,p['quarterTurns']*90,origin=(0,0)),p['originUnits'][0]/32,p['originUnits'][1]/32);polygons.append(pp)
 shape=Polygon([[x/32,y/32]for x,y in loop]);expected=shape.buffer(H,join_style='mitre',mitre_limit=1000).difference(shape.buffer(-H,join_style='mitre',mitre_limit=1000))
 if extra:expected=unary_union([expected]+[LineString([[x/32,y/32]for x,y in e]).buffer(H,cap_style='flat')for e in extra])
 actual=unary_union(polygons);overlap=sum(p.area for p in polygons)-actual.area;diff=actual.symmetric_difference(expected).area
 assert overlap<1e-9 and diff<1e-9,(name,overlap,diff)
 contacts=[]
 for p,poly in zip(placements,polygons):
  if'NodeKey'not in ''.join(p.keys()):continue
  for side in ['start','end']:
   key=p[side+'NodeKey'];idx=next(i for i,q in enumerate(placements)if q['key']==key);length=poly.boundary.intersection(polygons[idx].boundary).length
   # Source float coordinates can make Shapely line intersection miss mathematically identical endpoints.
   distance=poly.distance(polygons[idx]);contacts.append({'spanKey':p['key'],'nodeKey':key,'side':side,'measuredBoundaryIntersectionM':length,'distanceM':distance,'requiredPortWidthM':2*H})
 fixtures.append({'id':name,'nominalPolygonUnits':loop,'partitionsUnits':extra,'nativeFloors':nativefloors or[],'placements':placements,'validation':{'coreOverlapAreaM2':overlap,'coreSymmetricDifferenceFromExactMiterRingM2':diff,'nominalPortContacts':contacts,'corePlanarGeometryPass':True},'pressureAcceptance':False})
for p in floors['parts']:build('single-'+p['id'],p['footprint'],nativefloors=[{'partId':p['id'],'originUnits':[0,0],'quarterTurns':0,'native':p['native']}])
by={p['id']:p for p in floors['parts']}
def fp(k,xy):return {'partId':k,'originUnits':xy,'quarterTurns':0,'native':by[k]['native']}
build('mixed-reentrant-L',[[0,0],[128,0],[128,64],[64,64],[64,128],[0,128]],nativefloors=[fp('square-2m',[0,0]),fp('square-2m',[64,0]),fp('square-2m',[0,64])])
build('mixed-square-triangle',[[0,0],[128,0],[64,64],[0,64]],nativefloors=[fp('square-2m',[0,0]),fp('triangle-45',[64,0])])
build('mixed-orthogonal-T',[[0,0],[64,0],[128,0],[128,64],[64,64],[0,64]],extra=[[[64,0],[64,64]]],nativefloors=[fp('square-2m',[0,0]),fp('square-2m',[64,0])])
build('mixed-collinear-module-joins',[[0,0],[64,0],[128,0],[128,64],[64,64],[0,64]],nativefloors=[fp('square-2m',[0,0]),fp('square-2m',[64,0])])
report={'schema':'sidereal.native-boundary-family-plan.v1','revision':'r004','latticePerMeter':32,'floorTopUnits':6,'wallTopUnits':96,'coreThicknessM':H*2,'decorativeEnvelopeWidthM':.125,'nativeFloorInterfaceSha256':hashlib.sha256(floorpath.read_bytes()).hexdigest(),'parts':list(parts.values()),'fixtures':fixtures,'grammar':{'matching':'primitive integer ray vectors sorted, canonicalize over exact quarter-turns only; no reflection or scaling','nodeSignatures':[{'partId':p['id'],'rays':p['signatureRays'],'cutbackM':p['cutbackM']}for p in parts.values()if p['kind']=='node'],'spanSignatures':[{'partId':p['id'],'deltaUnits':p['sourceSpanUnits'],'startCutbackM':p['startCutbackM'],'endCutbackM':p['endCutbackM']}for p in parts.values()if p['kind']=='span'],'reject':['Unlisted node signatures including diagonal T and four-way crossings','Unlisted span lengths/end-cutback pairing','Unsupported floorTop/ceiling datums','Door/passage opening not separately adapted to endpoint profile','Any arbitrary scale/reflection or inferred geometry substitution']},'geometryAuthority':'Nominal contact declarations and fitted native geometry only; no pressure/structural strength acceptance'}
(OUT/'family-plan.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({'parts':len(parts),'nodes':sum(p['kind']=='node'for p in parts.values()),'spans':sum(p['kind']=='span'for p in parts.values()),'fixtures':len(fixtures),'maxPlanarDifference':max(f['validation']['coreSymmetricDifferenceFromExactMiterRingM2']for f in fixtures)},indent=2))
