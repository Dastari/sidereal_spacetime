from pathlib import Path
import json,sys
from PIL import Image,ImageDraw,ImageFont
ROOT=Path(__file__).resolve().parents[2];REV=sys.argv[1] if len(sys.argv)>1 else 'r001';OUT=ROOT/'.runtime/art-library/cargo'/REV;jobs=json.loads((OUT/'jobs.json').read_text())
font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',17);small=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',13)
board=Image.new('RGB',(1600,((len(jobs)+3)//4)*360),(19,27,40));draw=ImageDraw.Draw(board)
for i,j in enumerate(jobs):
 d=Path(j['output']);p=d/'cutout.png'
 if not p.exists():continue
 im=Image.open(p);im.thumbnail((390,300));x=i%4*400;y=i//4*360;board.paste(im,(x+(400-im.width)//2,y),im)
 draw.text((x+15,y+301),j['slug']+' / '+REV,font=font,fill='white');s=j['specification'];draw.text((x+15,y+326),' x '.join(str(v) for v in s['dimensions_m'])+' m | '+str(s['usable_capacity']['value'])+' L proposed',font=small,fill='#aab9c9')
 ref=json.loads((ROOT/'assets/art-library/assets'/s['reference_ids'][0]/'reference.json').read_text());source=Image.open(ROOT/'assets/art-library'/ref['crop_path']).convert('RGBA')
 comp=Image.new('RGB',(1400,650),(19,27,40));dr=ImageDraw.Draw(comp)
 # Source pixels preserved in their canonical file; enlarged only on this labeled comparison.
 source=source.resize((source.width*3,source.height*3),Image.Resampling.NEAREST);source.thumbnail((450,520));comp.paste(source,((460-source.width)//2,80),source)
 render=Image.open(p);render.thumbnail((650,560));comp.paste(render,(530,55),render)
 dr.text((25,20),'BEFORE: exact source crop (display enlarged)',font=font,fill='white');dr.text((600,20),'AFTER: native Blender / '+j['slug']+' '+REV,font=font,fill='white');dr.text((25,605),'Scale, hidden geometry and stats are proposals. No owner sign-off or publication.',font=font,fill='#e6b36a')
 if REV!='r001':
  previous=OUT.parent/'r001'/j['slug']/'cutout.png'
  if previous.exists():
   three=Image.new('RGB',(1800,650),(19,27,40));td=ImageDraw.Draw(three)
   three.paste(comp.crop((0,0,490,650)),(0,0));oldim=Image.open(previous);oldim.thumbnail((590,530));three.paste(oldim,(500,65),oldim);now=Image.open(p);now.thumbnail((590,530));three.paste(now,(1110,65),now)
   td.text((530,20),'REJECTED r001',font=font,fill='#e6b36a');td.text((1140,20),'CURRENT '+REV+' / '+j['slug'],font=font,fill='white');comp=three
 dr=ImageDraw.Draw(comp);dr.rectangle((0,590,comp.width,650),fill=(19,27,40));dr.text((25,607),'Scale, hidden geometry and stats are proposals. No owner sign-off or publication.',font=font,fill='#e6b36a')
 if not (d/'comparison.png').exists():comp.save(d/'comparison.png')
board.save(OUT/'collection-board.png')
