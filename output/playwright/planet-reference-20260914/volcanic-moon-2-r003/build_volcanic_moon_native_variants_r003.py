"""Bounded native hot-junction successor. Reuses exact r002 authored foundations.
Blender --background --python THIS -- NEW_OUTPUT planets--volcanic-moon-[12]
"""
import sys,json,hashlib
from pathlib import Path
root=Path(__file__).resolve().parents[2];out=Path(sys.argv[sys.argv.index('--')+1]).resolve();rid=sys.argv[sys.argv.index('--')+2]
assert rid in ['planets--volcanic-moon-1','planets--volcanic-moon-2'];moon=rid[-1];previous=root/f'output/playwright/planet-reference-20260914/volcanic-moon-{moon}-r002';source=(previous/'generator.py').read_text()
out.mkdir(parents=True,exist_ok=True);assert not(out/'kit.blend').exists()
source=source.replace('native-'+rid+'-r002','native-'+rid+'-r003')
source=source.replace("if name.endswith('-b'):paths=paths[:1]\n for pi", "if name.endswith('-b'):paths=paths[:1]\n terrain_parts=list(parts)\n for pi")
old="""   z=top+.004
   verts.extend([(x-nx*w,y-ny*w,z-.014),(x+nx*w,y+ny*w,z-.014),(x-nx*w,y-ny*w,z),(x+nx*w,y+ny*w,z)])"""
new="""   # Only selected junctions broaden; other fault tips stay narrow and cold districts survive.
   # Unequal banks create connected angular hot patches rather than uniform-width rails.
   selected=(pi in [0,1])
   profile=[.72,1.7,6.5,4.1,1.35,.68] if name.endswith('-a') else [.72,1.2,3.5,2.4,1.,.68]
   if MOON_TWO:profile=[.70,1.45,5.5,3.6,1.15,.62] if name.endswith('-a') else [.65,1.05,4.2,2.65,.9,.62]
   multiplier=profile[j] if selected else 1.
   left=w*multiplier*(1.12 if j%2 else .86);right=w*multiplier*(.85 if j%2 else 1.14)
   sides=[]
   for xx,yy in [(x-nx*left,y-ny*left),(x+nx*right,y+ny*right)]:
    surface=-10
    for terrain in terrain_parts:
     hit,p,n,index=terrain.ray_cast(Vector((xx,yy,3)),Vector((0,0,-1)))
     if hit:surface=max(surface,p.z)
    assert surface>-.2,(name,pi,j,xx,yy,surface)
    sides.append((xx,yy,surface+.006))
   a,b=sides
   verts.extend([(a[0],a[1],a[2]-.014),(b[0],b[1],b[2]-.014),a,b])""".replace('MOON_TWO',str(moon=='2'))
assert old in source;source=source.replace(old,new)
# Preserve top/bottom depth through adaptive triangulation, then seat each native
# vertex against the authored source crust. This happens in Blender, not runtime.
old_bmesh="""  bm=bmesh.new();bm.from_mesh(obj.data);bmesh.ops.triangulate(bm,faces=list(bm.faces))
  for _ in range(5):"""
new_bmesh="""  bm=bmesh.new();bm.from_mesh(obj.data);bm.verts.ensure_lookup_table()
  roof=bm.verts.layers.float.new('native-hot-roof-weight')
  for vertex in bm.verts:vertex[roof]=1. if vertex.index%4>=2 else 0.
  bmesh.ops.triangulate(bm,faces=list(bm.faces))
  for _ in range(5):"""
assert old_bmesh in source;source=source.replace(old_bmesh,new_bmesh)
old_end="""  bm.to_mesh(obj.data);bm.free();parts.append(obj)"""
new_end="""  for vertex in bm.verts:
   surface=-10
   for terrain in terrain_parts:
    hit,p,n,index=terrain.ray_cast(Vector((vertex.co.x,vertex.co.y,3)),Vector((0,0,-1)))
    if hit:surface=max(surface,p.z)
   # Short unsupported fracture gaps retain the bank-to-bank native bridge.
   if surface>-.2:vertex.co.z=surface+.006-.014*(1-max(0,min(1,vertex[roof])))
  bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
  bm.to_mesh(obj.data);bm.free();parts.append(obj)"""
assert old_end in source;source=source.replace(old_end,new_end)
# Tessellated roofs retain native fine triangles before spherical transport.
source=source.replace("'publication':'isolated draft; no owner final sign-off'", "'publication':'isolated volcanic moon r003 hot-junction candidate; visual review pending'")
(out/'generator.py').write_text(source);(out/'foundation-source-r002.py').write_bytes((previous/'generator.py').read_bytes())
(out/'variant-recipe.json').write_text(json.dumps({'referenceId':rid,'sourceRevision':previous.name,'sourceSHA256':hashlib.sha256((previous/'generator.py').read_bytes()).hexdigest(),'scope':'selected native hot-junction widths and asymmetric banks only; cold foundation, craters, layout, PBR factors and textures retained','status':'native candidate, not visual approval'},indent=2))
exec(compile(source,str(out/'generator.py'),'exec'))
