"""r002 reference hardware: selective molded housings, furnished stations and open engine bells.

Build on the delivered primitive family without changing any previous export or fitting envelope.
Runtime chamfers apply only to broad exposed housings/cushions, never each voxel terrace.
"""
import json
import math
import sys
from pathlib import Path
import bpy
import bmesh

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import ship_reference_art as R

E, K = R.E, R.E.K
# These are material aliases of existing semantic slots, not new equipment or slot roles.
for base in ("primary", "secondary", "accent"):
    alias=base+".fabric"
    E.SI[alias]=len(E.SLOTS)
    E.SLOTS.append(alias)
    K.SLOT_PBR[alias]=K.SLOT_PBR[base]
    for theme in K.THEMES.values():theme[alias]=theme[base]
E.SI["accent.flora"]=len(E.SLOTS)
E.SLOTS.append("accent.flora")
K.SLOT_PBR["accent.flora"]=K.SLOT_PBR["accent"]
for theme in K.THEMES.values():theme["accent.flora"]=theme["accent"]


def bridge_console(K, w, d, h):
    p=K.Piece("reference.r002.bridge", "object", "interior", (w,d,h)); b=p.b
    b(1,1,0,w-1,d-1,2,"trim")
    # Open under-desk knee spaces, framed plinth and stout end housings.
    for x in (1,w-5): b(x,1,2,x+4,d-2,8,"primary")
    b(5,1,2,w-5,2,7,"secondary")
    b(0,1,8,w,d-1,10,"trim").b(1,2,10,w-1,d-2,10.7,"primary")
    for x in (6,15,24):
        X=min(w-1,x+7)
        b(x,0,9,X,4,h-1,"primary")
        # Four rails leave the centre open; a solid bezel box would occlude the display.
        b(x+.5,3,11,x+1,4.5,h-2,"trim")
        b(X-1,3,11,X-.5,4.5,h-2,"trim")
        b(x+1,3,11,X-1,4.5,11.7,"trim")
        b(x+1,3,h-2.7,X-1,4.5,h-2,"trim")
        b(x+1,4,11.7,X-1,4.25,h-2.7,"dark")
        # A UV-qualified display owns the finite dark instrument atlas; lamps remain emit_b.
        b(x+1,4.25,11.7,X-1,4.35,h-2.7,"emit_a")
        b(x+.6,5,10.7,X-.6,d-2,11.2,"secondary")
        for row in range(2):
            for key in range(4):
                b(x+1+key*1.25,5+row*1.3,11.2,x+1.9+key*1.25,5.9+row*1.3,11.55,"metal")
        b(x+4,7.8,11.2,x+5.8,8.6,11.8,"trim")
    # Built-in bounded personal insert retained as console-owned geometry.
    b(1.2,3,10.7,4.8,7,12.3,"primary").b(1.7,3.5,12.3,4.3,6.5,12.6,"dark")
    b(2.7,4.7,12.6,3.3,5.3,16,"accent")
    for x,y,z,X,Y,Z in ((1.4,4,13,3,5,13.7),(3,5,14,4.8,6,14.9),(1.6,4.4,15,3.3,5.4,15.8)):
        b(x,y,z,X,Y,Z,"accent")
    b(w-2,3,10.7,w-1,4,14,"metal").b(w-4,3,13,w-1,4,14,"trim")
    b(w-3.5,3.8,13.2,w-1.4,4,13.6,"emit_b")
    return p


def pilot_seat(K,w,d,h):
    p=K.Piece("reference.r002.seat","object","interior",(w,d,h)); b=p.b
    b(2,2,0,w-2,d-2,1.5,"trim")
    # An open pedestal and real molded side support, not a solid slab to the floor.
    b(w*.4,d*.38,1.5,w*.6,d*.62,6,"metal")
    b(1,1,6,w-1,d-1,8,"primary")
    b(1.7,2.5,8,w-1.7,d-1.2,10,"secondary.fabric")
    b(1,0,8,w-1,2.5,h-2,"primary")
    b(1.8,2.1,10,w-1.8,3.8,h-3.5,"secondary.fabric")
    b(2,1,h-3.5,w-2,3.5,h-1,"secondary.fabric")
    for x in (1,w-2):
        b(x,2,7,x+1,4,12,"trim")
        b(x,3.5,11,x+1,d-2,12.5,"primary")
    b(w*.42,0,4,w*.58,1,12,"metal")
    return p


