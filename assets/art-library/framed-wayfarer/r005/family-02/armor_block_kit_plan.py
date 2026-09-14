"""Pure, finite-direction r005 native armor recipe planner. No runtime writes."""
from __future__ import annotations
import hashlib,json,math
from pathlib import Path
EPS=1e-8
HEIGHTS=(.75,1.5,2.25,3.)
BACKING=.75
DEPTH=1.
DIRECTIONS=sorted({(sx*x,sy*y) for x,y in ((1,0),(0,1),(1,1),(2,1),(1,2),(4,1),(1,4),(8,1),(1,8)) for sx in (-1,1) for sy in (-1,1)},key=lambda p:math.atan2(p[1],p[0]))
# Only measured axis-to-slope and right-angle joints are qualified in this pass.
TURNS=tuple(sorted({round(math.atan2(y,x),12) for x,y in ((8,1),(4,1),(2,1),(1,1),(1,2),(1,4),(1,8),(0,1))}))
def add(a,b):return [a[0]+b[0],a[1]+b[1]]
def mul(a,k):return [a[0]*k,a[1]*k]
def dot(a,b):return a[0]*b[0]+a[1]*b[1]
def cross(a,b):return a[0]*b[1]-a[1]*b[0]
def area(p):return sum(cross(p[i],p[(i+1)%len(p)]) for i in range(len(p)))/2

def clean(poly):
 out=[]
 for p in poly:
  if not out or math.dist(p,out[-1])>EPS:out.append(list(p))
 if len(out)>1 and math.dist(out[0],out[-1])<EPS:out.pop()
 if area(out)<0:out.reverse()
 return out

def clip(poly,normal,limit=0.,keep_positive=True):
 out=[]
 for a,b in zip(poly,poly[1:]+poly[:1]):
  da=dot(a,normal)-limit; db=dot(b,normal)-limit
  if not keep_positive: da=-da; db=-db
  if da>=-EPS:out.append(a)
  if (da>EPS and db < -EPS) or (da < -EPS and db>EPS):
   t=da/(da-db);out.append([a[i]+t*(b[i]-a[i]) for i in range(2)])
 return clean(out) if len(out)>2 else []

def corner_curve(turn,cut,depth):
 t=[math.cos(turn),math.sin(turn)];n=[t[1],-t[0]]
 start=[-cut,-depth];end=add(mul(t,cut),mul(n,depth))
 if depth==0:return [start,[0,0],end]
 if turn>0:return [start,[0,-depth],mul(n,depth),end]
 return [start,[depth*math.tan(turn/2),-depth],end]

def corner_band(turn,cut,low,high):
 return clean(corner_curve(turn,cut,low)+list(reversed(corner_curve(turn,cut,high))))

def part_id(parameters):
 raw=json.dumps(parameters,sort_keys=True,separators=(',',':'))
 return 'armor-block-'+hashlib.sha256(raw.encode()).hexdigest()[:20]

