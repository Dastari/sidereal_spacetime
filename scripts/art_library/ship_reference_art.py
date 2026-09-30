"""Rich opt-in reference prop/component family; never replaces r001 objects or r004 components.

Run headlessly with -t 2 and the existing exporter arguments. This installs bounded manufacturer
detail over the existing authored family, retaining ports, envelopes and catalogue definitions.
Each export carries real UVs and editable Blender source. No whole-ship mesh is authored here.
"""
import sys
from pathlib import Path
import bpy

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import ship_component_export as E
import ship_object_art as O


def compact_lenses(piece, screens=False):
    """Reduce fixture lens area while retaining useful screens and their colour/material response."""
    boxes = []
    for x0, y0, z0, x1, y1, z1, slot in piece.boxes:
        if slot in ("emit_a", "emit_b") and not screens:
            dims = [x1-x0, y1-y0, z1-z0]
            axes = sorted(range(3), key=lambda a: dims[a], reverse=True)[:2]
            lo, hi = [x0,y0,z0], [x1,y1,z1]
            for axis in axes:
                centre = (lo[axis]+hi[axis])/2
                half = max(.35, dims[axis]*.19)
                lo[axis],hi[axis] = centre-half,centre+half
            x0,y0,z0,x1,y1,z1 = *lo,*hi
        boxes.append((x0,y0,z0,x1,y1,z1,slot))
    piece.boxes = boxes
    return piece


def fitted_details(p, w, d, h, kind):
    """Purposeful bounded hardware, not random surface cube noise. Coordinates are source texels."""
    b=p.b
    # Protected foot channels and an access-side gasket establish frame/panel/service hierarchy.
    if w>=10 and d>=8 and h>=10:
        for x in (1,w-3):
            b(x,1,0,x+2,d-1,2,"dark")
        b(2,d-1.5,3,w-2,d,5,"trim")
        for x in (2,w-4):
            b(x,d-1,6,x+2,d,h-3,"secondary")
    if any(k in kind for k in ("locker","crate","cargo","tank","magazine")):
        # Recessed central badge, latch spindle and separated hinges.
        b(w*.35,d-1, h*.45,w*.65,d,h*.6,"dark")
        b(w*.46,d-1,h*.47,w*.54,d+.0,h*.56,"metal")
        for z in (h*.18,h*.75):
            b(1,d-1,z,3,d,min(h-1,z+2),"metal")
        b(w-6,d-1,h-7,w-3,d,h-5,"accent")
    if any(k in kind for k in ("console","bridge","computer")):
        # Opaque bezel, inset controls and legible grouped keyboard rather than an emissive desk.
        for x in range(3,max(4,int(w)-3),3):
            b(x,d-2,8,min(w-2,x+1.5),d-1,9,"metal")
        b(w*.33,d-2,4,w*.66,d-1,6,"dark")
        for x in (w*.25,w*.72):
            b(x,1,2,x+1,3,min(h-1,8),"metal")
    if any(k in kind for k in ("bunk","sofa","seat","bed")):
        # Distinct upholstery courses and cloth seams are authored shape/material ownership.
        for x in (w*.25,w*.5,w*.75):
            b(x, d*.25, min(h-2,8),x+.35,d*.85,min(h-1,8.35),"dark")
        b(1,1,2,w-1,2,3,"metal")
        if "bunk" in kind:
            b(w*.62,d*.3,9,w*.92,d*.8,10,"accent")
            b(w*.64,d*.32,10,w*.69,d*.78,10.4,"secondary")
    if any(k in kind for k in ("reactor","pump","life","battery","fuel","drive","thrust","rcs")):
        # Service hatch with recessed surround, protected feed spine and guarded status lens.
        b(2,d-2,5,w-2,d-1,min(h-2,12),"dark")
        b(3,d-1,6,w-3,d,min(h-3,11),"secondary")
        for x in (2,w-4):
            b(x,d-2,3,x+2,d,min(h-1,14),"trim")
        b(w*.4,d-1.4,h*.6,w*.6,d-1,h*.65,"emit_b")
    return p


