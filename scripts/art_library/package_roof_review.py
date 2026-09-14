"""Preserve one exact roof iteration; never publish review assets."""
from pathlib import Path
import json,hashlib,zipfile,subprocess,sys
from PIL import Image,ImageDraw,ImageFont
R=Path(__file__).resolve().parents[2];n=int(sys.argv[1]);out=R/'.runtime/art-library/roof'/f'r{n:03}';notes=Path(sys.argv[2]).read_text();outcome=sys.argv[3]
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def cli(*args):subprocess.run([sys.executable,str(R/'scripts/art_catalog.py'),*args],check=True,cwd=R,stdout=subprocess.DEVNULL)
ref=R/'reference/art/top-down-after.png';prev=out/'runtime-before.png' if n==1 else R/f'.runtime/art-library/roof/r{n-1:03}/runtime-close.png'
canvas=Image.new('RGB',(2400,850),'#142734');draw=ImageDraw.Draw(canvas);font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',22)
for i,(p,label) in enumerate([(ref,'Owner reference'),(prev,'Previous actual Shipyard'),(out/'blender-context-closed.png',f'Blender R{n:03}'),(out/'runtime-close.png',f'Actual Shipyard R{n:03}')]):
 im=Image.open(p).convert('RGBA');im.thumbnail((590,780));canvas.paste(im,(i*600+(600-im.width)//2,55+(780-im.height)//2),im);draw.text((i*600+16,15),label,font=font,fill='white')
canvas.save(out/'comparison.png');(out/'review.md').write_text(notes)
capture={'application':'http://localhost:5174/shipyard?assembly','kind':'Actual Shipyard with isolated review catalog and native GLB routes','publication':False,'viewport':[1440,1000],'renderer':'Babylon WebGL2 Chromium SwiftShader','overrides':'Expose scene in browser response only; disable animation loop during load and render stills explicitly; hardware scaling1 for capture,2duringloading. Top camera overrides elevation for review only.','files':{p.name:sha(p) for p in out.glob('runtime-*.png')},'kit_sha256':sha(out/'kit.glb'),'catalog_sha256':sha(out/'ship-catalog.json'),'assembly_sha256':sha(out/'ship-wayfarer.json')}
(out/'capture.json').write_text(json.dumps(capture,indent=2)+'\n')
with zipfile.ZipFile(out/'recipe.zip','w',zipfile.ZIP_DEFLATED) as z:
 for p in out.rglob('*'):
  if p.is_file() and p.suffix not in ['.zip','.blend1']:z.write(p,p.relative_to(out))
 for p in (R/'scripts/art_library').glob('*roof*'):
  if p.is_file():z.write(p,'recipes/'+p.name)
 for folder,prefix in [(R/f'output/playwright/roof-r{n:03}','capture-scripts'),(R/'assets/art-library/shipyard-roof/owner-references','owner-references')]:
  for p in folder.rglob('*'):
   if p.is_file():z.write(p,prefix+'/'+str(p.relative_to(folder)))
# Archive the concrete marking integration and its browser proof with the art kit.
with zipfile.ZipFile(out/'recipe.zip','a',zipfile.ZIP_DEFLATED) as z:
 for f in ['packages/content/src/assembly.ts','packages/content/src/hull-decals.ts','packages/content/src/hull-decals.test.ts','packages/content/src/hull-publication.ts','packages/render/src/hull-decals.ts','packages/render/src/hull-decals.test.ts','packages/render/src/assembly-editor.ts','packages/render/src/layout-hull.ts','packages/render/src/installed-equipment.ts','apps/dashboard/src/shipyard/HullDecalPanel.tsx','apps/dashboard/src/shipyard/hull-decals.css','apps/dashboard/src/shipyard/AssemblyEditor.tsx','apps/dashboard/src/shipyard/layout/HullWorkspace.tsx','docs/hull_markings.md']:
  if (R/f).exists():z.write(R/f,'integration/'+f)
 for f in (R/'output/playwright/hull-decals').glob('*'):
  if f.is_file():z.write(f,'decal-browser-proof/'+f.name)
roles={'blender-source':'roof-kit.blend','glb':'kit.glb','cutout':'blender-context-closed.png','blender-close':'blender-context-closed.png','blender-top':'blender-context-top.png','runtime-close':'runtime-close.png','runtime-top':'runtime-top.png','comparison':'comparison.png','validation':'validation.json','specification':'specification.json','capture-record':'capture.json','recipe':'recipe.zip'}
for role,name in roles.items():
 if not(out/name).exists():continue
 args=['evidence','shipyard.roof.frontier','--revision',str(n),'--role',role,'--file',str(out/name)]
 if role.startswith('runtime'):args+=['--context',json.dumps(capture)]
 cli(*args)
cli('feedback','shipyard.roof.frontier','--revision',str(n),'--author','agent','--text',notes)
cli('review','shipyard.roof.frontier','--revision',str(n),'--outcome',outcome,'--notes',notes)
print('Recorded roof revision',n,outcome)