def direction(vector):
 x,y=vector;g=math.gcd(abs(x),abs(y))
 if not g:raise ValueError('ZERO_LENGTH_EDGE')
 p=(x//g,y//g)
 if p not in DIRECTIONS:raise ValueError('UNQUALIFIED_DIRECTION:'+str(p))
 return p

def corner_cut(turn):
 if abs(turn)<EPS:return 0.
 if not any(abs(abs(turn)-a)<1e-9 for a in TURNS):raise ValueError('UNQUALIFIED_TURN:'+str(math.degrees(turn)))
 return .375 if turn>0 else DEPTH*math.tan(abs(turn)/2)+.125

class Planner:
 def __init__(self):self.models={};self.assemblies={}
 def model(self,p):
  ident=part_id(p);self.models.setdefault(ident,{'modelId':ident,'kind':p['kind'],'parameters':p});return ident
 def span(self,length,height,finish='plain',depth=.75):
  return self.model({'kind':'span','lengthM':round(length,12),'heightM':height,'backingDepthM':depth,'finishDepthM':.25,'finish':finish})
 def place(self,ident,pos=(0,0,0),yaw=0.,role='armor',**extra):
  return {'modelId':ident,'position':list(pos),'rotationZRad':yaw,'scale':[1,1,1],'role':role,**extra}
 def boundary(self,name,endpoints32,heights=None,finishes=None,z=0.):
  p=[[v/32 for v in xy] for xy in endpoints32];count=len(p)
  if area(p)<=0:raise ValueError('BOUNDARY_MUST_BE_COUNTERCLOCKWISE')
  heights=heights or [3.]*count;finishes=finishes or ['plain']*count
  vectors=[[endpoints32[(i+1)%count][a]-endpoints32[i][a] for a in range(2)] for i in range(count)]
  dirs=[direction(v) for v in vectors];lengths=[math.hypot(*v)/32 for v in vectors]
  angles=[math.atan2(v[1],v[0]) for v in vectors]
  turns=[(angles[i]-angles[i-1]+math.pi)%(2*math.pi)-math.pi for i in range(count)]
  cuts=[corner_cut(t) for t in turns];placements=[];edges=[];contacts=[]
  for i in range(count):
   if heights[i] not in HEIGHTS:raise ValueError('UNQUALIFIED_HEIGHT')
   length=lengths[i]-cuts[i]-cuts[(i+1)%count]
   if length< -EPS:raise ValueError(f'CORNER_FIT_REJECTED edge {i}: length {lengths[i]} consumed by {cuts[i]} + {cuts[(i+1)%count]}')
   # Exact analytic interval partition: no yaw rounding, no geometry scaling.
   n=max(1,math.ceil((length-EPS)/2)) if length>EPS else 0
   sizes=[2.]*(n-1)+([length-2*(n-1)] if n else [])
   if n>1 and sizes[-1]<.5:
    sizes[-2:]=[(sizes[-2]+sizes[-1])/2]*2
   distance=cuts[i];t=[math.cos(angles[i]),math.sin(angles[i])]
   for j,size in enumerate(sizes):
    finish=finishes[i][j%len(finishes[i])] if isinstance(finishes[i],list) else finishes[i]
    ident=self.span(size,heights[i],finish)
    placements.append(self.place(ident,(*add(p[i],mul(t,distance)),z),angles[i],edgeIndex=i,spanIndex=j,nominalEndpointVector32=vectors[i],distanceFromEndpointM=distance))
    distance+=size
   edges.append({'edgeIndex':i,'endpointVector32':vectors[i],'directionPrimitive':dirs[i],'nominalLengthM':lengths[i], 'startCutbackM':cuts[i],'endCutbackM':cuts[(i+1)%count],'nativeSpanLengthsM':sizes,'remainingM':length})
   if abs(turns[i])>EPS:
    cp={'kind':'junction','turnRadians':round(turns[i],12),'convexity':'convex' if turns[i]>0 else 'concave','cutbackM':round(cuts[i],12),'incomingHeightM':heights[i-1],'outgoingHeightM':heights[i],'backingDepthM':.75,'finishDepthM':.25,'finish':'connector'}
    ident=self.model(cp);placements.append(self.place(ident,(*p[i],z),angles[i-1],vertexIndex=i))
    contacts.append({'vertexIndex':i,'junctionModelId':ident,'incomingPort':add(p[i],mul([math.cos(angles[i-1]),math.sin(angles[i-1])],-cuts[i])),'outgoingPort':add(p[i],mul(t,cuts[i])),'incomingHeightM':heights[i-1],'outgoingHeightM':heights[i]})
  for i,v in enumerate(placements):v['placementId']=f'{name}-{i:03}'
  self.assemblies[name]={'boundaryEndpoints32':endpoints32,'floorTopZ':z,'placements':placements,'edges':edges,'contacts':contacts}
  return self.assemblies[name]
 def fixture(self,name,placements):
  for i,p in enumerate(placements):p['placementId']=f'{name}-{i:03}'
  self.assemblies[name]={'placements':placements}

def make_plan(full=False):
 p=Planner()
 p.fixture('joined-bay',[p.place(p.span(2,3,v),(x,0,0)) for x,v in ((0,'plain'),(2,'vent'),(4,'red-service'))])
 p.fixture('solid-section',[p.place(p.span(2,3,'plain'))])
 p.fixture('convex-45-half-height',[p.place(p.span(2,1.5),(-2.375,0,0)),p.place(p.model({'kind':'junction','turnRadians':round(math.pi/4,12),'convexity':'convex','cutbackM':.375,'incomingHeightM':1.5,'outgoingHeightM':1.5,'backingDepthM':.75,'finishDepthM':.25,'finish':'connector'})),p.place(p.span(math.sqrt(8)-.375,1.5,'vent'),(.375/math.sqrt(2),.375/math.sqrt(2),0),math.pi/4)])
 c=corner_cut(-math.pi/2)
 p.fixture('concave-90',[p.place(p.span(2,3),(-2-c,0,0)),p.place(p.model({'kind':'junction','turnRadians':round(-math.pi/2,12),'convexity':'concave','cutbackM':round(c,12),'incomingHeightM':3.,'outgoingHeightM':3.,'backingDepthM':.75,'finishDepthM':.25,'finish':'connector'})),p.place(p.span(2,3,'red-service'),(0,-c,0),-math.pi/2)])
 if full:
  boundary=[(-5,-9),(5,-9),(5,9),(3,9),(3,11),(1,13),(-1,13),(-3,11),(-3,9),(-5,9)]
  p.boundary('wayfarer',[[int(v*32) for v in q] for q in boundary],[3,3,3,1.5,1.5,1.5,1.5,1.5,3,3],['plain',['red-service','red-service','utility','utility','identity','identity','vent','plain','plain'],'utility','plain','vent','plain','vent','plain','utility',['plain','plain','vent','identity','identity','utility','utility','red-service','red-service']],z=.1875)
  # Distinct station with a reentrant dock and exact 2:1,4:1,1:8 edges.
  alt=[(0,0),(12,0),(12,8),(8,8),(8,4),(4,4),(4,8),(0,8),(-4,6),(-8,5),(-8.5,1),(-8.5,-3),(0,-3)]
  # Axis-to-slope registry is finite; split adjacent slope changes with axis runs.
  alt=[(0,0),(12,0),(12,10),(8,10),(8,5),(4,5),(4,10),(0,10),(-4,8),(-4,5),(-8,4),(-11,4),(-11.5,0),(-11.5,-4),(0,-4)]
  p.boundary('alternate-station',[[round(v*32) for v in q] for q in alt],finishes=['plain','vent','plain','red-service','utility']*3)
  alt2=[(0,0),(10,0),(10,8),(6,8),(4,4),(0,4)]
  p.boundary('alternate-tug',[[round(v*32) for v in q] for q in alt2],finishes=['vent','plain','plain','red-service','utility','plain'])
  p.fixture('heights',[p.place(p.span(2,h),(i*2.6,0,0)) for i,h in enumerate(HEIGHTS)]+[p.place(p.span(2,.75),(11,0,i*.75)) for i in range(4)])
  p.fixture('bulkheads',[p.place(p.span(2,h,'plain',.25),(i*2.6,0,0),role='bulkhead') for i,h in enumerate(HEIGHTS)])
  lineup=[]
  for i,d in enumerate(DIRECTIONS):
   # A 2 m dominant-axis step remains exactly on the 1/32 m floor lattice.
   vector=[int(64*v/max(abs(d[0]),abs(d[1]))) for v in d]
   length=math.hypot(*vector)/32;ident=p.span(length,.75)
   lineup.append(p.place(ident,((i%8)*4,(i//8)*4,0),math.atan2(d[1],d[0]),nominalEndpointVector32=vector,directionPrimitive=d))
  p.fixture('directions-32',lineup)
  corners=[]
  for i,turn in enumerate(TURNS):
   for j,sign in enumerate((1,-1)):
    angle=turn*sign;cp={'kind':'junction','turnRadians':round(angle,12),'convexity':'convex' if sign>0 else 'concave','cutbackM':round(corner_cut(angle),12),'incomingHeightM':1.5,'outgoingHeightM':1.5,'backingDepthM':.75,'finishDepthM':.25,'finish':'connector'}
    corners.append(p.place(p.model(cp),((i%4)*5,(i//4)*6+j*3,0)))
  p.fixture('junction-registry',corners)
 return {'schemaVersion':1,'schema':'sidereal.native-armor-block-kit.v1','revision':5,'stage':'family' if full else 'proof','coordinateSystem':'blender-z-up','placementTransform':'source(x,y,z) -> renderer(x,z,-y); GLBs exported glTF Y-up','depthM':{'backing':.75,'finish':.25,'totalOutward':1.,'bulkheadBacking':.25},'heightPaletteM':HEIGHTS,'directionPalette':DIRECTIONS,'qualifiedTurnRadians':TURNS,'qualifiedTurnConvexities':['convex','concave'],'models':list(p.models.values()),'assemblies':p.assemblies,'limits':['Finite axis-to-slope and 90-degree junction registry only; other turn pairs explicitly rejected.','Concave cutback = total depth*tan(unsigned turn/2)+.125m; convex beveled cutback=.375m.','No visual geometry grants armor, pressure, damage, placement, or runtime authority.','Bulkhead review depth is .25m backing + .25m finish; separate from existing pressure wall.']}

if __name__=='__main__':
 import argparse
 a=argparse.ArgumentParser();a.add_argument('--full',action='store_true');a.add_argument('--out');args=a.parse_args();result=make_plan(args.full)
 if args.out:Path(args.out).write_text(json.dumps(result,indent=2)+'\n')
 else:print(json.dumps(result,indent=2))
