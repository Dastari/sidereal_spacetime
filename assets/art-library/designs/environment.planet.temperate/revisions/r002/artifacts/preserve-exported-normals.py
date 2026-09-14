# Align JSON to actual native GLB export normals after Blender's float rounding.
# Geometry, UVs, materials, GLB and editable source are untouched.
import sys,json,math,collections
from pathlib import Path
sys.path.insert(0,str(Path.cwd()/'scripts/art_library'))
from audit_native_kit_attributes import read_glb,glb_corners
out=Path(__file__).resolve().parent;kit=json.loads((out/'kit.json').read_text());changed=[]
for mesh in kit['variants']:
 if not mesh['name'].startswith('continent-'):continue
 g,b=read_glb(out/(mesh['name']+'.glb'));corners,_=glb_corners(g,b);lookup=collections.defaultdict(list)
 for material,p,n,uv in corners:lookup[(material,*(round(x,5)for x in(p[0],-p[2],p[1])))].append((n[0],-n[2],n[1]))
 for i,index in enumerate(mesh['indices']):
  p=mesh['positions'][index*3:index*3+3];n=mesh['normals'][index*3:index*3+3];material=kit['materials'][mesh['triangleMaterials'][i//3]]['name'];candidates=lookup[(material,*(round(x,5)for x in p))]
  assert candidates
  new=min(candidates,key=lambda v:math.dist(v,n));delta=math.dist(new,n)
  if delta>1e-4:
   assert delta<.001;mesh['normals'][index*3:index*3+3]=new;changed.append({'variant':mesh['name'],'corner':index,'delta':delta})
if not(out/'kit-before-export-normal-alignment.json').exists():(out/'kit-before-export-normal-alignment.json').write_bytes((out/'kit.json').read_bytes())
(out/'kit.json').write_text(json.dumps(kit,separators=(',',':')));(out/'export-normal-alignment.json').write_text(json.dumps(changed,indent=2));print(changed)
