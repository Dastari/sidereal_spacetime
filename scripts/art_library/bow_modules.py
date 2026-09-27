"""Grid-true bow kit. Authored closed Blender surfaces; JSON datums shared with authority.
Socket faces are exact and unbevelled. Large panel chamfers are modelled inward of them.
No voxel courses, projecting skirts or generated runtime geometry.
"""
from ship_kit_modules import MeshPiece, Chain, G, tile_polygon, class_z, area

def heights(shape,hc,step,axis,x,y):
    w,h=G['shapeTiles'][shape]['size']; x/=16; y/=16
    u=[x/w,y/h,1-x/w,1-y/h][axis]
    _,top,base=class_z(hc)
    spec=G['bowProfiles']
    def at(key):
        a,b=spec[key][step];return base+(top-base)*(a+(b-a)*u)
    return at('keelFractions'),at('roofFractions')

def polygon(shape):
    # The NEW family uses identical rational/floating arc points to TypeScript.
    # Legacy modules intentionally retain their historical 1/32 snapping.
    import math
    spec=G['shapeTiles'][shape]
    if spec['kind']=='polygon':return [(x*16,y*16) for x,y in spec['points']]
    r=spec['radius'];n=G['arcSegmentsPerRadius']*r
    def pt(i):return (round(r*math.cos(i*math.pi/2/n),9)*16,round(r*math.sin(i*math.pi/2/n),9)*16)
    if not spec['concave']:return [(0,0)]+[pt(i) for i in range(n+1)]
    return [(r*16,0),(r*16,r*16),(0,r*16)]+[pt(i) for i in range(n-1,0,-1)]

def bow_module(shape,hc,step,axis,part):
    p=MeshPiece(f'bow.{shape}.{hc}.s{step}.a{axis}.{part}')
    p.exact_sockets=True
    poly=polygon(shape)
    def h(v):return heights(shape,hc,step,axis,*v)
    def solid(points,lower,upper,slot):
        if abs(area(points))<1e-7:return
        p.loft([[(*v,lower(v)) for v in points],[(*v,upper(v)) for v in points]],slot)
    floor,roof=G['bowProfiles']['shellThicknessTexels'][hc]
    if part=='base':
        solid(poly,lambda v:h(v)[0],lambda v:h(v)[0]+floor,'secondary')
    elif part=='roof':
        if shape=='square' and step==2:
            # One broad inset pane with heavy opaque frame, inside its metre cell.
            inset=1.35
            inner=[(inset,inset),(16-inset,inset),(16-inset,16-inset),(inset,16-inset)]
            for i,a in enumerate(poly):
                j=(i+1)%4
                solid([a,poly[j],inner[j],inner[i]],lambda v:h(v)[1]-roof,lambda v:h(v)[1],'trim')
            solid(inner,lambda v:h(v)[1]-0.8,lambda v:h(v)[1]-0.45,'glass')
        else:
            # Continuous armour courses follow the nose; metre construction sockets
            # are not engraved panel boundaries. Profile changes supply the seams.
            solid(poly,lambda v:h(v)[1]-roof,lambda v:h(v)[1],'primary')
    elif part.startswith('edge'):
        i=int(part[4:]);a,b=poly[i],poly[(i+1)%len(poly)]
        # Standard wall endpoint sockets occupy two texels along the neighbouring
        # tile edge, rather than tapering to zero thickness at cell seams. Within
        # an arc chain, ordinary inward miters join facets in this same module.
        import math
        def unit(v):
            l=math.hypot(*v);return (v[0]/l,v[1]/l)
        def angled(a,b):return abs(a[0]-b[0])>1e-8 and abs(a[1]-b[1])>1e-8
        prev=poly[(i-1)%len(poly)];nxt=poly[(i+2)%len(poly)]
        chain=Chain(poly,side=-1,closed=True)
        d0=unit((prev[0]-a[0],prev[1]-a[1]));d1=unit((nxt[0]-b[0],nxt[1]-b[1]))
        width=G['bowProfiles']['wallThicknessTexels']
        ia=chain.at(chain.acc[i],width) if angled(a,b) and angled(prev,a) else (a[0]+d0[0]*width,a[1]+d0[1]*width)
        ib=chain.at(chain.acc[i+1],width) if angled(a,b) and angled(b,nxt) else (b[0]+d1[0]*width,b[1]+d1[1]*width)
        w,d=G["shapeTiles"][shape]["size"]
        clamp=lambda v:(min(w*16,max(0,v[0])),min(d*16,max(0,v[1])))
        pts=[a,b,clamp(ib),clamp(ia)]
        # Closed shoulder glazing wraps the same profile without leaving the tile.
        # A pale crash rail and crimson waist run continuously beneath the glass.
        z=lambda v,f:h(v)[0]+floor+(h(v)[1]-roof-h(v)[0]-floor)*f
        solid(pts,lambda v:z(v,0),lambda v:z(v,.24),'primary')
        if step==3 and hc in ['deck','pod','cabin']:
            mix=lambda a,b,t:(a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t)
            solid(pts,lambda v:z(v,.24),lambda v:z(v,.28),'accent')
            for u0,u1,slot in [(0,.3,'accent'),(.3,.7,'emit_b'),(.7,1,'accent')]:
                lens=[mix(a,b,u0),mix(a,b,u1),mix(clamp(ia),clamp(ib),u1),mix(clamp(ia),clamp(ib),u0)]
                solid(lens,lambda v:z(v,.28),lambda v:z(v,.32),slot)
            solid(pts,lambda v:z(v,.32),lambda v:z(v,.36),'accent')
        else:solid(pts,lambda v:z(v,.24),lambda v:z(v,.36),'accent')
        solid(pts,lambda v:z(v,.36),lambda v:z(v,.43),'trim')
        solid(pts,lambda v:z(v,.43),lambda v:z(v,.50),'primary')
        glazed=step in [1,2] and hc in ['deck','pod','cabin']
        if glazed:
            solid(pts,lambda v:z(v,.50),lambda v:z(v,.55),'trim')
            solid(pts,lambda v:z(v,.94),lambda v:z(v,1),'trim')
            # Spars only at true corners / ends of an arc chain, never every facet.
            def lerp(a,b,t):return (a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t)
            length=math.dist(a,b); f=min(.22,.85/length)
            ends=[not (angled(a,b) and angled(prev,a)),not (angled(a,b) and angled(b,nxt))]
            u0=f if ends[0] else 0;u1=1-f if ends[1] else 1
            pane=[lerp(a,b,u0),lerp(a,b,u1),lerp(clamp(ia),clamp(ib),u1),lerp(clamp(ia),clamp(ib),u0)]
            solid(pane,lambda v:z(v,.55),lambda v:z(v,.94),'glass')
            for end,corner in enumerate(ends):
                if not corner:continue
                q=[lerp(a,b,1-f),b,clamp(ib),lerp(clamp(ia),clamp(ib),1-f)] if end else [a,lerp(a,b,f),lerp(clamp(ia),clamp(ib),f),clamp(ia)]
                # Replace rather than overlay coplanar faces: inset the glazing at
                # its ends by splitting the strip in the builder below.
                solid(q,lambda v:z(v,.55),lambda v:z(v,.94),'trim')
        else:solid(pts,lambda v:z(v,.50),lambda v:z(v,1),'primary')
    else:raise ValueError(part)
    return p
