"""Preserve exact pilot-kit review artifacts; never signs off or publishes."""
from pathlib import Path
import json,hashlib,subprocess,sys,zipfile,shutil,struct
ROOT=Path(__file__).resolve().parents[2];out=ROOT/'.runtime/art-library/hull/r001';lib=ROOT/'assets/art-library';design='shipyard.hull.pilot-section'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def cli(*args):subprocess.run([sys.executable,str(ROOT/'scripts/art_catalog.py'),*args],cwd=ROOT,check=True,stdout=subprocess.DEVNULL)
for name in ['runtime-clean.png','runtime-worn.png','runtime-damaged.png','runtime-close.png','runtime-closed.png','runtime-top.png','runtime-placement.png','pilot-kit.blend','assembly.glb','component-board.png']:
 if not (out/name).exists():raise ValueError('Missing real evidence: '+name)
fit=json.loads((out/'placement-validation.json').read_text());ui=json.loads((out/'browser-placement-validation.json').read_text());assert all(not p['error'] for p in fit['checks']) and ui['passed']
matchecks=[]
for c in json.loads((out/'components.json').read_text()):
 for state in ['clean','worn','damaged']:
  p=out/c['slug']/(state+'.glb');b=p.read_bytes();n=struct.unpack_from('<I',b,12)[0];g=json.loads(b[20:20+n]);matchecks.append({'component':c['slug'],'state':state,'sha256':sha(p),'normal_textures':sum('normalTexture' in m for m in g['materials']),'embedded_images':all('bufferView' in i for i in g.get('images',[])),'textured_glazing_policy':'alpha BLEND permitted in native visual; opaque proxy independently sampled'})
  assert all('bufferView' in i for i in g.get('images',[]))
  if not c['slug'].startswith('canopy'):assert any('normalTexture' in m for m in g['materials'])
validation={'result':'pass for isolated module / proxy / material review; no whole-ship flight or authority approval','placement':fit,'actual_editor_controls':ui,'geometry':json.loads((out/'geometry-validation.json').read_text()),'native_glb_states':matchecks,'publication_isolation':json.loads((out/'publication-isolation.json').read_text())}
(out/'validation.json').write_text(json.dumps(validation,indent=2)+'\n')
capture={'status':'captured','actual_app':'http://localhost:5174/shipyard','kind':'Actual dashboard Shipyard with unsigned GLB, catalog, volumes and draft routed inside isolated Playwright browser only','publication':False,'viewport':[1440,1000],'renderer':'Babylon WebGL2 / Chromium SwiftShader','overrides':'Response-only scene reference for camera positioning and deterministic still renders; top view beta override is not gameplay flight mode. Native renderer source unchanged.','camera_close':{'alpha':-2.25,'beta':.9553166181245092,'radius':29,'target':[0,1.2,-7]},'camera_states':{'alpha':-2.25,'beta':.9553166181245092,'radius':25,'target':[0,1,-7]},'camera_top':{'beta':.0001,'radius':30},'hashes':{str(p.relative_to(ROOT)):sha(p) for p in [ROOT/'packages/render/src/assembly-editor.ts',out/'catalog.json',out/'catalog.voxels.json',out/'wayfarer.json',out/'pilot-kit.blend',*out.glob('runtime-*.png')]}}
(out/'capture.json').write_text(json.dumps(capture,indent=2)+'\n')
# Browser result records contain actual loaded texture/material names and UI draft identity.
for file in ['browser.log','placement-browser.log','states-browser.log']:
 p=ROOT/'output/playwright/hull'/file
 if p.exists():shutil.copyfile(p,out/file)
with zipfile.ZipFile(out/'source-pack.zip','w',zipfile.ZIP_DEFLATED) as z:
 for p in sorted(out.rglob('*')):
  if p.is_file() and p.suffix not in ['.zip','.blend1'] and p.name not in ['npm-build.log','check.log']:z.write(p,p.relative_to(out))
 for p in ['build_hull_review.py','hull_maps.py','run_hull.py','render_hull_review.py','finalize_hull_source.py','prepare_hull_capture.py','check_hull_review.ts','document_hull_review.py','record_hull_review.py']:
  z.write(ROOT/'scripts/art_library'/p,'recipes/'+p)
 for p in ['scripts/voxelize_blender.py','packages/sim/src/voxels.ts','packages/content/src/assembly.ts']:
  z.write(ROOT/p,'pipeline/'+p)
 for p in (ROOT/'output/playwright/hull').glob('*.js'):z.write(p,'capture-scripts/'+p.name)
roles={'blender-source':'pilot-kit.blend','glb':'assembly.glb','cutout':'cutout.png','blender-close':'cutout.png','blender-top':'blender-top.png','runtime-close':'runtime-close.png','runtime-top':'runtime-top.png','runtime-back':'runtime-closed.png','runtime-context':'material-comparison.png','material-debug':'map-board.png','comparison':'comparison.png','specification':'specification.json','validation':'validation.json','capture-record':'capture.json','recipe':'source-pack.zip','concept':'component-board.png'}
for role,name in roles.items():
 args=['evidence',design,'--revision','1','--role',role,'--file',str(out/name)]
 if role.startswith('runtime'):args+=['--context',json.dumps(capture)]
 if role=='recipe':args+=['--notes','Complete ten-component source pack: editable kit plus opaque Blender proxy collection, all 30 state GLBs, material maps/decal layer, individual alpha cutouts, original internal attempt, all actual Shipyard captures, placement and material checks, sources and recipes.']
 cli(*args)
cli('feedback',design,'--revision','1','--author','owner','--text','Requested closing the before/after gap, especially the external hull and front pilot section, with modular diagonal pieces placed on the ship grid and support for decals and damage texture/bump maps. This is task direction, not approval of r001.','--message-reference','Current conversation: owner message linking 3d-rpg-after and 3d-rpg-before and beginning “I want you to try and work on closing the gap here.”')
notes='Ten native Blender module types form a broad six-metre flat bow with diagonal shoulders, separate glazing and removable roof; 35 hull placements plus unchanged pilot seat/console. Actual sampled proxy checks and Shipyard Add/snap/Rotate/Flip passed. Native colour/roughness/normal maps and alpha glazing survived GLB/runtime. Source pack retains the first internal render with roof coplanarity and repeated nameplates, plus corrected source/evidence. Remaining: upright canopy and flat roof differ from target rake, junction seals/rear adapter, repeated damage masks, richer reference hardware, full crew sweep and full-ship integration. Decal layer is editable/baked; no in-game decal tool or reactive damage-state selection implemented. No final sign-off or publication. Next action: owner silhouette feedback, then r002 raked canopy/roof-shoulder/junction study.'
cli('feedback',design,'--revision','1','--author','agent','--text',notes)
cli('review',design,'--revision','1','--outcome','pass','--notes',notes)
review=lib/'shipyard-hull';review.mkdir(exist_ok=True)
# Human-readable entry point uses canonical hashed evidence, not mutable runtime paths.
ledger=json.loads((lib/'designs'/design/'design.json').read_text());rev=ledger['revisions'][-1]
links={e['role']:e['path'] for e in rev['evidence']}
print(json.dumps(links,indent=2))
(review/'artifact-links.json').write_text(json.dumps(links,indent=2)+'\n')
shutil.copyfile(out/'grid-layout.svg',review/'grid-layout-r001.svg')
shutil.copyfile(out/'inventory.json',review/'inventory.json')
shutil.copyfile(out/'specification.json',review/'specification-r001.json')
shutil.copyfile(out/'validation.json',review/'validation-r001.json')
