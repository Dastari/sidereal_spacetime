"""Independent GLB/source fidelity and staged traversal interface evidence."""
from pathlib import Path
from collections import Counter
import gzip, hashlib, json, struct, sys, math

OUT=Path(sys.argv[1]).resolve();ROOT=Path.cwd()
def digest(data):return hashlib.sha256(data).hexdigest()
def read_glb(path):
    data=path.read_bytes();magic,version,total=struct.unpack_from('<III',data);assert magic==0x46546c67 and version==2 and total==len(data)
    length,kind=struct.unpack_from('<II',data,12);assert kind==0x4e4f534a
    doc=json.loads(data[20:20+length]);offset=20+length;n,kind=struct.unpack_from('<II',data,offset);assert kind==0x004e4942
    return doc,data[offset+8:offset+8+n]
def accessor(doc,blob,i):
    a=doc['accessors'][i];v=doc['bufferViews'][a['bufferView']];fmt={5126:'f',5125:'I',5123:'H',5121:'B'}[a['componentType']];count={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}[a['type']]
    size=struct.calcsize(fmt)*count;start=v.get('byteOffset',0)+a.get('byteOffset',0);stride=v.get('byteStride',size)
    return [struct.unpack_from('<'+fmt*count,blob,start+k*stride) for k in range(a['count'])]
def triangle_key(triangle):return tuple(sorted(tuple(round(n*1_000_000) for n in p) for p in triangle))
def overlap(a,b):return all(min(a['max'][i],b['max'][i])-max(a['min'][i],b['min'][i])>1e-6 for i in range(3))
measure=json.loads((OUT/'native-measurements.json').read_text());expected=json.loads(gzip.decompress((OUT/'authored-triangles.json.gz').read_bytes()));g,blob=read_glb(OUT/'kit.glb')
checks=[];cost={'meshes':len(g['meshes']),'primitives':0,'triangles':0,'materials':len(g['materials']),'textures':len(g.get('textures',[]))}
for node in g['nodes']:
    if 'mesh' not in node:continue
    assert not any(k in node for k in ['matrix','rotation','translation','scale']), 'Unexpected exported group transform'
    group=node['name'].removeprefix('GEO-').removesuffix('--surface');actual=[]
    for primitive in g['meshes'][node['mesh']]['primitives']:
        assert primitive.get('mode',4)==4
        positions=accessor(g,blob,primitive['attributes']['POSITION']);indices=[v[0] for v in accessor(g,blob,primitive['indices'])]
        assert 'NORMAL' in primitive['attributes']
        assert all(math.isfinite(n) for p in positions for n in p)
        for k in range(0,len(indices),3):actual.append([(positions[j][0],-positions[j][2],positions[j][1]) for j in indices[k:k+3]])
        cost['primitives']+=1;cost['triangles']+=len(indices)//3
    # Floating-point export can straddle a rounding-grid boundary by<1um.
    # Match actual vertices to measured authored vertices within the declared
    # metric tolerance, then require identical triangle connectivity/multiplicity.
    buckets={}
    for triangle in expected[group]:
        for p in triangle:
            key=tuple(math.floor(n*100000) for n in p)
            buckets.setdefault(key,set()).add(tuple(p))
    max_error=0; mapped=[]; vertex_cache={}
    for triangle in actual:
        mapped_triangle=[]
        for p in triangle:
            if p not in vertex_cache:
                key=tuple(math.floor(n*100000) for n in p)
                candidates=[q for dx in [-1,0,1] for dy in [-1,0,1] for dz in [-1,0,1] for q in buckets.get((key[0]+dx,key[1]+dy,key[2]+dz),[])]
                assert candidates,'Native vertex missing from authored source'
                q=min(candidates,key=lambda q:sum((p[i]-q[i])**2 for i in range(3)))
                error=max(abs(p[i]-q[i]) for i in range(3));max_error=max(max_error,error)
                vertex_cache[p]=q
            mapped_triangle.append(vertex_cache[p])
        mapped.append(mapped_triangle)
    match=max_error<=1e-6 and Counter(map(triangle_key,mapped))==Counter(map(triangle_key,expected[group]))
    checks.append({'name':'Exact authored-to-GLB triangle multiset '+group,'pass':match,'triangles':len(actual),'coordinateToleranceM':1e-6,'maxVertexCoordinateDeviationM':max_error})
