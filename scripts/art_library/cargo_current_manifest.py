"""Resolve exact current cargo revisions and create a complete review overview."""
from pathlib import Path
import json,hashlib
from PIL import Image,ImageDraw,ImageFont
R=Path(__file__).resolve().parents[2];B=R/'.runtime/art-library/cargo';out=B/'current';out.mkdir(exist_ok=True)
base=json.loads((B/'r003/current-main-jobs.json').read_text());finishes={j['slug']:j for j in json.loads((B/'r002/finishes/jobs.json').read_text())};finishes.update({j['slug']:j for j in json.loads((B/'r003/finishes/jobs.json').read_text())})
for ext in ['fluid-extension','loose-extension']:
 folder=B/ext/'r001'
 if not (folder/'jobs.json').exists():continue
 base+=json.loads((folder/'jobs.json').read_text())
 if (folder/'variant-jobs.json').exists():
  for j in json.loads((folder/'variant-jobs.json').read_text()):finishes[j.get('slug',j.get('id'))]=j
allrows=base+list(finishes.values());manifest=[]
for j in allrows:
 d=Path(j['output']);s=json.loads((d/'specification.json').read_text());manifest.append({'design_id':j['design_id'],'revision':s['revision'],'appearance':j.get('slug',j.get('id')),'reference_ids':s['reference_ids'],'output':str(d),'source_sha256':hashlib.sha256((d/'blender-source.blend').read_bytes()).hexdigest(),'glb_sha256':hashlib.sha256((d/'glb.glb').read_bytes()).hexdigest()})
(out/'manifest.json').write_text(json.dumps({'canonical_designs':len(base),'additional_appearances':len(finishes),'entries':manifest,'canonical_reference_membership':{j['design_id']:json.loads((R/'assets/art-library/designs'/j['design_id']/'design.json').read_text())['reference_ids'] for j in base}},indent=2));(out/'base-jobs.json').write_text(json.dumps(base,indent=2))
font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',16);small=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',13)
for name,rows in [('collection-board',base),('appearance-board',list(finishes.values()))]:
 board=Image.new('RGB',(1800,((len(rows)+4)//5)*340+65),(19,27,40));draw=ImageDraw.Draw(board);draw.text((20,17),'CARGO / native Blender collection / proposed, unsigned, unpublished',font=font,fill='white')
 for i,j in enumerate(rows):
  d=Path(j['output']);s=json.loads((d/'specification.json').read_text());im=Image.open(d/'cutout.png');im.thumbnail((350,265));x=i%5*360;y=i//5*340+65;board.paste(im,(x+(360-im.width)//2,y),im);label=j.get('slug',j.get('id'));label=label.replace('cargo.fluid-','').replace('.medium.appearance-',' / v');draw.text((x+8,y+270),label+f" r{s['revision']:03}",font=font,fill='white');draw.text((x+8,y+295),' × '.join(f'{v:.2f}' for v in s['dimensions_m'])+' m / '+str(s['usable_capacity']['value'])+' L',font=small,fill='#aab9c9')
 board.save(out/(name+'.png'))
print(len(base),'canonical designs;',len(finishes),'additional appearances')
