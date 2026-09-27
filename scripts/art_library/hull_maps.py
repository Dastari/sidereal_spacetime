"""Deterministic editable decal and PBR damage maps for the Blender hull study."""
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont,ImageFilter
import random,math,json,sys
out=Path(sys.argv[1]) if len(sys.argv)>1 else Path('.runtime/art-library/hull/r001/maps');out.mkdir(parents=True,exist_ok=True)
fontpath='/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
for state in ['clean','worn','damaged']:
 size=512;rng=random.Random(53);height=Image.new('L',(size,size),128);hd=ImageDraw.Draw(height)
 base=Image.new('RGB',(size,size),(174,183,201));b=ImageDraw.Draw(base)
 b.rounded_rectangle((12,12,499,499),radius=9,outline=(91,105,126),width=5)
 b.line((28,415,484,415),fill=(110,122,143),width=3)
 for x in [25,486]:
  for y in [25,486]:b.ellipse((x-4,y-4,x+4,y+4),fill=(57,69,88))
 if state!='clean':
  for i in range(100 if state=='worn' else 170):
   x=rng.randrange(20,490);y=rng.choice([rng.randrange(18,60),rng.randrange(445,493),rng.randrange(45,465)])
   end=(min(499,x+rng.randrange(3,24)),min(498,y+rng.randrange(-3,4)))
   b.line((x,y,*end),fill=(89,101,116),width=1);hd.line((x,y,*end),fill=110,width=2)
 if state=='damaged':
  for cx,cy,r in [(355,190,52),(152,335,27)]:
   for rr in range(r,0,-1):
    value=int(128-60*(1-rr/r)**2);hd.ellipse((cx-rr,cy-rr,cx+rr,cy+rr),fill=value)
    c=int(48+80*rr/r);b.ellipse((cx-rr,cy-rr,cx+rr,cy+rr),fill=(c,c+3,c+8))
   for i in range(14):
    a=rng.random()*math.tau;length=rng.randrange(r,r+30);b.line((cx,cy,cx+math.cos(a)*length,cy+math.sin(a)*length),fill=(81,88,101),width=2)
 rough=Image.new('L',(size,size),130 if state=='clean' else 164 if state=='worn' else 193)
 normal=Image.new('RGB',(size,size));hp=height.load();np=normal.load()
 for y in range(size):
  for x in range(size):
   dx=(hp[min(x+1,511),y]-hp[max(x-1,0),y])*.13;dy=(hp[x,min(y+1,511)]-hp[x,max(y-1,0)])*.13
   z=1;mag=math.sqrt(dx*dx+dy*dy+1);np[x,y]=tuple(round((v/mag*.5+.5)*255) for v in [-dx,dy,z])
 base.save(out/f'{state}-base.png');rough.save(out/f'{state}-roughness.png');normal.save(out/f'{state}-normal.png');height.save(out/f'{state}-height.png')
 decal=Image.new('RGBA',(size,size));d=ImageDraw.Draw(decal);font=ImageFont.truetype(fontpath,57)
 d.text((38,225),'WAYFARER',font=font,fill=(27,38,59,255));d.text((37,302),'WF-01 / PILOT SECTION',font=ImageFont.truetype(fontpath,21),fill=(36,51,69,255))
 d.rectangle((34,359,180,380),fill=(182,58,57,255))
 decal.save(out/'nameplate-decal.png');Image.alpha_composite(base.convert('RGBA'),decal).convert('RGB').save(out/f'{state}-marked-base.png')
(out/'layers.json').write_text(json.dumps({'resolution':[512,512],'decal':'nameplate-decal.png','states':['clean','worn','damaged'],'normal_convention':'OpenGL tangent-space +Y','authority':'Visual material studies only; no damage reducer or collision change','layers':'Separate editable base, decal RGBA, height, normal and roughness maps; marked base is a reproducible composition'},indent=2))
