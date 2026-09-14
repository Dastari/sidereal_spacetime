"""Audit packaged native wall solids against conservative nominal walking reservations.

Run with the existing construction-enclosure Python environment (numpy/shapely).
No geometry, material, catalog or runtime state is changed. Output is create-only.
"""
from pathlib import Path
import argparse, hashlib, json, math, shutil, struct
import numpy as np
from shapely.geometry import Polygon, LineString, Point
from shapely.affinity import rotate

ROOT = Path(__file__).resolve().parents[1]
PACKAGE = ROOT / 'packages/content/src/construction-inset-visuals.json'
TOLERANCE = 1e-6


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def load_triangles(path):
    raw = path.read_bytes()
    magic, version, total = struct.unpack_from('<III', raw)
    assert magic == 0x46546c67 and version == 2 and total == len(raw)
    chunks = {}; cursor = 12
    while cursor < total:
        size, kind = struct.unpack_from('<II', raw, cursor)
        chunks[kind] = raw[cursor+8:cursor+8+size]; cursor += 8+size
    doc = json.loads(chunks[0x4e4f534a]); binary = chunks[0x004e4942]

    def accessor(index):
        a = doc['accessors'][index]; assert 'sparse' not in a
        view = doc['bufferViews'][a['bufferView']]; assert view.get('buffer', 0) == 0
        fmt = {5120:'b',5121:'B',5122:'h',5123:'H',5125:'I',5126:'f'}[a['componentType']]
        count = {'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}[a['type']]
        offset = view.get('byteOffset',0)+a.get('byteOffset',0)
        stride = view.get('byteStride',struct.calcsize(fmt)*count)
        values = np.array([struct.unpack_from('<'+fmt*count,binary,offset+i*stride) for i in range(a['count'])])
        assert not a.get('normalized',False), 'Normalized POSITION/index unsupported, do not silently reinterpret'
        return values

    def matrix(node):
        if 'matrix' in node:
            assert not any(k in node for k in ['translation','rotation','scale'])
            return np.array(node['matrix'],dtype=float).reshape((4,4),order='F')
        x,y,z,w = node.get('rotation',[0,0,0,1])
        assert abs(x*x+y*y+z*z+w*w-1)<1e-6
        r = np.array([[1-2*(y*y+z*z),2*(x*y-z*w),2*(x*z+y*w)],
                      [2*(x*y+z*w),1-2*(x*x+z*z),2*(y*z-x*w)],
                      [2*(x*z-y*w),2*(y*z+x*w),1-2*(x*x+y*y)]])
        out=np.eye(4);out[:3,:3]=r@np.diag(node.get('scale',[1,1,1]));out[:3,3]=node.get('translation',[0,0,0])
        return out

    result=[]; nodes=[]
    def visit(index,parent,ancestors):
        assert index not in ancestors,'Cyclic GLB nodes'
        node=doc['nodes'][index];world=parent@matrix(node)
        if 'mesh' in node:
            mesh=doc['meshes'][node['mesh']]
            start=len(result)
            for prim in mesh['primitives']:
                assert prim.get('mode',4)==4
                vs=accessor(prim['attributes']['POSITION']).astype(float)
                weights=node.get('weights',mesh.get('weights',[0]*len(prim.get('targets',[]))))
                for weight,target in zip(weights,prim.get('targets',[])):
                    if weight and 'POSITION' in target:vs+=weight*accessor(target['POSITION'])
                indices=accessor(prim['indices']).reshape(-1,3).astype(int) if 'indices' in prim else np.arange(len(vs)).reshape(-1,3)
                homogeneous=np.c_[vs,np.ones(len(vs))]@world.T
                assert np.allclose(homogeneous[:,3],1,atol=1e-12,rtol=0)
                # Full GLB world transform first; renderer/glTF XYZ -> native X/-Z/Y.
                native=homogeneous[:,:3][:,[0,2,1]];native[:,1]*=-1
                tris=native[indices]
                if np.linalg.det(world[:3,:3])<0:tris=tris[:,::-1,:]
                result.extend(tris)
            nodes.append({'index':index,'name':node.get('name'),'worldMatrixColumnMajor':world.flatten(order='F').tolist(),'triangles':len(result)-start})
        for child in node.get('children',[]):visit(child,world,ancestors|{index})
    roots=doc['scenes'][doc.get('scene',0)]['nodes']
    for index in roots:visit(index,np.eye(4),set())
    assert result and np.isfinite(result).all()
    return np.array(result),nodes


def turn(values,q):
    result=values.copy()
    for _ in range(q):
        x=result[...,0].copy();result[...,0]=-result[...,1];result[...,1]=x
    return result


def containment(ts,footprint,height,detail=True):
    polygon=Polygon(footprint);assert polygon.is_valid and polygon.area>0
    buffered=polygon.buffer(TOLERANCE,quad_segs=32,join_style='round')
    # Round buffer chords lie within the 1um Euclidean allowance, never outside it.
    verts=ts.reshape(-1,3)
    for i,v in enumerate(verts):
        if v[2]<-TOLERANCE or v[2]>height+TOLERANCE:
            return {'pass':False,'kind':'height','vertexM':v.tolist(),'triangleIndex':i//3}
        if not buffered.covers(Point(v[:2])):
            return {'pass':False,'kind':'vertex-outside-footprint','vertexM':v.tolist(),'triangleIndex':i//3,'distanceOutsideM':polygon.distance(Point(v[:2]))}
    maximum_outside_area=0.;outside_area_sum=0.
    for i,t in enumerate(ts):
        p=Polygon(t[:,:2])
        # A vertical triangle projects to a line; test all of its edges too.
        shape=p if p.area>0 else LineString([*t[:,:2],t[0,:2]])
        if not shape.difference(buffered).is_empty:
            return {'pass':False,'kind':'triangle-crosses-concave-boundary','triangleIndex':i,'triangleM':t.tolist(),'outsideAllowedGeometryWkt':shape.difference(buffered).wkt}
        if detail:
            outside=shape.difference(polygon).area
            maximum_outside_area=max(maximum_outside_area,outside);outside_area_sum+=outside
    return {'pass':True,'maximumTriangleProjectedAreaOutsideExactPolygonM2':maximum_outside_area,'summedProjectedAreaOutsideExactPolygonM2':outside_area_sum}


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output',type=Path,default=ROOT/'assets/art-library/shipyard-completion/inset-collision-audit-r000')
    args=parser.parse_args();out=args.output.resolve();out.mkdir(parents=True,exist_ok=False)
    shutil.copy2(__file__,out/'recipe.py');shutil.copy2(PACKAGE,out/PACKAGE.name)
    package_sha=sha(PACKAGE);package=json.loads(PACKAGE.read_text())
    source_pins={}
    for path,expected in package['sourcePins'].items():
        actual=sha(ROOT/path);assert actual==expected,(path,actual,expected);source_pins[path]=actual
    report={'schema':'sidereal.inset-native-reservation-audit.v1','packagePath':str(PACKAGE.relative_to(ROOT)),'packageSha256':package_sha,'sourcePins':source_pins,'distanceToleranceM':TOLERANCE,'roundingApplied':False,'scope':'Conservative static walking-proxy containment only; no pressure, support, bearing, artistic approval or runtime grant. Empty space in nominal proxy is intentional conservative slack.','parts':[]}
    for part in package['parts']:
        if part['kind']!='wall':continue
        relative=part['url'].removeprefix('/assets/')
        paths=[ROOT/'assets/runtime'/relative,ROOT/'apps/client/public/assets'/relative,ROOT/'apps/dashboard/public/assets'/relative]
        hashes={str(p.relative_to(ROOT)):sha(p) for p in paths}
        assert all(h==part['sha256'] for h in hashes.values()),(part['key'],hashes)
        ts,nodes=load_triangles(paths[0]);footprint=np.array(part['footprintM']);height=part['heightM']
        checks=[];negative=[]
        for q in range(4):
            rotated=turn(ts,q);poly=turn(footprint,q)
            check=containment(rotated,poly,height);checks.append({'quarterTurns':q,**check})
            if not check['pass']:
                failure={'key':part['key'],'hashes':hashes,'orientationChecks':checks}
                report['parts'].append(failure);report['pass']=False
                (out/'audit.json').write_text(json.dumps(report,indent=2)+'\n')
                print(json.dumps({'FIRST_NATIVE_FAILURE':failure}),flush=True);return 1
            for direction in [(1,0),(-1,0),(0,1),(0,-1)]:
                shifted=rotated.copy();shifted[:,:,0]+=direction[0]*.001;shifted[:,:,1]+=direction[1]*.001
                rejection=containment(shifted,poly,height,False)
                assert not rejection['pass'],(part['key'],q,direction,'negative control accepted')
                negative.append({'quarterTurns':q,'shiftM':[direction[0]*.001,direction[1]*.001,0],'rejected':True,'witness':rejection})
        volume=float(np.sum(np.einsum('ij,ij->i',ts[:,0],np.cross(ts[:,1],ts[:,2])))/6)
        proxy_volume=Polygon(footprint).area*height
        report['parts'].append({'key':part['key'],'sha256':part['sha256'],'packageCopies':hashes,'nodes':nodes,'triangles':len(ts),'footprintM':part['footprintM'],'heightM':height,'orientationChecks':checks,'negativeControls':negative,'nativeOrientedTriangleVolumeM3':volume,'nominalProxyVolumeM3':proxy_volume,'conservativeProxySlackVolumeM3':proxy_volume-volume,'slackMethod':'Proxy prism volume minus oriented native closed surface volume; empty proxy space is intentional, not a containment failure.','pass':True})
    assert sha(PACKAGE)==package_sha,'Package changed during audit'
    report['pass']=True;report['wallCount']=len(report['parts']);report['positiveOrientationChecks']=4*len(report['parts']);report['negativeControls']=16*len(report['parts'])
    (out/'audit.json').write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps({k:report[k] for k in ['pass','wallCount','positiveOrientationChecks','negativeControls']}),flush=True)
    return 0

if __name__=='__main__':
    raise SystemExit(main())
