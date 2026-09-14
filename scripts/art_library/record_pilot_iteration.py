"""Checkpoint exact native pilot iterations, including failures and independent review."""
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont
import sys,json,hashlib,zipfile,subprocess
ROOT=Path(__file__).resolve().parents[2];n=int(sys.argv[1]);out=ROOT/f'.runtime/art-library/hull/r{n:03}';design='shipyard.hull.pilot-section';lib=ROOT/'assets/art-library'
notes=Path(sys.argv[2]).read_text();outcome=sys.argv[3] if len(sys.argv)>3 else 'fail'
def cli(*args):subprocess.run([sys.executable,str(ROOT/'scripts/art_catalog.py'),*args],cwd=ROOT,check=True,stdout=subprocess.DEVNULL)
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
for name in ['pilot-kit.blend','assembly.glb','cutout.png','blender-top.png','runtime-close.png','runtime-top.png','placement-validation.json']:assert (out/name).exists(),name
fit=json.loads((out/'placement-validation.json').read_text());assert all(c['error'] is None for c in fit['checks'])
context={'actual_app':'http://localhost:5174/shipyard','status':'captured','kind':'Actual Shipyard through isolated browser-only review routes; no draft art publication','viewport':[1440,1000],'renderer':'Babylon WebGL2 / Chromium SwiftShader','overrides':'Expose scene reference in response only; stop frame loop for stills. Top camera beta override is a review view, not gameplay flight mode.','publication':False,'screenshots':{p.name:sha(p) for p in out.glob('runtime-*.png')},'artifact_hashes':{str(p.relative_to(out)):sha(p) for p in out.rglob('clean.glb') if not any(s.startswith('attempt-') for s in p.parts)},'layout':json.loads((out/'wayfarer.json').read_text()),'camera_close':{'alpha':-2.25,'beta':.9553166181245092,'radius':27,'target':[0,1.3,-6 if n==2 else -10]},'camera_top':{'beta':.0001},'capture_scripts':f'output/playwright/hull-r{n:03}'}
if n>=5:
 context['hardware_scaling_level']=1
 context['initial_loading_hardware_scale']=2
 if n>=6: context['overrides']+=' Automatic animation loop disabled during isolated still capture; explicit scene.render after UI changes.'
 context['layout']=json.loads((out/'context/wayfarer-final.json').read_text())
 context['camera_close']={'alpha':-2.25,'beta':.9553166181245092,'radius':40,'target':[0,1.3,-7]}
(out/'capture.json').write_text(json.dumps(context,indent=2)+'\n')
validation={'pipeline':fit,'geometry':json.loads((out/'geometry-validation.json').read_text()),'assessment':notes,'outcome':outcome,'owner_final_approval':False}
(out/'validation.json').write_text(json.dumps(validation,indent=2)+'\n');(out/'review.md').write_text(notes)
ref=lib/'shipyard-hull/owner-feedback/2026-09-08'/('side-theme-and-doorway.png' if n>=6 else 'cockpit-corner.png')
prev=lib/f'designs/{design}/revisions/r{n-1:03}/cutout.png'
selected_blender=out/'context/blender-context-cutout.png' if (out/'context/blender-context-cutout.png').exists() else out/'cutout.png'
selected_runtime=out/'runtime-context.png' if (out/'runtime-context.png').exists() else out/'runtime-close.png'
panels=[(ref,'Exact owner reference'),(prev,f'Preserved r{n-1:03}'),(selected_blender,f'Blender r{n:03}'),(selected_runtime,'Actual Shipyard')]
canvas=Image.new('RGB',(2400,800),'#132b38');d=ImageDraw.Draw(canvas);font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',20)
for i,(path,title) in enumerate(panels):
 im=Image.open(path).convert('RGBA');im.thumbnail((590,740));canvas.paste(im,(i*600+(600-im.width)//2,55+(740-im.height)//2),im);d.text((i*600+15,17),title,fill='white',font=font)
canvas.save(out/'comparison.png')
with zipfile.ZipFile(out/'source-pack.zip','w',zipfile.ZIP_DEFLATED) as z:
 for p in out.rglob('*'):
  if p.is_file() and p.suffix not in ['.zip','.blend1']:z.write(p,p.relative_to(out))
 for pattern in [f'*pilot_r{n:03}*', '*pilot_context*']:
  for p in (ROOT/'scripts/art_library').glob(pattern):
   if p.is_file():z.write(p,'recipes/'+p.name)
 for p in (ROOT/f'output/playwright/hull-r{n:03}').glob('*'):
  if p.is_file():z.write(p,'capture-scripts/'+p.name)
 for p in (lib/'shipyard-hull/owner-feedback/2026-09-08').glob('*'):
  if p.is_file():z.write(p,'owner-references/'+p.name)
 for p in ['scripts/voxelize_blender.py','packages/sim/src/voxels.ts','packages/content/src/assembly.ts']:z.write(ROOT/p,'pipeline/'+p)
roles={'blender-source':'pilot-kit.blend','glb':'assembly.glb','cutout':'cutout.png','blender-close':'cutout.png','blender-top':'blender-top.png','runtime-close':'runtime-close.png','runtime-top':'runtime-top.png','runtime-back':'runtime-closed.png','comparison':'comparison.png','specification':'specification.json','validation':'validation.json','capture-record':'capture.json','recipe':'source-pack.zip'}
if (out/'runtime-context.png').exists(): roles['runtime-context']='runtime-context.png'
for role,name in roles.items():
 if not (out/name).exists():continue
 args=['evidence',design,'--revision',str(n),'--role',role,'--file',str(out/name)]
 if role.startswith('runtime'):args+=['--context',json.dumps(context)]
 cli(*args)
cli('feedback',design,'--revision',str(n),'--author','agent','--text',notes)
cli('review',design,'--revision',str(n),'--outcome',outcome,'--notes',notes)
print('Recorded',n,outcome)
