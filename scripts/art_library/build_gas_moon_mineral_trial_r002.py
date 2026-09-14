"""Native non-emissive mineral interpretation trial; exact geometry retained."""
import ast,sys,json,hashlib
from pathlib import Path
out=Path(sys.argv[sys.argv.index('--')+1]).resolve();name=sys.argv[sys.argv.index('--')+2]
assert name in ['gas-giant-moon-1','gas-giant-moon-3']
prior=Path('/root/sidereal_spacetime/output/playwright/planet-reference-20260914')/(name+'-r001')
source=(prior/'generator.py').read_text();a=source.index('palette=');b=source.index('\nmaterials=[]',a)
palette=ast.literal_eval(source[a+8:b]);palette.extend([(name+'-violet-mineral',(.24,.014,.58),.24),(name+'-pink-mineral',(.57,.021,.32),.28)])
source=source[:a]+'palette='+repr(palette)+source[b:]
source=source.replace('for role in range(6):','for role in range(len(palette)):')
insert='''# Sparse non-emissive minerals on selected existing fractured rim polygons.
# This is an authored interpretation of ambiguous reference highlights.
# Native vertices, faces, normals and UV topology remain unchanged.
mineral_faces=0
for form_name,parts in forms:
 if form_name not in ['battered-region-a','crater-broken']:continue
 for obj in parts:
  for face in obj.data.polygons:
   center=face.center;r=math.hypot(center.x,center.y);angle=math.atan2(center.y,center.x)
   if face.material_index in (0,1,5) and .40<r<.73 and .10<angle<1.35 and center.z>-.08:
    face.material_index=7 if .56<angle<.84 and r>.51 else 6;mineral_faces+=1
assert mineral_faces>0
'''
source=source.replace("kit={'schema':",insert+"\nkit={'schema':",1)
out.mkdir(parents=True,exist_ok=True);assert not(out/'kit.blend').exists()
(out/'generator.py').write_text(source)
(out/'interpretation.json').write_text(json.dumps(dict(referenceId='planets--'+name,prior=str(prior),priorSourceSha256=hashlib.sha256((prior/'generator.py').read_bytes()).hexdigest(),hypothesis='Sparse lower-roughness violet/pink mineral faces may localize highlights while preserving cool rough crust. Ambiguous source lighting; interpreted non-emissive material trial, not factual inferred deposits.',geometry='No geometry changes; selected existing polygon material slots only',emission=False,approval='none'),indent=2))
exec(compile(source,str(out/'generator.py'),'exec'))
old=json.loads((prior/'kit.json').read_text());new=json.loads((out/'kit.json').read_text())
for before,after in zip(old['variants'],new['variants']):
 for key in ['name','positions','normals','uvs','indices']:assert before[key]==after[key],key
assert old['materials']==new['materials'][:6]
(out/'geometry-parity.json').write_text(json.dumps(dict(allVariants=len(old['variants']),positionsNormalsUVIndices='exact',originalMaterials='exact',newMaterialRoles=2),indent=2))
