"""Bounded native material-only cover finish; frozen r001 geometry/groves/UVs unchanged."""
import sys,json,hashlib
from pathlib import Path
out=Path(sys.argv[sys.argv.index('--')+1]).resolve();rid=sys.argv[sys.argv.index('--')+2];assert rid in ['planets--temperate-moon-1','planets--temperate-moon-2','planets--ocean-moon-2']
old=Path('/root/sidereal_spacetime/output/playwright/planet-reference-20260914')/(rid.removeprefix('planets--')+'-r001');source=(old/'generator.py').read_text().replace('native-'+rid+'-r001','native-'+rid+'-r002');out.mkdir(parents=True,exist_ok=True);assert not(out/'kit.blend').exists()
if 'temperate' in rid:
 insertion='''
for name,parts in forms:
 if not name.startswith('battered-region-'):continue
 for obj in parts:
  if 'native-grove' in obj.name:continue
  for face in obj.data.polygons:
   q=face.center
   if face.normal.z>.58 and q.z>.10 and face.material_index in (0,1,5,6,7,8):
    if q.x < MAXX or q.y>.57:face.material_index=7 if q.y>.68 else 6
'''.replace('MAXX','.96'if rid.endswith('-1')else'.55')
else:
 source=source.replace('materials=[]',"palette.append(('pale-white-upper-district',(.82,.91,.94),.86))\nmaterials=[]",1)
 insertion='''
for name,parts in forms:
 if not name.startswith('battered-region-'):continue
 for obj in parts:
  for face in obj.data.polygons:
   q=face.center
   if face.normal.z>.58 and q.z>.10 and face.material_index in (0,1,5,8) and (q.x<1.0 or q.y>.40):face.material_index=9
'''
source=source.replace("kit={'schema'",insertion+"\nkit={'schema'")
(out/'generator.py').write_text(source);(out/'foundation-source.py').write_bytes((old/'generator.py').read_bytes());recipe=json.loads((old/'variant-recipe.json').read_text());recipe.update(candidateRevision='r002',change='Selected contiguous upper-district native material assignments only; exact r001 geometry/groves/UVs/normals and composition retained',predecessorKitSha256=hashlib.sha256((old/'kit.json').read_bytes()).hexdigest());(out/'variant-recipe.json').write_text(json.dumps(recipe,indent=2))
exec(compile(source,str(out/'generator.py'),'exec'))