def bridge_console(K,w,d,h):
    p=K.Piece("reference.bridge", "object", "interior", (w,d,h))
    b=p.b
    b(1,0,0,w-1,d-1,2,"dark").b(2,0,2,w-2,d-2,8,"primary")
    b(0,0,8,w,d,9,"trim").b(1,1,9,w-1,d-1,9.7,"secondary")
    # Opaque raised housings, recessed optical displays and asymmetric controls.
    for x in (6,15,24):
        b(x,0,10,min(w-1,x+7),3,h-1,"trim")
        b(x+.7,2.8,11,min(w-1,x+6.3),3.1,h-2,"dark")
        b(x+1.2,3.1,11.5,min(w-1,x+5.8),3.2,h-3,"emit_a")
        b(x+1.3,3.2,12,min(w-1,x+2.5),3.3,13,"secondary")
        b(x+3.4,3.2,12.5,min(w-1,x+5.3),3.3,13.2,"secondary")
        for key in range(4):
            b(x+key*1.4,5,9.7,x+key*1.4+1,6,10.1,"metal")
        b(x+2,6.5,9.7,x+4,7.5,10.1,"dark")
    # Built-in planter: a personal accent owned by this console, inside its existing envelope.
    b(1,3,9.7,5,7,11.5,"primary").b(1.5,3.5,11.5,4.5,6.5,12,"dark")
    b(2.7,4.7,12,3.3,5.3,16,"accent")
    for x,y,z,X,Y,Z in ((1,4,12.5,3,5,13.3),(3,5,13.5,5,6,14.4),(1.4,4.4,14.4,3.4,5.4,15.2),(3,4,15.3,4,5,16.5)):
        b(x,y,z,X,Y,Z,"accent")
    b(w-2,1,9.7,w-1,4,13,"metal").b(w-4,2,12,w-1,3,13,"trim")
    b(w-3.7,2.7,12.2,w-1.4,3,12.7,"emit_b")
    return p


def pilot_seat(K,w,d,h):
    p=K.Piece("reference.seat", "object", "interior", (w,d,h));b=p.b
    b(2,2,0,w-2,d-2,2,"trim").b(4,4,2,6,6,7,"metal")
    b(1,1,7,w-1,d-1,9,"primary").b(2,3,9,w-2,d-1,10.5,"secondary")
    b(1,0,9,w-1,3,h-3,"trim").b(2,2.4,10,w-2,3.4,h-4,"secondary")
    b(2,1,h-3,w-2,4,h-1,"primary")
    for x in (1,w-2):b(x,4,10,x+1,d-1,12,"trim")
    for x in (3,5,7):b(x,3.4,11,x+.35,3.6,h-5,"dark")
    b(4,0,5,6,1,13,"dark").b(4,0,13,6,1,15,"metal")
    return p

def navigation_station(K,w,d,h):
    """Open knee bay, molded monitor shell and a separately layered seat within the original fitting."""
    p=K.Piece("reference.navigation", "equipment", "interior", (w,d,h));b=p.b
    dd=d//2+2
    b(1,1,0,w-1,dd,2,"dark")
    for x in (1,w-4):b(x,1,2,x+3,dd-1,12,"primary")
    b(4,1,4,w-4,2,10,"secondary")
    b(1,dd-3,12,w-1,dd+1,14,"trim").b(2,3,13,w-2,dd,14,"secondary")
    b(2,1,12,w-2,3,h,"primary").b(2,3,14,w-2,4,h,"trim")
    b(3,4,15,w-3,4.4,h-1,"dark").b(4,4.4,16,w-4,4.6,h-2,"emit_a")
    for x in range(3,int(w)-3,3):b(x,dd-3,14,x+1.5,dd-1.5,14.5,"metal")
    for x in (2,w-4):
        for z in (5,8):b(x,dd-1.5,z,x+2,dd-1,z+1,"dark")
    sx0,sx1=w//2-4,w//2+4
    b(sx0+2,d-5,0,sx1-2,d-3,6,"metal")
    b(sx0,d-8,6,sx1,d-1,8,"primary")
    b(sx0+1,d-7,8,sx1-1,d-2,9,"secondary")
    b(sx0,d-2,8,sx1,d,18,"primary")
    b(sx0+1,d-2.4,10,sx1-1,d-1.8,16,"secondary")
    b(sx0+2,d-2.5,11,sx1-2,d-2.4,14,"accent")
    b(sx0+1,d-.3,10,sx1-1,d,15,"trim")
    b(sx0+2,d-.1,11,sx1-2,d,14,"secondary")
    for x in (sx0,sx1-1):b(x,d-6,9,x+1,d-2,10,"trim")
    return p