def navigation_station(K,w,d,h):
    p=K.Piece("reference.r002.navigation","equipment","interior",(w,d,h)); b=p.b
    dd=d//2+2
    for x in (1,w-4):b(x,1,0,x+3,dd-1,12,"primary")
    b(4,1,2,w-4,2,9,"secondary")
    b(1,dd-3,12,w-1,dd+1,14,"trim").b(2,3,13,w-2,dd,14,"primary")
    b(2,1,12,w-2,4,h,"primary").b(2.7,3,14,w-2.7,4.7,h-1,"trim")
    b(3.5,4.4,15,w-3.5,4.65,h-2,"dark")
    b(3.5,4.65,15,w-3.5,4.75,h-2,"emit_a")
    for row in range(2):
        for x in range(3,int(w)-3,3):b(x,dd-4+row*1.3,14,x+1.5,dd-3+row*1.3,14.5,"metal")
    sx0,sx1=w//2-4,w//2+4
    b(sx0+2,d-5,0,sx1-2,d-3,5.5,"metal")
    b(sx0,d-8,5.5,sx1,d-1,7.5,"primary")
    b(sx0+.8,d-7,7.5,sx1-.8,d-2,9.5,"secondary.fabric")
    b(sx0,d-2,7.5,sx1,d,15.5,"primary")
    b(sx0+.8,d-3,9.5,sx1-.8,d-1.4,14,"secondary.fabric")
    b(sx0+1.2,d-2.5,14,sx1-1.2,d-.5,15.5,"secondary.fabric")
    for x in (sx0,sx1-1):b(x,d-6,9,x+1,d-2,10.5,"trim")
    return p


