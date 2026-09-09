"""Independent GLB/source fidelity and staged traversal interface evidence."""
from pathlib import Path
from collections import Counter
import gzip, hashlib, json, struct, sys, math

OUT=Path(sys.argv[1]);ROOT=Path.cwd()
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
checks=list(measure['checks']);cost={'meshes':len(g['meshes']),'primitives':0,'triangles':0,'materials':len(g['materials']),'textures':len(g.get('textures',[]))}
for node in g['nodes']:
    if 'mesh' not in node:continue
    assert not any(k in node for k in ['matrix','rotation','translation','scale']), 'Unexpected exported group transform'
    group=node['name'].removeprefix('GEO-').removesuffix('--surface');actual=[]
    for primitive in g['meshes'][node['mesh']]['primitives']:
        assert primitive.get('mode',4)==4
        positions=accessor(g,blob,primitive['attributes']['POSITION']);indices=[v[0] for v in accessor(g,blob,primitive['indices'])]
        assert 'NORMAL' in primitive['attributes'] and 'TEXCOORD_0' in primitive['attributes']
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
checks.append({'name':'Portable opaque PBR materials retained','pass':len(g['materials'])==6 and all(m.get('alphaMode','OPAQUE')=='OPAQUE' and not m.get('doubleSided',False) and 'pbrMetallicRoughness' in m for m in g['materials'])})
checks.append({'name':'Only3native groups and4path sockets exported','pass':len(g['meshes'])==3 and len(g['nodes'])==7 and not g.get('cameras') and not g.get('extensions',{}).get('KHR_lights_punctual')})
# Every foot-level exit/landing box is checked independently, including low
# mounting plates. Native geometry does not authorize ordinary walking into void.
landings={side:{'anchorM':measure['pathM'][0 if side=='lower' else -1], 'freeBoundsM':{'min':[2.55,.8,z],'max':[3.45,1.7,z+1.8]}} for side,z in [('lower',.1875),('upper',3.375)]}
for side,l in landings.items():
    hits=[p['name'] for p in measure['nativeSolidBounds'] if overlap(l['freeBoundsM'],p['boundsM'])]
    checks.append({'name':'Actual standing landing clear '+side,'pass':not hits,'hits':hits})
parts=[]
for group in ['traversal-ladder','traversal-guard','traversal-aperture-edge']:
    parts.append({'id':group,'sourceId':'ladder-kit','nodePrefix':'GEO-'+group+'--surface','originM':[0,0,0],'quarterTurns':0})
for role,z,source in [('lower-floor',0,'floor'),('upper-floor',3.1875,'floor'),('lower-roof',3,'roof')]:
    for x in range(0,6,2):
        for y in range(0,6,2):
            if role!='lower-floor' and x==2 and y==2:continue
            parts.append({'id':f'{role}-{x}-{y}','sourceId':source,'nodePrefix':measure['contextSources'][source]['prefix'],'originM':[x,y,z],'quarterTurns':0})
# These guard bounds certify the staged fixed adapter geometry, not a legal
# handrail standard or physical load rating. Its open entry requires authority.
guards=[p for p in measure['nativeSolidBounds'] if p['group']=='traversal-guard']
left=max(p['boundsM']['max'][0] for p in guards if p['boundsM']['max'][0]<3 and p['boundsM']['min'][1]<2)
right=min(p['boundsM']['min'][0] for p in guards if p['boundsM']['min'][0]>3 and p['boundsM']['min'][1]<2)
guarded=len(guards)>=15 and right-left>=1.0
checks.append({'name':'Upper guard assembly has minimum1m clear dedicated entry','pass':guarded,'measuredEntryClearWidthM':right-left})
audit={'schema':'sidereal.native-traversal-audit.v1','adapterId':'shipyard.structure.traversal-ladder','revision':'r000-'+OUT.name,'qualification':{'nativeMeshMatch':all(c['pass'] for c in checks if 'triangle multiset' in c['name']),'physicalApertures':all(c['pass'] for c in checks if 'genuine2m' in c['name']),'capsuleSweepClear':all(c['pass'] for c in checks if 'envelope' in c['name'] or 'landing clear' in c['name']),'guardedLandings':guarded},'body':{'radiusM':.3,'heightM':1.8},'decks':{'lower':{'originZ':0,'walkingZ':.1875},'upper':{'originZ':3.1875,'walkingZ':3.375}},'parts':parts,'apertures':[{'id':'lower-roof-shaft','role':'lower-roof','boundsM':{'min':[2,2,3],'max':[4,4,3.1875]}},{'id':'upper-floor-shaft','role':'upper-floor','boundsM':{'min':[2,2,3.1875],'max':[4,4,3.375]}}],'pathM':measure['pathM'],'corridorFreeBoundsM':measure['corridorFreeBoundsM'],'landings':landings}
passed=all(c['pass'] for c in checks)
report={'schema':'sidereal.native-traversal-validation.v1','pass':passed,'checks':checks,'cost':cost,'sourceBlendSha256':digest((OUT/'blender-source.blend').read_bytes()),'glbSha256':digest((OUT/'kit.glb').read_bytes()),'qualificationScope':'Exact native static geometry and bounded capsule path only; no gameplay publication, pressure/load/armor rating, climb animation fit or owner artistic approval.'}
(OUT/'validation.json').write_text(json.dumps(report,indent=2)+'\n')
(OUT/'traversal-audit.json').write_text(json.dumps(audit,indent=2)+'\n')
sources={'ladder-kit':{'path':str((OUT/'kit.glb').relative_to(ROOT)),'sha256':report['glbSha256']}, **{k:{'path':v['path'],'sha256':v['sha256']} for k,v in measure['contextSources'].items()}}
delivery={'adapterId':audit['adapterId'],'revision':audit['revision'],'status':'native-geometry-qualified' if passed else 'staged','auditSha256':digest((OUT/'traversal-audit.json').read_bytes()),'sources':sources,'runtimePublication':False,'ownerFinalSignoff':None}
(OUT/'delivery.json').write_text(json.dumps(delivery,indent=2)+'\n')
print(json.dumps({'pass':passed,'checks':len(checks),'cost':cost,'auditSha256':delivery['auditSha256'],'glbSha256':report['glbSha256'],'parts':len(parts)}))
if not passed:raise SystemExit(1)
