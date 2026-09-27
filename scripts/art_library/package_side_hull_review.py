from pathlib import Path
import json,hashlib,subprocess,sys,zipfile
from PIL import Image,ImageDraw
R=Path(__file__).resolve().parents[2];n=int(sys.argv[1]);O=R/'.runtime/art-library/side-hull'/f'r{n:03}';notes=Path(sys.argv[2]).read_text();outcome=sys.argv[3]
# Comparisons compose exact screenshots without repainting geometry.
files=[R/'assets/art-library/shipyard-side-hull/owner-references/reference.png',R/'output/playwright/side-hull/before.png',O/'blender-close.png',O/'runtime-close.png'];canvas=Image.new('RGB',(1800,1320),'#142331');draw=ImageDraw.Draw(canvas)
for i,(file,label)in enumerate(zip(files,['Owner reference','Before: actual Shipyard','Revision: Blender','Revision: actual Shipyard'])):
 im=Image.open(file).convert('RGBA');im.thumbnail((880,605));x=(i%2)*900+10;y=(i//2)*660+45;canvas.paste(im,(x,y),im);draw.text((x,y-30),label,fill='white')
canvas.save(O/'comparison.png')
capture={'url':'http://localhost:5174/shipyard?assembly','assets':'Isolated HTTP routes for this exact revision only','renderer':'Actual Babylon Shipyard, software WebGL2; paused loop/manual frames and camera framing','kit_sha256':hashlib.sha256((O/'kit.glb').read_bytes()).hexdigest(),'placement_check':json.loads((O/'placement-check.json').read_text()),'publication':False};(O/'capture.json').write_text(json.dumps(capture,indent=2));(O/'review.md').write_text(notes)
with zipfile.ZipFile(O/'recipe.zip','w',zipfile.ZIP_DEFLATED)as z:
 for f in O.rglob('*'):
  if f.is_file()and f.suffix not in ['.zip']:z.write(f,f.relative_to(O))
 for folder in [R/'.runtime/art-library/side-hull/baseline',R/'.runtime/art-library/side-hull/independent-review',R/'output/playwright/side-hull']:
  for f in folder.glob('*'):
   if f.is_file():z.write(f,'support/'+folder.name+'/'+f.name)
 z.write(R/'.runtime/art-library/side-hull/inventory.json','support/inventory.json')
 z.write(R/'scripts/voxelize_blender.py','source/voxelize_blender.py')
 for name in ['build_roof_review.py','run_side_hull.py','prepare_side_hull_review.py','render_side_hull_review.py','build_side_hull_review.py']:z.write(R/'scripts/art_library'/name,'source/'+name)
roles={'blender-source':'side-hull-kit.blend','glb':'kit.glb','cutout':'blender-close.png','blender-close':'blender-close.png','blender-top':'blender-top.png','runtime-close':'runtime-close.png','runtime-top':'runtime-top.png','comparison':'comparison.png','validation':'validation.json','specification':'specification.json','capture-record':'capture.json','recipe':'recipe.zip'}
def cli(*args):subprocess.run(['python3','scripts/art_catalog.py',*args],cwd=R,check=True)
for role,name in roles.items():
 args=['evidence','shipyard.hull.side-armor','--revision',str(n),'--role',role,'--file',str(O/name)]
 if role.startswith('runtime'):args+=['--context',json.dumps(capture)]
 cli(*args)
cli('feedback','shipyard.hull.side-armor','--revision',str(n),'--author','agent','--text',notes)
cli('review','shipyard.hull.side-armor','--revision',str(n),'--outcome',outcome,'--notes',notes)