def layered_bunk(K,w,d,h):
    p=K.Piece("reference.r002.bunk","equipment","interior",(w,d,h)); b=p.b
    for x in (0,w-2):
        for y in (0,d-2):b(x,y,0,x+2,y+2,h,"trim")
    for z0 in (2,h//2+1):
        b(0,0,z0,w,d,z0+2,"primary")
        b(1,1,z0+2,w-1,d-1,z0+4,"primary.fabric")
        b(1.5,2,z0+4,6,d-2,z0+6,"primary.fabric")
        b(w*.48,1.5,z0+4,w-2,d-1.5,z0+5.1,"accent.fabric")
        b(w*.46,1.7,z0+5.1,w*.52,d-1.7,z0+5.5,"primary.fabric")
        for y in (1.8,d-2.3):b(w*.53,y,z0+5.1,w-2.2,y+.4,z0+5.4,"primary.fabric")
        b(1,d-1.5,z0,w-1,d,z0+1.4,"metal")
        b(2,1,z0+6,4,3,z0+7,"trim").b(2.3,2.6,z0+6.2,3.7,3,z0+6.7,"emit_b")
    return p


R.bridge_console=bridge_console
R.pilot_seat=pilot_seat
R.navigation_station=navigation_station
R.layered_bunk=layered_bunk


def lounge_sofa(K,w,d,h):
    p=K.Piece("reference.r002.sofa","object","interior",(w,d,h));b=p.b
    for x in (2,w-4):
        for y in (2,d-3):b(x,y,0,x+2,y+1,3,"metal")
    b(1,1,3,w-1,d-1,5,"primary")
    b(1,0,5,w-1,2,h-1,"primary")
    cw=(w-5)/3
    for i in range(3):
        x=2+i*cw
        b(x,3,5,x+cw-.6,d-1,8,"accent.fabric")
        b(x,1.7,8,x+cw-.6,4,h-1,"accent.fabric")
        b(x+.4,d-2,7.5,x+cw-1, d-1.4,8.1,"primary.fabric")
    for x in (0,w-2):
        b(x,1,4,x+2,d-1,10,"primary")
        b(x+.25,2,10,x+1.75,d-1.5,11,"secondary.fabric")
    # One pale loose cushion, rather than uniform repeated plastic seats.
    b(w-9,3,8,w-4.5,6,11.5,"primary.fabric")
    return p


def medical_bed(K,w,d,h):
    p=K.Piece("reference.r002.medbed","object","interior",(w,d,h));b=p.b
    b(w*.4,d*.32,0,w*.6,d*.68,4,"metal")
    b(2,2,0,w-2,d-2,1,"trim")
    b(0,0,4,w,d,6,"primary")
    b(2,1,6,w-2,d-1,8,"primary.fabric")
    b(3,2,8,8,d-2,10,"primary.fabric")
    b(w*.48,1.2,8,w-2,d-1.2,9.2,"accent.fabric")
    for y in (1.5,d-2):b(w*.5,y,9.2,w-2.5,y+.4,9.5,"primary.fabric")
    b(0,1,6,2,d-1,h,"primary")
    b(1.8,4,9.5,2.4,d-4,h-1,"trim")
    b(2.4,4.5,10,2.6,d-4.5,h-1.5,"dark")
    b(2.6,5,10.4,2.7,d-5,h-2,"emit_a")
    for y in (0,d-1):
        b(5,y,6,w-4,y+1,7,"metal")
        b(6,y,7,7,y+1,9,"metal")
        b(w-6,y,7,w-5,y+1,9,"metal")
    return p


def table(K,w,d,h):
    p=K.Piece("reference.r002.table","object","interior",(w,d,h));b=p.b
    z=h-4
    b(w*.4,d*.38,0,w*.6,d*.62,z-1,"metal")
    b(w*.28,d*.25,0,w*.72,d*.75,1,"trim")
    b(0,0,z-1,w,d,z,"secondary")
    b(.7,.7,z,w-.7,d-.7,z+.7,"primary")
    # Tray, two mugs and one small living accent belong to this table, not new entities.
    b(3,3,z+.7,10,8,z+1,"trim")
    for x,y in ((4,4),(7,5)):
        b(x,y,z+1,x+1.6,y+1.6,z+2.7,"primary")
        b(x+.3,y+.3,z+2.7,x+1.3,y+1.3,z+2.85,"dark")
        b(x+1.5,y+.4,z+1.4,x+2,y+1.2,z+2.3,"metal")
    b(w-6,d-6,z+.7,w-2,d-2,z+1.8,"secondary")
    b(w-5.5,d-5.5,z+1.8,w-2.5,d-2.5,z+2,"dark")
    b(w-4.3,d-4.3,z+2,w-3.7,d-3.7,h,"accent.flora")
    for x,y,Z in ((w-5.6,d-4.8,h-1.1),(w-4.3,d-3.8,h-.6),(w-3.9,d-5.2,h-.3)):
        b(x,y,Z-.5,x+1.6,y+.8,Z,"accent.flora")
    return p


def kitchen(K,w,d,h):
    p=K.Piece("reference.r002.galley","object","interior",(w,d,h));b=p.b
    b(.5,.5,0,w-.5,d-.5,2,"secondary")
    b(1,1,2,w-1,d-1,10,"secondary")
    for y in range(1,int(d)-3,7):
        b(w-1,y,2,w,y+6,9.5,"primary")
        b(w-.2,y+1,8,w,y+5,8.5,"metal")
    # Counter is four solid courses around an actual recessed sink aperture.
    sy0,sy1=d-13,d-5
    b(0,0,10,3,d,11,"trim")
    b(w-2,0,10,w,d,11,"trim")
    b(3,0,10,w-2,sy0,11,"trim")
    b(3,sy1,10,w-2,d,11,"trim")
    b(3,sy0,9,w-2,sy1,9.5,"dark")
    for y in (sy0,sy1-1):b(3,y,9.5,w-2,y+1,11,"metal")
    for x in (3,w-3):b(x,sy0,9.5,x+1,sy1,11,"metal")
    b(1.5,sy0+3,11,2.2,sy0+3.8,14,"metal")
    b(1.5,sy0+3,13.3,5,sy0+3.8,14,"metal")
    b(4.3,sy0+3,12.4,5,sy0+3.8,14,"metal")
    b(1,1,11,2,d-1,h,"primary")
    for y in (5,11):
        p.disc("z",w//2,y,2,11,11.4,"dark")
        p.disc("z",w//2,y,1,11.4,11.6,"metal")
    b(w-1,2,8.8,w,6,9.6,"dark")
    b(w-.2,2.5,9,w,3.2,9.4,"emit_b")
    b(2,2,h-2,4.5,d-3,h-1,"trim")
    for y in (3,6,9):b(2.3,y,h-1,3.5,y+1.5,h,"primary")
    b(3,15,11,7,18,11.5,"accent")
    b(4,15.5,11.5,4.6,17.5,14,"metal")
    b(5.5,15.5,11.5,6.2,17.5,13,"metal")
    return p


R.O.sofa=lounge_sofa
R.O.medical_bed=medical_bed
R.O.table=table
R.O.kitchen=kitchen


def enclosed_reactor(original):
    """Compact pressure vessel and partial service shrouds inside the original fitting envelope."""
    lo=[min(q[i] for q in original.boxes) for i in range(3)]
    hi=[max(q[i+3] for q in original.boxes) for i in range(3)]
    x,y,z=lo;X,Y,Z=hi;w,d,h=X-x,Y-y,Z-z
    p=K.Piece("reference.r002.reactor",original.family,original.mount,original.size);b=p.b
    b(x+1,y+1,z,X-1,Y-1,z+2,"trim")
    # One pressure vessel: soft shoulders, two mechanical collars, no stacked exposed discs.
    b(x+3,y+3,z+2,X-3,Y-3,z+h*.76,"secondary.vessel")
    # Shrouds protect discrete service faces and leave the curved pressure body visible.
    for xx,XX in ((x+1,x+6),(X-6,X-1)):
        b(xx,y+d*.24,z+3,XX,y+d*.76,z+h*.62,"primary")
        b(xx,y+d*.30,z+7,XX,y+d*.70,z+h*.48,"trim")
        b(xx,y+d*.37,z+9,XX,y+d*.62,z+h*.44,"accent")
    for yy,YY in ((y+1,y+5),(Y-5,Y-1)):
        b(x+w*.19,yy,z+3,x+w*.81,YY,z+h*.22,"primary")
        b(x+w*.22,yy,z+h*.48,x+w*.78,YY,z+h*.62,"primary")
        for xx,XX in ((x+w*.20,x+w*.29),(x+w*.71,x+w*.80)):
            b(xx,yy,z+h*.22,XX,YY,z+h*.48,"trim")
        # Service controls are recessed behind their guards, with visible two-level vent fins.
        b(x+w*.29,yy+1,z+h*.25,x+w*.71,YY-1,z+h*.46,"dark")
        for zz in (z+h*.28,z+h*.38):
            b(x+w*.31,yy+.5,zz,x+w*.68,YY-.5,zz+1,"metal")
        b(x+w*.37,yy,z+h*.53,x+w*.63,YY,z+h*.55,"emit_b")
    b(x+w*.30,y+d*.30,z+h*.76,x+w*.70,y+d*.70,z+h*.81,"trim")
    b(x+w*.36,y+d*.36,z+h*.81,x+w*.64,y+d*.64,z+h*.85,"primary")
    b(x+w*.42,y+d*.41,z+h*.85,x+w*.60,y+d*.60,z+h*.87,"accent")
    # Narrow protected coolant feed pylons retain machine height without filling the whole cuboid.
    for xx in (x+3,X-5):
        b(xx,y+3,z+3,xx+2,y+5,Z-1,"metal")
        b(xx-.5,y+2.5,z+h*.69,xx+2.5,y+5.5,z+h*.78,"trim")
    return p


def enclosed_weapon(original,kind):
    """One low pivot inside an armored receiver; payload keeps its original mounting axis."""
    lo=[min(q[i] for q in original.boxes) for i in range(3)]
    hi=[max(q[i+3] for q in original.boxes) for i in range(3)]
    W=original.size[0];c=W/2;H=hi[2];zc=H*.46
    p=K.Piece("reference.r002."+kind,original.family,original.mount,original.size);b=p.b
    b(1,1,0,W-1,W-1,H*.10,"trim")
    p.disc("z",c,c,max(2,round(W*.25)),H*.10,H*.21,"metal")
    # Compact dark breech remains visible between two stepped partial cheek shrouds.
    # The front shoulder lowers toward the payload instead of a tall rectangular tower.
    b(c-W*.28,c-W*.20,H*.21,c+W*.24,c+W*.20,H*.59,"secondary")
    for ya,yb in ((c-W*.30,c-W*.20),(c+W*.20,c+W*.30)):
        b(c-W*.28,ya,H*.23,c-W*.04,yb,H*.63,"primary")
        b(c-W*.04,ya,H*.23,c+W*.24,yb,H*.46,"primary")
        b(c-W*.23,ya,H*.31,c-W*.11,yb,H*.46,"trim")
        b(c-W*.21,ya,H*.34,c-W*.13,yb,H*.43,"accent")
    b(c-W*.23,c-W*.15,H*.59,c-W*.04,c+W*.15,H*.65,"primary")
    # Recessed receiver access, mechanical latch, and a protected exposed top saddle.
    b(c-W*.32,c-W*.15,H*.28,c-W*.29,c+W*.15,H*.53,"trim")
    b(c-W*.33,c-W*.10,H*.32,c-W*.32,c+W*.10,H*.49,"accent")
    b(c-W*.34,c+W*.045,H*.35,c-W*.33,c+W*.075,H*.45,"metal")
    b(c-W*.02,c-W*.13,H*.59,c+W*.17,c+W*.13,H*.61,"metal")
    front=max(c+W*.34,hi[0]-1);start=c+W*.22
    if "missile" in kind:
        b(c-W*.24,c-W*.24,H*.30,c+W*.24,c+W*.24,H*.64,"primary")
        for yy in (c-W*.12,c+W*.12):
            b(c+W*.24,yy-W*.055,H*.38,c+W*.27,yy+W*.055,H*.56,"dark")
            b(c+W*.27,yy-W*.025,H*.42,c+W*.28,yy+W*.025,H*.51,"metal")
    elif "railgun" in kind:
        bw=max(1,W*.095)
        b(start,c-bw,zc-bw,front,c+bw,zc+bw,"trim")
        for yy in (c-bw,c+bw-1):b(start,yy,zc-bw,front,yy+1,zc+bw,"metal")
        b(start+1,c-bw+1,zc-bw+1,front-2,c+bw-1,zc+bw-1,"dark")
        for i in range(3):
            xx=start+(front-start)*(.25+i*.22)
            b(xx,c-bw+1,zc-.5,xx+1,c+bw-1,zc+.5,"emit_a")
    else:
        r=max(.65,W*(.055 if "autocannon" in kind else .036 if "point" in kind or kind.startswith("pd") else .10))
        centres=[(c,zc)]
        if "autocannon" in kind:centres=[(c-W*.10,zc),(c+W*.10,zc)]
        elif "point" in kind or kind.startswith("pd"):centres=[(c+dy*W*.075,zc+dz*H*.08) for dy in (-1,1) for dz in (-1,1)]
        for yy,zz in centres:
            b(start,yy-r*1.35,zz-r*1.35,start+(front-start)*.30,yy+r*1.35,zz+r*1.35,"secondary")
            b(start+(front-start)*.24,yy-r,zz-r,front,yy+r,zz+r,"metal.barrel")
    # Protected optic is attached to the receiver, never a glowing giant cap.
    b(c-W*.10,c-W*.09,H*.65,c+W*.08,c+W*.09,H*.77,"trim")
    b(c+W*.08,c-W*.05,H*.68,c+W*.09,c+W*.05,H*.73,"emit_a")
    return p


def enclosed_thermal(original):
    """Lower protected thermal cassette: two readable fin banks inside molded manifolds."""
    lo=[min(q[i] for q in original.boxes) for i in range(3)]
    hi=[max(q[i+3] for q in original.boxes) for i in range(3)]
    x,y,z=lo;X,Y,Z=hi;w=X-x;d=Y-y;h=Z-z
    p=K.Piece("reference.r002.thermal",original.family,original.mount,original.size);b=p.b
    b(x,y,z,X,Y,z+min(2,h*.18),"trim")
    b(x+w*.10,y+d*.12,z+h*.18,X-w*.10,Y-d*.12,z+h*.27,"secondary")
    # The actual recess floor is visible between six broad fins, never dozens of hot bars.
    for side in (0,1):
        a=x+w*(.13 if side==0 else .57);A=x+w*(.43 if side==0 else .87)
        b(a,y+d*.18,z+h*.27,A,Y-d*.18,z+h*.30,"dark")
        for k in range(3):
            xx=a+(A-a)*k/3
            b(xx,y+d*.20,z+h*.30,xx+(A-a)*.18,Y-d*.20,z+h*.54,"metal")
    # Fused shoulder cheeks and front/rear header housings protect the cooling cores.
    for a,A in ((x,x+w*.12),(X-w*.12,X)):
        b(a,y+d*.08,z+h*.18,A,Y-d*.08,z+h*.63,"primary")
        b(a,y+d*.16,z+h*.63,A,Y-d*.16,z+h*.69,"primary")
    for a,A in ((y,y+d*.17),(Y-d*.17,Y)):
        b(x+w*.10,a,z+h*.18,X-w*.10,A,z+h*.62,"primary")
        b(x+w*.20,a,z+h*.62,X-w*.20,A,z+h*.67,"trim")
    b(x+w*.46,y+d*.10,z+h*.27,x+w*.54,Y-d*.10,z+h*.64,"secondary")
    b(x+w*.47,y+d*.18,z+h*.64,x+w*.53,y+d*.35,z+h*.66,"accent")
    b(x+w*.46,y,z+h*.35,x+w*.54,y+d*.02,z+h*.40,"emit_b")
    return p


previous_r002_piece=E.build_piece
def machinery_piece(component):
    p,conv,zc=previous_r002_piece(component)
    if component["kind"]=="reactor":p=enclosed_reactor(p)
    if component["kind"] in ("radiator","heat-sink"):p=enclosed_thermal(p)
    if component["art"]["kitKey"].startswith("wpn."):p=enclosed_weapon(p,component["kind"])
    return p,conv,zc
E.build_piece=machinery_piece


# Finite authored shape aliases preserve the same semantic slots and surface families.
for alias,base in (("metal.barrel","metal"),("secondary.vessel","secondary")):
    E.SI[alias]=len(E.SLOTS);E.SLOTS.append(alias)
    K.SLOT_PBR[alias]=K.SLOT_PBR[base]
    for theme in K.THEMES.values():theme[alias]=theme[base]


def barrel_mesh(name,box):
    # Exporter has already converted kit-top +X into catalog +Y. Detect the
    # converted long axis rather than assuming the original author's coordinate frame.
    lo=[q*E.T for q in box[:3]];hi=[q*E.T for q in box[3:6]]
    axis=max(range(3),key=lambda a:hi[a]-lo[a]);u,v=(axis+1)%3,(axis+2)%3
    centre=[(a+b)/2 for a,b in zip(lo,hi)]
    radius=min(hi[u]-lo[u],hi[v]-lo[v])/2;n=24
    profiles=[(lo[axis],radius,"metal.barrel"),(hi[axis],radius,"metal.barrel"),
              (hi[axis],radius*.70,"metal.barrel"),(hi[axis]-radius*.7,radius*.70,"dark"),
              (hi[axis]-radius*.8,0,"dark")]
    verts=[];faces=[];slots=[]
    for at,r,slot in profiles:
        for k in range(n):
            a=k*2*math.pi/n;point=centre.copy();point[axis]=at
            point[u]+=math.cos(a)*r;point[v]+=math.sin(a)*r;verts.append(point)
    for j in range(len(profiles)-1):
        for k in range(n):
            f=(j*n+k,j*n+(k+1)%n,(j+1)*n+(k+1)%n,(j+1)*n+k)
            if profiles[j+1][1]==0:f=f[:3]
            faces.append(f);slots.append(E.SI[profiles[j][2]])
    me=bpy.data.meshes.new(name);me.from_pydata(verts,[],faces)
    me.polygons.foreach_set("material_index",slots);me.polygons.foreach_set("use_smooth",[True]*len(faces))
    return me


def pressure_mesh(name,box):
    lo=[q*E.T for q in box[:3]];hi=[q*E.T for q in box[3:6]]
    cx,cy=(lo[0]+hi[0])/2,(lo[1]+hi[1])/2
    rx,ry=(hi[0]-lo[0])/2,(hi[1]-lo[1])/2;L=hi[2]-lo[2];n=32
    profiles=[(lo[2],.82,"trim"),(lo[2]+L*.07,1,"trim"),
              (lo[2]+L*.13,.91,"secondary.vessel"),(lo[2]+L*.79,.91,"secondary.vessel"),
              (lo[2]+L*.84,1,"metal"),(lo[2]+L*.91,1,"metal"),
              (hi[2],.75,"secondary.vessel"),(hi[2],0,"secondary.vessel")]
    verts=[];faces=[];slots=[]
    for zz,r,slot in profiles:
        for k in range(n):
            a=k*2*math.pi/n;verts.append((cx+math.cos(a)*rx*r,cy+math.sin(a)*ry*r,zz))
    for j in range(len(profiles)-1):
        for k in range(n):
            f=(j*n+k,j*n+(k+1)%n,(j+1)*n+(k+1)%n,(j+1)*n+k)
            if profiles[j+1][1]==0:f=f[:3]
            faces.append(f);slots.append(E.SI[profiles[j][2]])
    me=bpy.data.meshes.new(name);me.from_pydata(verts,[],faces)
    me.polygons.foreach_set("material_index",slots);me.polygons.foreach_set("use_smooth",[True]*len(faces))
    return me


def engine_mesh(name,boxes):
    """Pressure housing with service pods; only the aft quarter becomes an open exhaust bell."""
    lo=[min(b[i] for b in boxes)*E.T for i in range(3)]
    hi=[max(b[i+3] for b in boxes)*E.T for i in range(3)]
    r=min(hi[0],-lo[0],hi[2],-lo[2])*.92
    L=hi[1]-lo[1]
    # Y is negative outward, matching the existing published engine/nozzle frame.
    profiles=[(hi[1],r*.74,"trim"),(hi[1]-.07*L,r*.90,"trim"),
              (hi[1]-.11*L,r*.70,"secondary"),(hi[1]-.59*L,r*.70,"secondary"),
              (hi[1]-.63*L,r*.91,"trim"),(hi[1]-.70*L,r*.91,"trim"),
              (hi[1]-.74*L,r*.58,"metal"),(lo[1]+.18*L,r*.56,"metal"),
              (lo[1]+.06*L,r*.78,"metal"),(lo[1],r*.84,"trim"),
              (lo[1],r*.65,"metal"),(lo[1]+.17*L,r*.34,"dark"),
              (lo[1]+.19*L,r*.27,"dark"),(lo[1]+.195*L,0,"dark")]
    verts,faces,slots=[],[],[];n=8
    for y,radius,slot in profiles:
        for k in range(n):
            a=k*2*math.pi/n;verts.append((math.cos(a)*radius,y,math.sin(a)*radius))
    for j in range(len(profiles)-1):
        for k in range(n):
            face=(j*n+k,j*n+(k+1)%n,(j+1)*n+(k+1)%n,(j+1)*n+k)
            if profiles[j+1][1]==0:face=face[:3]
            faces.append(face);slots.append(E.SI[profiles[j][2]])
    # Tiny protected signal lenses on the aft shroud; no glowing circumference.
    me=bpy.data.meshes.new(name);me.from_pydata(verts,[],faces)
    me.polygons.foreach_set("material_index",slots)
    me.polygons.foreach_set("use_smooth",[False]*len(faces))
    bm=bmesh.new();bm.from_mesh(me);bpy.data.meshes.remove(me)
    service=[]
    def pod(side,x0,x1,radial0,radial1,ya,yb,slot):
        z0,z1=radial0*r,radial1*r;x0*=r;x1*=r
        if side==1:x0,x1,z0,z1=z0,z1,x0,x1
        elif side==3:x0,x1,z0,z1=-z1,-z0,x0,x1
        service.append((x0/E.T,(hi[1]-yb*L)/E.T,z0/E.T,x1/E.T,(hi[1]-ya*L)/E.T,z1/E.T,slot))
    for side in (0,1,3):
        # Front/rear armored case ends enclose an eight-sided dark vessel. Four
        # broad rails frame a genuinely backed pocket; no opaque box hides its centre.
        for ya,yb in ((.12,.33),(.47,.67)):
            pod(side,-.46,.46,.70,.75,ya,yb,"secondary")
            pod(side,-.46,-.29,.73,.99,ya,yb,"primary")
            pod(side,.29,.46,.73,.99,ya,yb,"primary")
            pod(side,-.29,.29,.73,.99,ya,ya+.035,"primary")
            pod(side,-.29,.29,.73,.99,yb-.035,yb,"primary")
            pod(side,-.27,.27,.75,.79,ya+.04,yb-.04,"trim")
            for yy in (ya+.075,yb-.075):
                pod(side,-.24,.24,.79,.84,yy,yy+.018,"metal")
            if ya>.4:
                pod(side,-.16,.16,.79,.82,ya+.06,yb-.06,"accent")
        # Exposed central service band carries a protected feed and compact access
        # coupling, retaining the pressure-vessel identity between the case ends.
        pod(side,-.12,.12,.69,.83,.34,.46,"metal")
        pod(side,-.19,.19,.79,.89,.375,.425,"trim")
    pod(0,-.07,.07,.90,.97,.60,.625,"emit_b")
    for box in service:
        part=R.original_mesh(name,[box]);sub=bmesh.new();sub.from_mesh(part);bpy.data.meshes.remove(part)
        edges=[e for e in sub.edges if len(e.link_faces)==2]
        if edges:bmesh.ops.bevel(sub,geom=edges,offset=min(.04,L*.018,r*.065),segments=2,affect="EDGES",clamp_overlap=True)
        for f in sub.faces:f.material_index=E.SI[box[6]]
        temp=bpy.data.meshes.new("GEO-engine-service");sub.to_mesh(temp);sub.free();bm.from_mesh(temp);bpy.data.meshes.remove(temp)
    me=bpy.data.meshes.new(name);bm.to_mesh(me);bm.free()
    return me


def authored_mesh(name,boxes,hidden=None):
    if any(k in name for k in ("ion-drive","resonance-drive","thrust-block")):
        me=engine_mesh(name,boxes)
    else:
        bm=bmesh.new()
        for i,box in enumerate(boxes):
            dims=[box[a+3]-box[a] for a in range(3)]
            smooth_barrel=box[6]=="metal.barrel"
            smooth_vessel=box[6]=="secondary.vessel"
            part=barrel_mesh(name,box) if smooth_barrel else pressure_mesh(name,box) if smooth_vessel else R.original_mesh(name,[box],[hidden[i]] if hidden else None)
            sub=bmesh.new();sub.from_mesh(part);bpy.data.meshes.remove(part)
            # Round only broad exposed pieces. Narrow ribs, voxel rows, keys and lenses stay sharp.
            if not smooth_vessel and box[6].split(".")[0] in ("primary","secondary","trim","accent") and min(dims)>=1.5 and max(dims)>=5:
                edges=[e for e in sub.edges if len(e.link_faces)==2]
                width=min(.025 if any(s in name for s in ("bunk","seat","navigation","sofa","medical-bed")) else .04 if any(s in name for s in ("reactor","cannon","point-defense","railgun","missile-pod","radiator","heat-sink")) else .015,min(dims)*E.T*.22)
                if edges:bmesh.ops.bevel(sub,geom=edges,offset=width,segments=2,affect="EDGES",clamp_overlap=True)
            if not smooth_barrel and not smooth_vessel:
                for f in sub.faces:f.material_index=E.SI[box[6]]
            temp=bpy.data.meshes.new("GEO-reference-part");sub.to_mesh(temp);sub.free();bm.from_mesh(temp);bpy.data.meshes.remove(temp)
        me=bpy.data.meshes.new(name);bm.to_mesh(me);bm.free()
    uv=me.uv_layers.new(name="authored-surface")
    for face in me.polygons:
        axis=max(range(3),key=lambda a:abs(face.normal[a]));u,v=(axis+1)%3,(axis+2)%3
        sign=1 if face.normal[axis]>=0 else -1
        for li in face.loop_indices:
            point=me.vertices[me.loops[li].vertex_index].co
            display = face.material_index==E.SI["emit_a"] and any(k in name for k in ("console", "bridge", "navigation"))
            if display:
                if axis == 1: u,v=0,2
                coords=[me.vertices[me.loops[j].vertex_index].co for j in face.loop_indices]
                U=min(q[u] for q in coords);UU=max(q[u] for q in coords)
                V=min(q[v] for q in coords);VV=max(q[v] for q in coords)
                uv.data[li].uv=((point[u]-U)/max(1e-6,UU-U),(point[v]-V)/max(1e-6,VV-V))
            else:uv.data[li].uv=(point[u],sign*point[v])
    if any(k in name for k in ("bridge", "navigation")):
        from mathutils.bvhtree import BVHTree
        tree=BVHTree.FromPolygons([v.co for v in me.vertices],[list(f.vertices) for f in me.polygons])
        screens=[f for f in me.polygons if f.material_index==E.SI["emit_a"] and f.normal.y>.99]
        if screens:
            largest=max(f.area for f in screens)
            for face in screens:
                if face.area < largest*.5:continue
                centre=sum((me.vertices[v].co for v in face.vertices),me.vertices[0].co*0)/len(face.vertices)
                hit=tree.ray_cast(centre+face.normal*2,-face.normal,2.01)
                if hit[2] is None or me.polygons[hit[2]].material_index!=E.SI["emit_a"]:
                    raise RuntimeError(f"Opaque housing occludes front display ray: {name}; centre={tuple(centre)} hit={hit} slot={E.SLOTS[me.polygons[hit[2]].material_index] if hit[2] is not None else None}")
    return me


E.boxes_mesh=authored_mesh
E.EXPORT_REVISION="r006"
E.OBJECTS_REVISION="r003"

def export_door_leaf():
    """Editable normalized leaf; runtime only sizes/animates this authored machinery."""
    bpy.ops.object.select_all(action="SELECT"); bpy.ops.object.delete(use_global=False)
    mats=E.slot_materials(); bm=bmesh.new()
    def part(slot,x0,z0,x1,z1,y0,y1,cut=0,bevel=0):
        sub=bmesh.new()
        if cut:
            ring=[(x0+cut,z0),(x1-cut,z0),(x1,z0+cut),(x1,z1-cut),(x1-cut,z1),(x0+cut,z1),(x0,z1-cut),(x0,z0+cut)]
            vs=[[sub.verts.new((x,y,z)) for x,z in ring] for y in (y0,y1)]
            sub.faces.new(list(reversed(vs[0])));sub.faces.new(vs[1])
            for i in range(8):sub.faces.new((vs[0][i],vs[0][(i+1)%8],vs[1][(i+1)%8],vs[1][i]))
        else:
            bmesh.ops.create_cube(sub,size=1)
            for v in sub.verts:
                v.co.x=v.co.x*(x1-x0)+(x0+x1)/2
                v.co.y=v.co.y*(y1-y0)+(y0+y1)/2
                v.co.z=v.co.z*(z1-z0)+(z0+z1)/2
        bmesh.ops.recalc_face_normals(sub,faces=list(sub.faces))
        if bevel:bmesh.ops.bevel(sub,geom=list(sub.edges),offset=bevel,segments=2,affect="EDGES",clamp_overlap=True)
        for f in sub.faces:f.material_index=E.SI[slot]
        temp=bpy.data.meshes.new("authored-leaf-part");sub.to_mesh(temp);sub.free();bm.from_mesh(temp);bpy.data.meshes.remove(temp)
    part("secondary",-.5,-.5,.5,.5,-.035,.035,bevel=.006)
    for sign in (-1,1):
        def face(slot,x0,z0,x1,z1,inner,outer,cut=0,bevel=0):
            a,b=sorted((sign*inner,sign*outer));part(slot,x0,z0,x1,z1,a,b,cut,bevel)
        face("primary",-.39,-.24,.39,.34,.034,.041,cut=.065,bevel=.002)
        face("trim",-.46,-.45,.46,-.33,.034,.044,cut=.035,bevel=.002)
        face("secondary",-.32,.355,.28,.455,.034,.043,cut=.022,bevel=.002)
        face("metal",.235,-.15,.275,.11,.035,.045,bevel=.002)
        face("emit_b",-.22,.391,.14,.414,.042,.0455)
        for x in (-.29,.27):face("metal",x,.372,x+.018,.389,.043,.045)
    me=bpy.data.meshes.new("GEO-reference-door-leaf");bm.to_mesh(me);bm.free();me.update()
    uv=me.uv_layers.new(name="authored-surface")
    for f in me.polygons:
        axis=max(range(3),key=lambda a:abs(f.normal[a]));u,v=(axis+1)%3,(axis+2)%3
        for li in f.loop_indices:
            p=me.vertices[me.loops[li].vertex_index].co;uv.data[li].uv=(p[u],p[v])
    ob=bpy.data.objects.new("reference-door-leaf",me);bpy.context.collection.objects.link(ob)
    for m in mats:me.materials.append(m)
    ob["status"]="proposal";ob["revision"]="r002";ob["frame"]="normalized leaf x horizontal, glTF y vertical, z thickness; scale x/y only"
    bpy.context.view_layer.objects.active=ob;ob.select_set(True)
    out=E.ROOT/"assets/runtime/ship-visual/r002";out.mkdir(parents=True,exist_ok=True)
    source=E.ROOT/"assets/source/ship-reference/r002/door-leaf.blend";source.parent.mkdir(parents=True,exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(source),compress=True,check_existing=False)
    bpy.ops.export_scene.gltf(filepath=str(out/"door-leaf.glb"),export_format="GLB",use_selection=True,export_apply=True,export_extras=True,export_yup=True,export_cameras=False,export_lights=False,export_animations=False,export_materials="EXPORT")
    bounds=[min(v.co[a] for v in me.vertices) for a in range(3)]+[max(v.co[a] for v in me.vertices) for a in range(3)]
    (out/"door-leaf-source.json").write_text(json.dumps({"status":"proposal","bounds":[bounds[0],bounds[2],-bounds[4],bounds[3],bounds[5],-bounds[1]],"source":str(source.relative_to(E.ROOT)),"normalization":"scale width/height; thickness remains authored"},indent=2)+"\n")

if __name__=="__main__":
    if "--door-leaf-only" in sys.argv:
        export_door_leaf();sys.exit(0)
    E.main()
    args=E.args()
    manifest=Path(args.out)/"manifest.json"
    if manifest.exists():
        meta=json.loads(manifest.read_text())
        meta["referenceMesh"]={"revision":"r002","selectiveHousingChamferM":.015,"machineryHousingChamferM":.04,"cushionChamferM":.025,"segments":2,"engineBellSegments":32,"previousArtifactsChanged":False}
        manifest.write_text(json.dumps(meta,indent=2)+"\n")
