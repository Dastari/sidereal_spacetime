"""Qualify actual GLB vertices, continuous standing support and full moving sweeps.

This tests the proposed source revision; it never flips production admission or publishes art.
"""
import hashlib
import itertools
import json
import math
from pathlib import Path
import struct
import unittest

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / 'assets/runtime/wayfarer-access/r001'


def multiply(a,b): return [[sum(a[r][k]*b[k][c] for k in range(4)) for c in range(4)] for r in range(4)]
def matrix(node):
    if 'matrix' in node: return [[node['matrix'][c*4+r] for c in range(4)] for r in range(4)]
    x,y,z,w=node.get('rotation',[0,0,0,1]);s=node.get('scale',[1,1,1]);t=node.get('translation',[0,0,0])
    rot=[[1-2*(y*y+z*z),2*(x*y-z*w),2*(x*z+y*w)], [2*(x*y+z*w),1-2*(x*x+z*z),2*(y*z-x*w)], [2*(x*z-y*w),2*(y*z+x*w),1-2*(x*x+y*y)]]
    return [[rot[r][c]*s[c] for c in range(3)]+[t[r]] for r in range(3)]+[[0,0,0,1]]
IDENTITY=[[int(r==c) for c in range(4)] for r in range(4)]


def glb(piece):
    data=(ASSETS/piece['file']).read_bytes()
    if hashlib.sha256(data).hexdigest()!=piece['sha256']: raise AssertionError('Changed byte pin '+piece['file'])
    length=struct.unpack_from('<I',data,12)[0];doc=json.loads(data[20:20+length]);binary=data[28+length:]
    def values(index):
        a=doc['accessors'][index];v=doc['bufferViews'][a['bufferView']];width={'SCALAR':1,'VEC3':3}[a['type']]
        form={5123:'H',5125:'I',5126:'f'}[a['componentType']];fmt='<'+form*width;size=struct.calcsize(fmt);offset=v.get('byteOffset',0)+a.get('byteOffset',0)
        return [struct.unpack_from(fmt,binary,offset+i*v.get('byteStride',size)) for i in range(a['count'])]
    result=[]
    def visit(index,parent):
        node=doc['nodes'][index];m=multiply(parent,matrix(node))
        if 'mesh' in node:
            for primitive in doc['meshes'][node['mesh']]['primitives']:
                vertices=[]
                for p in values(primitive['attributes']['POSITION']):
                    v=[sum(m[r][c]*p[c] for c in range(3))+m[r][3] for r in range(3)]
                    vertices.append([v[0],-v[2],v[1]])
                indices=[v[0] for v in values(primitive['indices'])]
                material=doc['materials'][primitive['material']]['name']
                for i in range(0,len(indices),3): result.append((material,[vertices[j] for j in indices[i:i+3]]))
        for child in node.get('children',[]):visit(child,m)
    for node in doc['scenes'][doc.get('scene',0)]['nodes']:visit(node,IDENTITY)
    return result


def dot(a,b):return sum(x*y for x,y in zip(a,b))
def sub(a,b):return [x-y for x,y in zip(a,b)]
def cross(a,b):return [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]]


def triangle_box(triangle,lo,hi):
    """Separating-axis test: strict interior overlap; touching floor/roof is allowed."""
    center=[(a+b)/2 for a,b in zip(lo,hi)];half=[(b-a)/2 for a,b in zip(lo,hi)];v=[sub(p,center) for p in triangle]
    edges=[sub(v[(i+1)%3],v[i]) for i in range(3)]
    axes=[[1,0,0],[0,1,0],[0,0,1],cross(edges[0],edges[1])]+[cross(e,a) for e in edges for a in [[1,0,0],[0,1,0],[0,0,1]]]
    for axis in axes:
        norm=math.sqrt(dot(axis,axis))
        if norm<1e-12:continue
        axis=[x/norm for x in axis];radius=sum(abs(x)*h for x,h in zip(axis,half));projections=[dot(p,axis) for p in v]
        if min(projections)>=radius-1e-6 or max(projections)<=-radius+1e-6:return False
    return True


