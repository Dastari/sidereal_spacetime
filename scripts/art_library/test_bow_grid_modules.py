"""Independent export checks: every authored/exported bow vertex and triangle stays in
its exact tile polygon; every socket reaches the declared top/bottom without bevel gaps.
Run with system Python; tests need no Blender process or services.
"""
import json, math, struct, unittest
from functools import lru_cache
from pathlib import Path
from bow_modules import bow_module, polygon, heights
from ship_kit_modules import G
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'assets/runtime/ship-kit/r002'

def on_edge(p,a,b,tol=1e-5):
    dx,dy=b[0]-a[0],b[1]-a[1];l=dx*dx+dy*dy
    return abs(dx*(p[1]-a[1])-dy*(p[0]-a[0]))<=tol*max(1,math.sqrt(l)) and -tol<=((p[0]-a[0])*dx+(p[1]-a[1])*dy)/l<=1+tol

def inside(poly,p):
    if any(on_edge(p,a,b) for a,b in zip(poly,poly[1:]+poly[:1])):return True
    yes=False
    for a,b in zip(poly,poly[1:]+poly[:1]):
        if (a[1]>p[1])!=(b[1]>p[1]) and p[0]<a[0]+(p[1]-a[1])*(b[0]-a[0])/(b[1]-a[1]):yes=not yes
    return yes

@lru_cache(maxsize=5)
def bundle(path):
    data=path.read_bytes();assert data[:4]==b'glTF';n=struct.unpack_from('<I',data,12)[0]
    doc=json.loads(data[20:20+n])
    return data,doc,28+n,{node['name']:node['mesh'] for node in doc['nodes']}

@lru_cache(maxsize=5)
def vertex_table(path,index):
    data,doc,binary,_=bundle(path)
    a=doc['accessors'][index];v=doc['bufferViews'][a['bufferView']];off=binary+v.get('byteOffset',0)+a.get('byteOffset',0)
    return [struct.unpack_from('<fff',data,off+i*v.get('byteStride',12)) for i in range(a['count'])]

MANIFEST=json.loads((OUT/'manifest.json').read_text())['pieces']
def positions(piece):
    entry=MANIFEST[piece]
    data,doc,binary,nodes=bundle(OUT/entry['file'])
    mesh=nodes[entry['node']] if 'node' in entry else 0
    result=[]
    for prim in doc['meshes'][mesh]['primitives']:
        assert 'indices' in prim, 'Production kit loader requires indexed GLB primitives'
        a=doc['accessors'][prim['attributes']['POSITION']];v=doc['bufferViews'][a['bufferView']];off=binary+v.get('byteOffset',0)+a.get('byteOffset',0)
        pts=vertex_table(OUT/entry['file'],prim['attributes']['POSITION'])
        ia=doc['accessors'][prim['indices']];iv=doc['bufferViews'][ia['bufferView']]
        fmt,size={5121:('B',1),5123:('H',2),5125:('I',4)}[ia['componentType']]
        io=binary+iv.get('byteOffset',0)+ia.get('byteOffset',0)
        indices=[struct.unpack_from('<'+fmt,data,io+i*size)[0] for i in range(ia['count'])]
        result.extend([(pts[i][0]*16,-pts[i][2]*16,pts[i][1]*16) for i in indices])
    return result

