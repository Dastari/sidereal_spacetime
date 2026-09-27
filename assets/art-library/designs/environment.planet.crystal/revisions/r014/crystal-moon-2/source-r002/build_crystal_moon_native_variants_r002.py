"""Crystal moons: native squat interlocking prism relief, distinct angular moon2."""
import sys,json,hashlib
from pathlib import Path
out=Path(sys.argv[sys.argv.index('--')+1]).resolve();rid=sys.argv[sys.argv.index('--')+2];assert rid in ['planets--crystal-moon-1','planets--crystal-moon-2']
old=Path('/root/sidereal_spacetime/output/playwright/planet-reference-20260914')/(rid.removeprefix('planets--')+'-r001');source=(old/'generator.py').read_text();out.mkdir(parents=True,exist_ok=True);assert not(out/'kit.blend').exists();second=rid.endswith('-2')
insertion='''
# Blunt irregular columns share low connected feet. Broad optical surfaces and
# narrow bevel lips replace dagger populations as the middle crystalline crust.
def lunar_prism(name,x,y,width,depth,height,phase):
 outline=[(-.48,-.31),(-.22,-.49),(.28,-.43),(.49,-.17),(.43,.29),(.12,.46),(-.34,.39),(-.51,.10)]
 verts=[]
 for z,scale in[(-.13,1.08),(height*.53,1.02),(height-.024,1),(height,.91)]:
  for px,py in outline:
   a=px*width;b=py*depth;verts.append((x+(a*math.cos(phase)-b*math.sin(phase))*scale,y+(a*math.sin(phase)+b*math.cos(phase))*scale,z))
 n=len(outline);faces=[tuple(range(n-1,-1,-1))];roles=[5]
 for layer in range(3):
  for j in range(n):
   faces.append((layer*n+j,layer*n+(j+1)%n,(layer+1)*n+(j+1)%n,(layer+1)*n+j))
   roles.append((6 if j in (1,5) else 3) if layer==2 else [5,3,4,5,3,4,5,3][j])
 faces.append(tuple(range(3*n,4*n)));roles.append(4 if phase>.25 else 3)
 return make(name,verts,faces,roles)
for form,scale in [('squat-crystal-district',1),('angular-crystal-district',1.55)]:
 layout=[(-.20,.02,.73,.53,.24,.1),(.21,.19,.49,.51,.35,.30),(.27,-.24,.43,.35,.20,-.15),(-.42,-.22,.31,.34,.15,.42)]
 parts=[lunar_prism('moon-district-'+form+'-'+str(i),x,y,w,d,h*scale,a) for i,(x,y,w,d,h,a) in enumerate(layout)]
 forms.append((form,parts))
# Crystalline cap regions use the existing authored violet/core optical roles.
# Keep dark cavity pigment and geometry; do not substitute painted bright holes.
for name,parts in forms:
 if not name.startswith('crystal-battered-region-'):continue
 for obj in parts:
  for face in obj.data.polygons:
   q=face.center
   if face.material_index in (0,2) and face.normal.z>.35 and q.z>.08:
    face.material_index=3 if q.x<.5 else 5
'''
source=source.replace("kit={'schema'",insertion+"\nkit={'schema'")
if second:
 # Native asymmetric dense shell under angular districts. Macro corner/relief
 # silhouette comes from authored interlocking districts, not large gems.
 source=source.replace('radius=1)','radius=.93)')
 source=source.replace("ground.name='GEO-'+name", "ground.name='GEO-'+name\n    for vertex in ground.data.vertices:vertex.co.x*=1.03;vertex.co.y*=.90;vertex.co.z*=1.06")
 source=source.replace("'scales': [0.36, 0.32, 0.38, 0.33, 0.37, 0.31, 0.36, 0.34]","'scales': [0.30, 0.28, 0.31, 0.27, 0.30, 0.28]")
 source=source.replace("'hero': 0.27","'hero': 0.18")
source=source.replace('native-'+rid+'-r001','native-'+rid+'-r002')
(out/'generator.py').write_text(source);(out/'foundation-source.py').write_bytes((old/'generator.py').read_bytes());r=json.loads((old/'variant-recipe.json').read_text());r.update(candidateRevision='r002',change='Native connected squat prism/buttress districts, crystalline upper caps, separate angular compact moon2',predecessorKitSha256=hashlib.sha256((old/'kit.json').read_bytes()).hexdigest());(out/'variant-recipe.json').write_text(json.dumps(r,indent=2))
exec(compile(source,str(out/'generator.py'),'exec'))