checks.append({'name':'Six opaque native PBR materials preserved','pass':len(g['materials'])==6 and all(m.get('alphaMode','OPAQUE')=='OPAQUE' and not m.get('doubleSided',False) and 'pbrMetallicRoughness' in m for m in g['materials'])})
checks.append({'name':'Eight native groups and four sockets only','pass':len(g['meshes'])==8 and len(g['nodes'])==12 and not g.get('cameras')})
source=json.loads(gzip.decompress((OUT/'native-collision-triangles.json.gz').read_bytes()))
solids=measure['nativeSolidBounds'];supports={s['sourceTreadId']:s for s in measure['supportPatches']};radius=.3;height=1.8;tolerance=1e-6
# Exact area coverage of each contact rectangle by coplanar top triangles of its
# primary native backing piece; materials/inlays never substitute for support.
def clip(poly,axis,value,keep_above):
 result=[]
 for a,b in zip(poly,poly[1:]+poly[:1]):
  aa=a[axis]>=value if keep_above else a[axis]<=value;bb=b[axis]>=value if keep_above else b[axis]<=value
  if aa:result.append(a)
  if aa!=bb:
   t=(value-a[axis])/(b[axis]-a[axis]);result.append([a[j]+t*(b[j]-a[j]) for j in range(2)])
 return result
def area(poly):return abs(sum(a[0]*b[1]-b[0]*a[1] for a,b in zip(poly,poly[1:]+poly[:1])))/2 if poly else 0
for id,s in supports.items():
 if id.startswith('flight-'):native_name='GEO-stair-'+id[:8]+'--'+id[9:]
 elif id=='midlanding':native_name='GEO-stair-midlanding--bearing-pan'
 else:native_name=next(o['name'] for o in source if o.get('sourcePartId')==s['sourcePartId'])
 native=next(o for o in source if o['name']==native_name);poly=s['supportPolygonM'];lo=poly[0];hi=poly[2];expected_area=(hi[0]-lo[0])*(hi[1]-lo[1]);covered=0
 for tri in native['trianglesM']:
  if not all(abs(p[2]-s['topZM'])<tolerance for p in tri):continue
  q=[p[:2] for p in tri]
  for axis in [0,1]:q=clip(q,axis,lo[axis],True);q=clip(q,axis,hi[axis],False)
  covered+=area(q)
 checks.append({'name':'Actual flat native contact '+id,'pass':abs(covered-expected_area)<1e-6,'nativeObject':native_name,'contactAreaM2':expected_area,'coveredAreaM2':covered})

def capsule_union_clear(xy,zlo,zhi):
 core={'min':[*xy['min'],zlo+radius],'max':[*xy['max'],zhi+height-radius]};hits=[];minclear=1000
 for s in solids:
  b=s['boundsM'];clear=math.sqrt(sum(max(b['min'][j]-core['max'][j],0,core['min'][j]-b['max'][j])**2 for j in range(3)))-radius;minclear=min(minclear,clear)
  if clear < -tolerance:hits.append({'solidId':s['name'],'penetrationLowerBoundM':-clear})
 return {'pass':not hits,'hits':hits,'minimumContainingBoxClearanceM':minclear}
def inside(s,b):
 p=s['supportPolygonM'];return all(b['min'][i]>=p[0][i]-tolerance and b['max'][i]<=p[2][i]+tolerance for i in range(2))