class BowGridTests(unittest.TestCase):
    def test_exported_mating_faces_cover_exact_standard_sections(self):
        # Every allowed neighbour reduces to these local sockets under a rigid
        # quarter-turn/reflection. Check actual indexed triangles, not metadata:
        # the exported face must cover the complete declared trapezoid exactly.
        # Combined with the TS pair enumeration this detects gaps/overlaps even
        # if the grammar/profile JSON itself has remained unchanged.
        specs=json.loads((ROOT/'packages/content/src/ship-kit-pieces.v1.json').read_text())['pieces']
        sockets=0
        for s in specs:
            if s['family']!='bow' or s['args'][-1] not in ['roof','base']:continue
            shape,hc,step,axis,part=s['args'];poly=polygon(shape)
            pts=positions(s['id'])
            thickness=G['bowProfiles']['shellThicknessTexels'][hc][part=='roof']
            for a,b in zip(poly,poly[1:]+poly[:1]):
                length=math.dist(a,b);dx,dy=(b[0]-a[0])/length,(b[1]-a[1])/length
                triangles=[]
                for i in range(0,len(pts),3):
                    tri=pts[i:i+3]
                    if all(on_edge(v,a,b) for v in tri):
                        t=[((v[0]-a[0])*dx+(v[1]-a[1])*dy,v[2]) for v in tri]
                        area2=abs((t[1][0]-t[0][0])*(t[2][1]-t[0][1])-(t[2][0]-t[0][0])*(t[1][1]-t[0][1]))
                        if area2>1e-7:triangles.append((t,area2/2))
                self.assertAlmostEqual(sum(area for _,area in triangles),length*thickness,delta=length*1e-4,msg=(s['id'],a,b,'socket area gap/overlap'))
                def contains(t,p):
                    cross=[(v[0]-u[0])*(p[1]-u[1])-(v[1]-u[1])*(p[0]-u[0]) for u,v in zip(t,t[1:]+t[:1])]
                    return all(n>1e-7 for n in cross) or all(n< -1e-7 for n in cross)
                # Irrational-looking sample offsets avoid landing on triangulation
                # diagonals. Every point must be covered exactly once.
                for u in [.137,.381,.719,.913]:
                    x,y=a[0]+u*(b[0]-a[0]),a[1]+u*(b[1]-a[1])
                    lo,hi=heights(shape,hc,step,axis,x,y)
                    lower=hi-thickness if part=='roof' else lo
                    for v in [.173,.429,.823]:
                        p=(u*length,lower+v*thickness)
                        self.assertEqual(sum(contains(t,p) for t,_ in triangles),1,(s['id'],a,b,p,'socket coverage'))
                sockets+=1
        self.assertGreater(sockets,10000)
    def test_all_exported_vertices_and_triangles_inside_footprint_and_height(self):
        specs=json.loads((ROOT/'packages/content/src/ship-kit-pieces.v1.json').read_text())['pieces'];count=0
        for s in specs:
            if s['family']!='bow':continue
            shape,hc,step,axis,part=s['args'];poly=polygon(shape)
            pts=positions(s['id'])
            for v in pts:
                self.assertTrue(inside(poly,v), (s['id'],v,'outside polygon'))
                lo,hi=heights(shape,hc,step,axis,*v[:2])
                self.assertGreaterEqual(v[2]+3e-5,lo,(s['id'],v,lo))
                self.assertLessEqual(v[2]-3e-5,hi,(s['id'],v,hi))
            for i in range(0,len(pts),3):
                c=tuple(sum(p[j] for p in pts[i:i+3])/3 for j in range(3))
                self.assertTrue(inside(poly,c),(s['id'],c,'triangle crosses concavity'))
            # Structural roof/base endpoints must survive export unchanged. Cosmetic
            # seams are inset; a bevel shrinking a mating edge fails this test.
            if part in ['roof','base']:
                for x,y in poly:
                    lo,hi=heights(shape,hc,step,axis,x,y)
                    floor,roof=G['bowProfiles']['shellThicknessTexels'][hc]
                    for z in ([lo,lo+floor] if part=='base' else [hi-roof,hi]):
                        self.assertTrue(any(math.dist((x,y,z),p)<3e-5 for p in pts),(s['id'],(x,y,z),'missing socket'))
            count+=1
        self.assertEqual(count,10400)
    def test_footprint_check_detects_projection(self):
        poly=polygon('slope1');self.assertFalse(inside(poly,(17,0,0)));self.assertFalse(inside(poly,(10,10,0)))
if __name__=='__main__':unittest.main()
