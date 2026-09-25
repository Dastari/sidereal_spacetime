"""Preserve per-revision physical evidence and honest observations in living ledgers."""
from pathlib import Path
import json,subprocess,zipfile,hashlib,shutil,sys
from PIL import Image,ImageDraw
ROOT=Path(__file__).resolve().parents[2];LIB=ROOT/'assets/art-library'
jobs=json.loads((ROOT/'.runtime/art-library/equipment/jobs.json').read_text())
notes={'pilot-seat': 'Native bevels, upholstery seams, foot grips and arm encoders replace the coarse visual surface. Cyan status faces retain emissive PBR. Reference framing is slimmer/darker; headrest contour and crew entry still need review.', 'command-console': 'Fine emissive display diagrams, individual keys, encoders and touch strips add reference-scale detail. A bounded display light falls toward the keyboard. Three-screen station remains an explicit variant of the broad reference screen; rear service-panel detail and crew reach remain to review.', 'wall-locker': 'Native cabinet bevels, fine labels and machined hinges preserve the recessed profile and all six identities. Reference is taller/narrower than the required existing envelope. Door operation and rig reach remain proposed. No luminous surface is invented for this unlit cabinet.', 'reactor': 'Native curved surfaces remove radial voxel stepping; ring retainers, coolant elbows, service vents and a fine emissive diagnostic panel add detail. Reference dark ring proportions and shrouds remain richer. Luminous cyan inserts are opaque emitters, not glass or functional reactor power.', 'hydroponics': 'Native pointed leaves retain thin authored edges. Six warm emissive panels sit below the canopy, with two downward fixture lights illuminating the plants. Nutrient control screen, valves, feeds and reservoir panels add detail. Leaf clusters remain stylized and regular versus the reference. Exact crop species, growth animation and lighting-driven gameplay remain proposed.', 'crew-bunk': 'Native edges, blanket binding and emissive reading fixtures add detail. Reference enclosure and amber hardware remain more compact; sleeping clearance, ceiling fit and safe ladder animation remain unverified.', 'medical-bed': 'Rebuilt layered lift base and grounded sleds, shaped tilted headrest, inset service panels and vents, supply drawer, hinged rails with releases, IV cartridge and line, and fine clinical display address the owner detail request. Emissive vitals and an underside exam-light diffuser have bounded local lighting. Reference proportions, richer foot-end equipment and articulated crew treatment poses still need review. No medical mechanics are implemented.', 'lounge-sofa': 'Native cushion bevels, piping, upholstery buttons and arm inserts add detail. Reference has more red outer shell and smaller lower supports; this covers only the straight variant, not the L-shaped sofa. Seating poses remain unverified.', 'bridge-bank': 'Fine emissive diagrams, individual keys and encoders preserve port/starboard service-side mirrors and distinct IDs. A bounded display light falls toward the input surface. Legacy +.03125 m local-X frame is retained. Reference side portrait monitor cannot fit the existing narrow footprint; rear detailing and seated reach remain to review.'}
review=LIB/'shipyard-equipment';tiles=[]
def cli(*args):subprocess.run([sys.executable,str(ROOT/'scripts/art_catalog.py'),*args],cwd=ROOT,check=True,stdout=subprocess.DEVNULL)
for j in jobs:
 if '--only' in sys.argv and j['slug']!=sys.argv[sys.argv.index('--only')+1]:continue
 out=ROOT/j['output'];primary=out/j['variants'][0]['name'];d=LIB/'designs'/j['design_id'];ledger=json.loads((d/'design.json').read_text());rev=ledger['revisions'][-1]
 if any(e['role']=='cutout' for e in rev['evidence']):continue
 spec=json.loads((out/'specification.json').read_text());spec['measured_proxy_bounds_by_variant']=spec.pop('measured_bounds_by_variant',{});spec['measured_visual_bounds_by_variant']={v['name']:json.loads((out/v['name']/'validation.json').read_text())['bounds_m'] for v in j['variants']};spec['lod']='One authored native visual mesh; no fleet/LOD performance claim.';spec['pipeline']={'visual':'Native Blender evaluated meshes and PBR → GLB → Babylon','occupancy':'Separate retained sampler/meshChunk proxy; see occupancy_proxy provenance','optics':'Opaque PBR and emissive surfaces, no transmission in this review'};(out/'specification.json').write_text(json.dumps(spec,indent=2)+'\n')
 for v in j['variants']:
  dest=out/v['name']
  for file in ['runtime-close.png','runtime-top.png','blender-source.blend','glb.glb','validation.json']:
   if not (dest/file).exists():raise ValueError('Missing actual evidence '+str(dest/file))
  capture=json.loads((dest/'capture.json').read_text());capture['status']='captured';capture['screenshots']={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in [dest/'runtime-close.png',dest/'runtime-top.png']};(dest/'capture.json').write_text(json.dumps(capture,indent=2)+'\n')
  with Image.open(dest/'cutout.png') as im:
   assert im.mode=='RGBA' and im.getextrema()[3][0]==0 and im.getextrema()[3][1]>0
 ref=json.loads((LIB/'assets'/j['reference_id']/'reference.json').read_text());refpath=LIB/ref['crop_path']
 panels=[(refpath,'Exact reference crop')]
 if j.get('previous_output'):panels.append((ROOT/j['previous_output']/j['variants'][0]['name']/'cutout.png','Preserved previous Blender revision'))
 panels += [(primary/'cutout.png','Blender: native authored surfaces'),(primary/'runtime-close.png','Actual Shipyard: unsigned review')]
 canvas=Image.new('RGB',(512*len(panels),800),'#152b38');draw=ImageDraw.Draw(canvas)
 for i,(path,label) in enumerate(panels):
  with Image.open(path) as src:
   src=src.convert('RGBA');src.thumbnail((496,730));x=i*512+(512-src.width)//2;y=55+(730-src.height)//2;canvas.paste(src,(x,y),src)
  draw.text((i*512+15,18),label,fill='white')
 canvas.save(out/'comparison.png')
 with zipfile.ZipFile(out/'recipe.zip','w',zipfile.ZIP_DEFLATED) as z:
  for p in ['scripts/art_library/refine_equipment_surfaces.py','packages/render/src/equipment-lighting.ts','packages/render/src/equipment-lighting.test.ts','scripts/art_library/build_equipment_review.py','scripts/art_library/cook_equipment_review.py','scripts/art_library/mesh_equipment_review.ts','scripts/art_library/run_equipment.py','scripts/voxelize_blender.py','scripts/voxel_visual_surface.py','packages/sim/src/voxels.ts','scripts/art_library/prepare_equipment_capture.py']:
   z.write(ROOT/p,p)
  # Earlier generator version actually used for first seat/console source is retained too.
  for p in out.glob('*.py'):z.write(p,'source-history/'+p.name)
  if j.get('previous_output'):
   prior=ROOT/j['previous_output']/'recipe.zip'
   if prior.exists():z.write(prior,'source-history/previous-recipe.zip')
  for file in ['authoring.blend','authoring.glb','source-validation.json','specification.json','samples.json']:
   z.write(out/file,'authoring/'+file)
  z.writestr('job.json',json.dumps(j,indent=2))
  for p in primary.iterdir():
   if p.is_file() and p.name in ['blender-emission.png','runtime-lighting-off.png','runtime-lighting-on.png','lights.json','browser.log','mesh.json','voxels.json']:z.write(p,'lighting-and-proxy/'+p.name)
  for v in j['variants'][1:]:
   for p in (out/v['name']).iterdir():
    if p.is_file():z.write(p,'variants/'+v['name']+'/'+p.name)
  capture_script=ROOT/'output/playwright/equipment'/f"{j['slug']}-{j['variants'][0]['name']}.js";z.write(capture_script,'capture.js')
 debug=Image.new('RGB',(1536,768),'#142a36')
 for i,name in enumerate(['runtime-lighting-off.png','runtime-lighting-on.png']):
  im=Image.open(primary/name).convert('RGB');im.thumbnail((768,720));debug.paste(im,(i*768+(768-im.width)//2,40));ImageDraw.Draw(debug).text((i*768+12,10),'Actual Shipyard: '+('emissive materials only' if i==0 else 'emissive + placed fixture lights'),fill='white')
 debug.save(out/'lighting-comparison.png')
 roles={'material-debug':primary/'blender-emission.png','runtime-context':out/'lighting-comparison.png','specification':out/'specification.json','blender-source':primary/'blender-source.blend','glb':primary/'glb.glb','cutout':primary/'cutout.png','blender-close':primary/'cutout.png','blender-top':primary/'blender-top.png','runtime-close':primary/'runtime-close.png','runtime-top':primary/'runtime-top.png','validation':primary/'validation.json','voxel-data':out/'samples.json','comparison':out/'comparison.png','capture-record':primary/'capture.json','recipe':out/'recipe.zip'}
 for role,path in roles.items():
  args=['evidence',j['design_id'],'--revision',str(j['revision']),'--role',role,'--file',str(path)]
  if role.startswith('runtime'):args+=['--context',json.dumps(json.loads((primary/'capture.json').read_text()))]
  if role=='recipe' and len(j['variants'])>1:args+=['--notes','Includes full starboard variant editable Blender, GLB, alpha cutout, Blender/top and actual Shipyard close/top, validation and capture hashes. Catalog IDs and both placements retained.']
  cli(*args)
 observation=notes[j['slug']]
 if j.get('known_failure'):observation+=' Validation failure: '+j['known_failure']
 if '--native-pass' in sys.argv:observation+=' Native Blender surfaces and emissive materials are exported directly. The previous validated occupancy proxy is separate, passes the actual voxel placement pipeline, and does not encode new visual detail. Local damage remesh fidelity is pending; no authority or publication changed.'
 if '--surface-pass' in sys.argv:
  observation+=' This revision uses the active welded micro-bevel surface; compare the preserved previous revision. Edge highlights are restrained, not a substitute for further reference-shape refinement. Reference fidelity, rig access and proposed statistics still require owner feedback.'
  if j['slug']=='medical-bed':observation=observation.replace('The first cooked view exposes detached corner foot pads; this is a modeling defect to correct before owner-ready review.','The preserved prior view exposed detached foot pads. This revision adds continuous corner supports and grounds the lift plinth; the actual Blender and Shipyard views verify that correction.')
  if j['slug']=='hydroponics':observation=observation.replace('Sampled leaves remain too blocky and regular;','This revision replaces regular faceted leaf clusters with tapered, differently oriented leaves and varied plant heights, sampled at 1/64 m. Fine stepping remains visible;')
  if j['slug']=='bridge-bank':observation+=' The current revision also preserves the legacy +.03125 m local-X frame offset for both variant volumes.'
  if j['slug']=='wall-locker' and j['revision']>=4:observation+=' This revision narrows the Blender body to the existing recessed wall profile and places the projecting cap only at its original height. All six original locker placements now pass the actual occupied-cell validator without transform changes.'
 cli('feedback',j['design_id'],'--revision',str(j['revision']),'--author','agent','--text',observation)
 fit=json.loads((LIB/'shipyard-equipment/placement-fit.json').read_text()) if (LIB/'shipyard-equipment/placement-fit.json').exists() else {'results':[]}
 failures=[r for r in fit['results'] if r['asset_id'] in [v['asset_id'] for v in j['variants']] and r['review']]
 if failures:observation+=' Read-only actual placement validation found wall-recess overlap in '+str(len(failures))+' existing placements; revise the Blender depth profile before owner-ready review.'
 cli('review',j['design_id'],'--revision',str(j['revision']),'--outcome','pass' if ('--surface-pass' in sys.argv or '--native-pass' in sys.argv) and not failures and not j.get('known_failure') else 'fail','--notes',observation+' No final sign-off or publication.')
 (d/'revisions'/f"r{j['revision']:03}"/'review.md').write_text('# Equipment review\n\n'+observation+'\n\nOwner direction: Blender is the authoring path; TypeScript equipment solids are being phased out. This revision preserves native Blender visual surfaces. The owner requested more reference detail, particularly the medical bed, and emissive displays and correctly located grow lighting. That feedback is retained against the prior exact revisions. This iteration awaits further owner feedback and exact sign-off.\n')
 print('Recorded',j['design_id'],j['revision'],flush=True)