steps=[];step_results=[];rest_pass=True;sweep_pass=True
for flight,count in [('a',9),('b',8)]:
 ids=(['lower-landing']+[f'flight-a-tread-{k:02}' for k in range(1,9)]+['midlanding']) if flight=='a' else (['midlanding']+[f'flight-b-tread-{k:02}' for k in range(1,8)]+['upper-landing'])
 for i in range(count):
  y=1.375+i*.3125 if flight=='a' else 4.5-i*.3125
  xy={'min':[.60 if flight=='a' else 2.60,y+.010 if flight=='a' else y-.025],'max':[1.40 if flight=='a' else 3.40,y+.025 if flight=='a' else y-.010]};advance=[0,.3125 if flight=='a' else -.3125];dest={k:[xy[k][j]+advance[j] for j in range(2)] for k in ['min','max']};a=supports[ids[i]];b=supports[ids[i+1]];z=max(a['topZM'],b['topZM']);id=f'flight-{flight}-step-{i+1:02}'
  phases=[('source-rest',xy,a['topZM'],a['topZM']),('lift',xy,a['topZM'],z),('forward',{'min':[min(xy['min'][j],dest['min'][j]) for j in range(2)],'max':[max(xy['max'][j],dest['max'][j]) for j in range(2)]},z,z),('settle',dest,b['topZM'],z),('destination-rest',dest,b['topZM'],b['topZM'])]
  results=[]
  for phase,box,zlo,zhi in phases:
   r=capsule_union_clear(box,zlo,zhi);results.append({'phase':phase,**r})
   if 'rest' in phase:rest_pass&=r['pass']
   else:sweep_pass&=r['pass']
  contact=inside(a,xy) and inside(b,dest);rest_pass&=contact
  checks.append({'name':'Bidirectional continuous supported step '+id,'pass':contact and all(r['pass'] for r in results),'actualSourceAndDestinationContact':contact,'phases':results})
  steps.append({'id':id,'fromSupportId':ids[i],'toSupportId':ids[i+1],'fromBoundsM':{k:[v+2 for v in xy[k]] for k in ['min','max']},'advanceM':advance,'clearanceZM':z});step_results.append({'id':id,'phases':results})
# Ordinary horizontal walking on the turn/approaches: all positions in each
# corridor and their continuous sweep, not just centerline endpoint checks.
walk_corridors=[('lower-approach',{'min':[.60,.75],'max':[1.40,1.400]},.1875),('mid-in',{'min':[.60,4.1975],'max':[1.40,5.0725]},1.875),('mid-turn',{'min':[.60,5.0525],'max':[3.40,5.0725]},1.875),('mid-out',{'min':[2.60,4.475],'max':[3.40,5.0725]},1.875),('upper-approach',{'min':[2.60,.75],'max':[3.40,1.990]},3.375)]
for name,box,z in walk_corridors:
 r=capsule_union_clear(box,z,z);checks.append({'name':'Continuous full-body walking corridor '+name,**r});sweep_pass&=r['pass']
# Explicitly retain the failed alternative instead of pretending tread-center stops fit.
center_witness=[]
for id,s in supports.items():
 if s['role']!='tread':continue
 p=s['supportPolygonM'];xy={'min':[(p[0][j]+p[2][j])/2 for j in range(2)],'max':[(p[0][j]+p[2][j])/2 for j in range(2)]};r=capsule_union_clear(xy,s['topZM'],s['topZM']);center_witness.append({'supportId':id,**r})
checks.append({'name':'Unsafe tread-center stops rejected by actual solid bounds','pass':all(not r['pass'] for r in center_witness),'rejectedCount':sum(not r['pass'] for r in center_witness)})
# Opening is the measured omission of panel slabs; fascia/guards remain separately audited solids.
physical=True
for role,z0,z1 in [('lower-roof',3,3.1875),('upper-floor',3.1875,3.375)]:
 aperture={'min':[0,2,z0],'max':[4,6,z1]};hits=[s['name'] for s in solids if s['group']==role and overlap(aperture,s['boundsM'])];r={'name':'Actual four-panel aperture '+role,'pass':not hits,'hits':hits};checks.append(r);physical&=r['pass']
# Measure both full-flight guard intrusions, including shoes, against the clear strip.
import re
guarded=True
for flight in ['a','b']:
 widths=[]
 for side in [0,1]:
  bounds=[s['boundsM'] for s in solids if re.search(r'--'+flight+r'-(post|shoe|rail|toe)-'+str(side)+r'(?:-|$)',s['name'])]
  assert bounds;widths.append(max(b['max'][0] for b in bounds) if side==0 else min(b['min'][0] for b in bounds))
 width=widths[1]-widths[0];ok=width>=1.5-1e-6;guarded&=ok;checks.append({'name':'Full flight clear width '+flight,'pass':ok,'measuredMinimumM':width})
