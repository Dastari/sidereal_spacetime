"""Immutable appearance evidence and explicit reference coverage; never owner approval."""
from pathlib import Path
from argparse import Namespace
import sys,json,struct,hashlib,math,shutil
from PIL import Image,ImageDraw,ImageFont
ROOT=Path(__file__).resolve().parents[2];sys.path.insert(0,str(ROOT/'scripts'));import art_catalog as ac
# Reuse the same GLB/PBR/image checks without executing the primary checkpoint command.
src=(ROOT/'scripts/art_library/document_cargo.py').read_text();exec(src[src.index('def digest('):src.index('refresh=ac.refresh')])
mode=sys.argv[1];PW=ROOT/'output/playwright'/('cargo-'+mode);captures=json.loads((PW/'captures.json').read_text());font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',18)
for c in captures:
 if c['tag']=='common-scale':continue
 d=Path(c['output']);s=json.loads((d/'specification.json').read_text());refs=s['reference_ids'];comparison=d/'comparison.png'
 if not comparison.exists():
  board=Image.new('RGB',(1500,650),(19,27,40));draw=ImageDraw.Draw(board)
  for i,key in enumerate(refs):
   ref=ac.read(ac.LIB/'assets'/key/'reference.json');im=Image.open(ac.LIB/ref['crop_path']).convert('RGBA');im=im.resize((im.width*3,im.height*3),Image.Resampling.NEAREST);im.thumbnail((420,450//len(refs)));board.paste(im,(30,75+i*(450//len(refs))),im)
  im=Image.open(d/'cutout.png');im.thumbnail((760,540));board.paste(im,(640,55),im);draw.text((25,20),'BEFORE: exact preserved source crop(s)',font=font,fill='white');draw.text((650,20),'AFTER: '+c['tag'],font=font,fill='white');draw.text((25,610),'Native Blender draft; dimensions and stats proposed; no owner sign-off or publication.',font=font,fill='#e6b36a');board.save(comparison)
 v=validate(d);assert v['glb_sha256']==c['glb_sha256'],'Capture hash stale'
 log=Path(c['log']).read_text();actual=json.loads(log.split('### Result\n',1)[1].split('\n###',1)[0]);capture={'actual':actual,'glb_sha256':v['glb_sha256'],'source_sha256':v['source_sha256'],'revision':c['revision'],'kind':'Actual Shipyard in isolated browser routes; no publication/live authority','camera_top':'Explicit overhead review override','commit':__import__('subprocess').check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip(),'renderer':'Babylon WebGL2 / Chromium SwiftShader','publication':False};(d/'runtime-capture.json').write_text(json.dumps(capture,indent=2))
 with ac.locked():
  ledger=ac.read(ac.design_path(c['design_id']));revision=next(r for r in ledger['revisions'] if r['revision']==c['revision']);assert ledger['owner_final_signoff'] is None
  target=ac.design_path(c['design_id']).parent/'revisions'/f"r{c['revision']:03}"/'appearances'/c['tag'];target.mkdir(parents=True,exist_ok=True)
  roles={'blender-source.blend':'blender-source','glb.glb':'glb','cutout.png':'cutout','blender-close.png':'blender-close','blender-top.png':'blender-top','runtime-close.png':'runtime-close','runtime-top.png':'runtime-top','comparison.png':'comparison','specification.json':'specification','validation.json':'validation','runtime-capture.json':'capture-record','recipe.zip':'recipe'}
  names=list(roles)+['materials.json','validation-blender.json','blender-underside.png','blender-cavity.png','blender-open.png','blender-half-open.png','reference.png','blender-stack-carrier.png','stack-carrier.blend','fit.json']
  for name in names:
   source=d/name
   if not source.exists():continue
   dest=target/name
   if dest.exists():assert digest(dest)==digest(source),'Immutable evidence changed: '+str(dest)
   else:shutil.copy2(source,dest)
   relative=str(dest.relative_to(ac.LIB));role=roles.get(name,'blender-source' if source.suffix=='.blend' else 'blender-close' if source.suffix=='.png' else 'specification')
   if not any(e['path']==relative for e in revision['evidence']):revision['evidence'].append(dict(role=role,path=relative,sha256=digest(dest),bytes=dest.stat().st_size,notes='Exact appearance '+c['tag']+'; shared canonical design. References: '+', '.join(refs),capture_context=json.dumps(capture) if role.startswith('runtime') else None,recorded_at=ac.now()))
  if mode.startswith('finishes'):
   source=ROOT/'scripts/art_library/build_cargo_finishes.py';dest=target/'recipe.py'
   if not dest.exists():shutil.copy2(source,dest);revision['evidence'].append(dict(role='recipe',path=str(dest.relative_to(ac.LIB)),sha256=digest(dest),bytes=dest.stat().st_size,notes='Native Blender appearance recipe; exact base source hash in validation.',capture_context=None,recorded_at=ac.now()))
  assert set(refs)<=set(ledger['reference_ids']),'Map canonical memberships first'
  revision['covered_reference_ids']=list(dict.fromkeys(revision['covered_reference_ids']+refs));ledger['state']='in-progress';revision['stage']='in-progress';revision['review']=None;ac.write(ac.design_path(c['design_id']),ledger)
 print('REGISTERED',c['tag'],flush=True)
with ac.locked():ac.refresh()