def bounds(triangles):
    p=[v for _,t in triangles for v in t]
    return [[min(v[i] for v in p) for i in range(3)],[max(v[i] for v in p) for i in range(3)]]
def point_triangle(p,t):
    def side(a,b,c):return (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])
    if abs(side(t[0],t[1],t[2]))<1e-12:return False
    values=[side(t[i],t[(i+1)%3],p) for i in range(3)]
    return min(values)>=-1e-8 or max(values)<=1e-8


class WayfarerAccessProfileGeometry(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.descriptor=json.loads((ASSETS/'descriptor.json').read_text());cls.pack=json.loads((ASSETS/'doors.json').read_text())
        cls.pieces={p['id']:p for p in cls.descriptor['pieces']};cls.triangles={p['id']:glb(p) for p in cls.descriptor['pieces']}

    def test_exported_pins_bounds_and_triangle_census(self):
        for id,piece in self.pieces.items():
            with self.subTest(piece=id):
                self.assertEqual(len(self.triangles[id]),piece['triangles'])
                for actual,expected in zip(bounds(self.triangles[id]),[piece['boundsMin'],piece['boundsMax']]):
                    for a,b in zip(actual,expected):self.assertAlmostEqual(a,b,places=5)
        for path,pin in self.descriptor['sourcePins'].items():self.assertEqual(hashlib.sha256((ROOT/path).read_bytes()).hexdigest(),pin)

    def test_baked_livery_uses_original_ship_frame_and_retains_uncut_anchors(self):
        global ASSETS
        original_assets=ASSETS
        native=ROOT/'assets/runtime/ship-study/wayfarer-authored-r001'
        manifest=json.loads((native/'manifest.json').read_text())
        try:
            flight=ROOT/'assets/runtime/ship-study/wayfarer-dorsal-r001'
            flight_descriptor=json.loads((flight/'descriptor.json').read_text())
            for cohort,source,pieces,frame in [('deck',native,manifest['unique'],'ship (object transform kept in the GLB node)'),('flight',flight,flight_descriptor['pieces'],'ship-node-baked')]:
                ASSETS=source
                vertices={tuple(round(c,5) for c in p) for _,t in self.triangles['native.'+cohort] for p in t}
                for id in ['unique.LIVERY_wf011','unique.LIVERY_explore']:
                    piece=next(p for p in pieces if p['id']==id)
                    self.assertEqual(piece['frame'],frame)
                    # Below the -1/64m cutter base the original actual GLB node
                    # vertices remain in ship coordinates in BOTH presentations.
                    anchors={tuple(round(c,5) for c in p) for _,t in glb(piece) for p in t if p[2]<-.02}
                    self.assertTrue(anchors)
                    self.assertTrue(anchors<=vertices,(cohort,id,sorted(anchors-vertices)[:3]))
        finally:ASSETS=original_assets
        lo,hi=bounds(self.triangles['native.deck'])
        self.assertGreaterEqual(lo[0],-11.56)
        self.assertGreaterEqual(lo[1],-6.51)
        self.assertLessEqual(hi[0],4.51)
        self.assertLessEqual(hi[1],7.375001)

    def test_frame_has_real_clear_slots_for_full_exported_sweep(self):
        for variant in self.pack['variants']:
            frame=self.triangles[variant['parts']['frame']]
            moving=[self.triangles[variant['parts'][k]] for k in (['leaf'] if variant['motion']=='single-sliding' else ['left','right'])]
            for i,triangles in enumerate(moving):
                lo,hi=bounds(triangles);direction=variant.get('leafDirection',-1) if variant['motion']=='single-sliding' else (-1 if i==0 else 1)
                if direction<0:lo[0]-=variant['strokeM']
                else:hi[0]+=variant['strokeM']
                hits=[(m,t) for m,t in frame if triangle_box(t,lo,hi)]
                self.assertEqual(len(hits),0,(variant['id'],i,hits[:1]))
                self.assertGreaterEqual(variant['strokeM'],variant['clearWidthM'] if len(moving)==1 else variant['clearWidthM']/2)

    def test_native_floor_roof_and_hull_clear_every_transformed_leaf_sweep(self):
        fixed=self.triangles['native.deck']+self.triangles['native.flight']
        for id,center,y,sign in [('personnel',3,7,1),('personnel.reverse',3,3,-1),('cargo.4m',-7,7,1),('cargo.4m',-7,3,-1)]:
            variant=next(v for v in self.pack['variants'] if v['id']==id)
            for i,key in enumerate(['leaf'] if variant['motion']=='single-sliding' else ['left','right']):
                lo,hi=bounds(self.triangles[variant['parts'][key]]);direction=variant.get('leafDirection',-1) if key=='leaf' else (-1 if i==0 else 1)
                if direction<0:lo[0]-=variant['strokeM']
                else:hi[0]+=variant['strokeM']
                corners=[[center+sign*x,y+sign*dy,z] for x,dy,z in itertools.product(*zip(lo,hi))]
                low=[min(p[a] for p in corners) for a in range(3)];high=[max(p[a] for p in corners) for a in range(3)]
                hits=[(m,t) for m,t in fixed if triangle_box(t,low,high)]
                self.assertEqual(len(hits),0,(id,y,key,hits[:1]))
                self.assertGreaterEqual(low[0],-11)
                self.assertLessEqual(high[0],8)

    def test_fixed_installation_clears_crossing_collars_above_threshold_dressing(self):
        # This native red livery stood inward of the leaf sweep yet obstructed
        # the outer cargo crossing. It must be replaced by genuinely cut source,
        # rather than simply disappearing from a limited moving-envelope test.
        self.assertIn('LIVERY_wf011',self.descriptor['omitted']['deck'])
        self.assertIn('LIVERY_wf011',self.descriptor['omitted']['flight'])
        fixed=self.triangles['native.deck']+self.triangles['native.flight']
        for id,center,y,sign,width in [('personnel',3,7,1,1.2),('personnel.reverse',3,3,-1,1.2),('cargo.4m',-7,7,1,3.75),('cargo.4m',-7,3,-1,3.75)]:
            variant=next(v for v in self.pack['variants'] if v['id']==id)
            frame=[(m,[[center+sign*p[0],y+sign*p[1],p[2]] for p in t]) for m,t in self.triangles[variant['parts']['frame']]]
            # Authored threshold tread/detail reaches 3.25cm. Above a 4cm
            # that explicit exception the full nominal aperture must be clear,
            # through the complete immediate half-metre collar on either side.
            low=[center-width/2+1e-5,y-.5,.04]
            high=[center+width/2-1e-5,y+.5,2.1]
            hits=[(m,t) for m,t in fixed+frame if triangle_box(t,low,high)]
            self.assertEqual(len(hits),0,(id,y,hits[:1]))
            tread=[t for _,t in frame if triangle_box(t,[low[0],low[1],1e-5],[high[0],high[1],.04])]
            self.assertTrue(tread)
            self.assertAlmostEqual(max(p[2] for t in tread for p in t),.0325,places=6)

    def test_continuous_real_surface_covers_admitted_integer_support_cells(self):
        tops=[t for _,t in self.triangles['native.deck'] if all(abs(p[2])<1e-6 for p in t)]
        self.assertGreater(len(tops),0)
        # These un-bevelled authored support solids have exactly two triangles per
        # rectangular top. Equality of the vertices and area proves the entire
        # continuous rectangle, not only a sampling lattice or a room label.
        support=[t for material,t in self.triangles['native.deck'] if material=='access.grey' and all(abs(p[2])<1e-6 for p in t)]
        for x0,x1 in [(-9,-5),(2,4)]:
            faces=[t for t in support if all(x0-1e-6<=p[0]<=x1+1e-6 for p in t)]
            self.assertEqual(len(faces),2)
            vertices={(round(p[0],6),round(p[1],6)) for t in faces for p in t}
            self.assertEqual(vertices,{(x0,-5),(x1,-5),(x0,7),(x1,7)})
            self.assertAlmostEqual(sum(abs(cross(sub(t[1],t[0]),sub(t[2],t[0]))[2])/2 for t in faces),(x1-x0)*12)
            self.assertEqual(len(set(tuple(sorted((round(p[0],6),round(p[1],6)) for p in t)) for t in faces)),2)
        for x in [-9,-8,-7,-6,2,3]:
            for y in range(-5,7):
                for dx,dy in itertools.product([0,.125,.5,.875,1],repeat=2):
                    point=[x+dx,y+dy]
                    self.assertTrue(any(point_triangle(point,t) for t in tops),point)
        # Both 1.2/3.75m lanes have true support through the handoff at exterior Y7.
        for center,width in [(3,1.2),(-7,3.75)]:
            for along in [-width/2+.3,0,width/2-.3]:
                for y in [3,3.5,5.5,6.5,6.7,7]:
                    self.assertTrue(any(point_triangle([center+along,y],t) for t in tops))

    def test_local_roof_thickness_clears_actual_hardware(self):
        roof=self.triangles['native.flight'];bottom=2.4375;top=2.625
        for center in [3,-7]:
            for y in [3,4,5,6,7]:
                self.assertTrue(any(all(abs(p[2]-top)<1e-6 for p in t) and point_triangle([center,y],t) for _,t in roof))
        self.assertAlmostEqual(top-bottom,.1875)
        for v in self.pack['variants']:
            actual_top=max(bounds(self.triangles[id])[1][2] for id in v['parts'].values())
            self.assertLessEqual(actual_top,bottom+1e-6)
        self.assertAlmostEqual(top+.1875,2.8125)

    def test_macro_chamber_walls_join_support_and_complete_raised_roof(self):
        def rectangle(triangles,axis,plane,uv,expected):
            target={(round(a,5),round(b,5)) for a,b in expected}
            faces=[t for _,t in triangles if all(abs(p[axis]-plane)<1e-6 and (round(p[uv[0]],5),round(p[uv[1]],5)) in target for p in t)]
            self.assertEqual(len(faces),2,(axis,plane,expected))
            self.assertEqual({(round(p[uv[0]],5),round(p[uv[1]],5)) for t in faces for p in t},target)
            area=sum(math.sqrt(dot(cross(sub(t[1],t[0]),sub(t[2],t[0])),cross(sub(t[1],t[0]),sub(t[2],t[0]))))/2 for t in faces)
            self.assertAlmostEqual(area,(max(a for a,b in expected)-min(a for a,b in expected))*(max(b for a,b in expected)-min(b for a,b in expected)),places=5)
        for name,x0,x1,center,clear,pocket,wall_start,wall_end in [('personnel',2,4,3,1.2,1.225,3.4,6.6),('cargo',-9,-5,-7,3.75,1.9,3.3125,6.6875)]:
            # Actual un-bevelled full-height side faces reach the support top Z0
            # and roof underside Z2.4375, not merely room-label extents.
            for x in [x0,x1]:
                for face_x in [x-.0625,x+.0625]:
                    rectangle(self.triangles['native.deck'],0,face_x,[1,2],list(itertools.product([wall_start,wall_end],[0,2.4375])))
            roofs=[(x0-.0625,3.6,x1+.0625,6.4)]
            a=min(center-clear/2-pocket-.125,x0-.0625)
            b=max(center+clear/2+(0 if name=='personnel' else pocket)+.125,x1+.0625)
            roofs += [(a,2.375,b,3.625),(a,6.375,b,7.375)]
            for a,c,b,d in roofs:
                for z in [2.4375,2.625]:rectangle(self.triangles['native.flight'],2,z,[0,1],list(itertools.product([a,b],[c,d])))
            # Exact exported rectangles prove the full chamber ceiling union;
            # headers overlap the central roof by .025m on both ends.
            self.assertLessEqual(roofs[1][0],x0-.0625)
            self.assertGreaterEqual(roofs[1][2],x1+.0625)
            self.assertGreaterEqual(roofs[1][3],roofs[0][1])
            self.assertLessEqual(roofs[2][1],roofs[0][3])


if __name__=='__main__':unittest.main()