def layered_bunk(K,w,d,h):
    p=K.Piece("reference.bunk", "equipment", "interior", (w,d,h));b=p.b
    for x in (0,w-2):
        for y in (0,d-2):b(x,y,0,x+2,y+2,h,"primary")
    for z0 in (2,h//2+1):
        b(0,0,z0,w,d,z0+2,"trim")
        b(1,1,z0+2,w-1,d-1,z0+4,"secondary")
        b(1,2,z0+4,6,d-2,z0+6,"primary")
        b(w*.58,1.5,z0+4,w-2,d-1.5,z0+4.8,"accent")
        for x in (w*.65,w*.8):b(x,1.7,z0+4.8,x+.4,d-1.7,z0+5,"secondary")
        b(2,d-1,z0+.5,w-2,d,z0+1.2,"metal")
        b(2,1,z0+6,3,3,z0+6.8,"emit_b")
    b(w-2,2,h-6,w-1,d-2,h-2,"trim")
    return p


original_builders=O.builders
def object_builders(K, exporter):
    originals=original_builders(K,exporter)
    originals["shipyard.equipment.bridge-bank"]=lambda w,d,h:bridge_console(K,w,d,h)
    originals["shipyard.equipment.pilot-seat"]=lambda w,d,h:pilot_seat(K,w,d,h)
    originals["shipyard.equipment.crew-bunk"]=lambda w,d,h:layered_bunk(K,w,d,h)
    def wrapped(did,fn):
        def build(w,d,h):
            p=compact_lenses(fn(w,d,h),screens="console" in did or "bridge" in did)
            return fitted_details(p,w,d,h,did)
        return build
    return {did:wrapped(did,fn) for did,fn in originals.items()}
O.builders=object_builders

original_piece=E.build_piece
def component_piece(c):
    p,conv,zc=original_piece(c)
    p=E.copy_piece(p)
    if conv=="interior" and c["id"].startswith("console.navigation"):
        p=navigation_station(E.K,*p.size)
    if conv=="interior" and "bunk" in c["id"]:
        p=layered_bunk(E.K,*p.size)
    compact_lenses(p,screens=c["id"].startswith("console."))
    # Source interiors occupy positive local bounds; face/top geometry uses its own authored frame.
    if conv=="interior":
        fitted_details(p,*p.size,c["id"])
    else:
        # Rear/side manufacturer joints follow existing housing bounds; no nozzle direction changes.
        xs=[q[i] for q in p.boxes for i in (0,3)];ys=[q[i] for q in p.boxes for i in (1,4)];zs=[q[i] for q in p.boxes for i in (2,5)]
        x0,x1,y0,y1,z0,z1=min(xs),max(xs),min(ys),max(ys),min(zs),max(zs)
        if c["kind"] in ("propulsion","rcs") or any(s in c["id"] for s in ("drive","thrust","rcs")):
            # Support cheeks, stepped pressure-band protective plates and a buried feed spine.
            for x in (x0+1,x1-3):
                p.b(x,y0+2,z0+2,x+2,y1-2,z0+4,"trim")
                p.b(x,y0+2,z1-4,x+2,y1-2,z1-2,"secondary")
            p.b(x0+2,y0+2,z0+4,x0+4,y1-2,z1-4,"accent")
    return p,conv,zc
E.build_piece=component_piece

original_mesh=E.boxes_mesh
def uv_mesh(name,boxes,hidden=None):
    me=original_mesh(name,boxes,hidden)
    uv=me.uv_layers.new(name="global-trim")
    for face in me.polygons:
        axis=max(range(3),key=lambda a:abs(face.normal[a]))
        u,v=(axis+1)%3,(axis+2)%3
        sign=1 if face.normal[axis]>=0 else -1
        for li in face.loop_indices:
            p=me.vertices[me.loops[li].vertex_index].co
            uv.data[li].uv=(p[u],sign*p[v])
    return me
E.boxes_mesh=uv_mesh
E.EXPORT_REVISION="r005"
E.OBJECTS_REVISION="r002"

if __name__=="__main__":
    E.main()