# Exact artifact frame conversion: local editable sources; installed board places kit+[2,2,0].
ss=[]
for id,s in supports.items():
 ss.append({'id':id,'partId':s['sourcePartId'],'boundsM':{'min':[v+2 for v in s['supportPolygonM'][0]],'max':[v+2 for v in s['supportPolygonM'][2]]},'topZM':s['topZM'],'kind':'intermediate' if s['role']=='intermediate-landing' else s['role'],'neighbours':s['nextTreadIds']})
solid_audit=[{'id':s['name'],'partId':s.get('sourcePartId',s['group']),'boundsM':{k:[v+(2 if i<2 else 0) for i,v in enumerate(s['boundsM'][k])] for k in ['min','max']}} for s in solids]
native_match=all(c['pass'] for c in checks if 'triangle multiset' in c['name'])
audit={'schema':'sidereal.native-stair-audit.v1','adapterId':'shipyard.structure.stair-dogleg','revision':'r000-'+OUT.name,'qualification':{'nativeMeshMatch':native_match,'physicalApertures':physical,'fullBodyStepSweeps':sweep_pass,'supportedStops':rest_pass,'guardedLandings':guarded},'body':{'radiusM':radius,'heightM':height},'decks':{'lower':{'originZ':0,'walkingZ':.1875},'upper':{'originZ':3.1875,'walkingZ':3.375}},'parts':measure['parts'],'apertures':[{'id':'lower-roof-stairwell','role':'lower-roof','boundsM':{'min':[2,4,3],'max':[6,8,3.1875]}},{'id':'upper-floor-stairwell','role':'upper-floor','boundsM':{'min':[2,4,3.1875],'max':[6,8,3.375]}}],'supports':ss,'solids':solid_audit,'steps':steps,'limits':{'maxRiseM':.1875,'maxDropM':.1875,'maxAdvanceM':.3125,'maxLiftM':.1875}}
report={'schema':'sidereal.native-stair-validation.v1','pass':all(c['pass'] for c in checks),'checks':checks,'cost':cost,'sourceBlendSha256':digest((OUT/'blender-source.blend').read_bytes()),'glbSha256':digest((OUT/'kit.glb').read_bytes()),'capsuleMethod':'Continuous Minkowski sweep: union of upright capsule core segments over each rectangular launch strip and linear phase is a containing core AABB; distance to every evaluated-native object AABB must be >=radius. Reverse uses identical swept set. Actual contact rectangles independently covered by native planar triangles.','unsupportedAlternative':'Tread-center stops fail and are forbidden. Only qualified downhill-edge resting strips may settle; interrupted steps must finish or reverse through the same bounded sweep.','qualificationScope':'Pinned static native geometry, actual support rectangles and bounded full-size capsule step/walk envelopes; no runtime integration, character animation/armor fit, pressure/load/damage rating or owner artistic approval.'}
(OUT/'validation.json').write_text(json.dumps(report,indent=2)+'\n');(OUT/'stair-audit.json').write_text(json.dumps(audit,indent=2)+'\n');(OUT/'rejected-center-stops.json').write_text(json.dumps(center_witness,indent=2)+'\n')
delivery={'adapterId':audit['adapterId'],'revision':audit['revision'],'status':'native-geometry-qualified' if report['pass'] else 'staged','auditSha256':digest((OUT/'stair-audit.json').read_bytes()),'sources':{'stair-kit':{'path':str((OUT/'kit.glb').relative_to(ROOT)),'sha256':report['glbSha256']},**{k:{'path':v['path'],'sha256':v['sha256']} for k,v in measure['contextSources'].items()}},'runtimePublication':False,'ownerFinalSignoff':None}
(OUT/'delivery.json').write_text(json.dumps(delivery,indent=2)+'\n');(OUT/'validate.py').write_bytes(Path(__file__).read_bytes())
print(json.dumps({'pass':report['pass'],'checks':len(checks),'failures':[c['name'] for c in checks if not c['pass']],'cost':cost,'auditSha256':delivery['auditSha256'],'glbSha256':report['glbSha256']}))
if not report['pass']:raise SystemExit(1)
