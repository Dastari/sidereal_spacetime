"""Arrange retained real screenshots; no generated art or painted corrections."""
from PIL import Image,ImageDraw
from pathlib import Path
root=Path(__file__).resolve().parents[2];out=root/'assets/art-library/designs/crew.animation.aim/revisions/r002'
sets={'runtime-profiles':[(n,root/f'output/playwright/pose-final-{n}.png') for n in ['carbine','long-rifle','heavy-handgun','compact-pistol','flashlight','sample-scanner','plasma-cutter']], 'runtime-looks':[(n,root/f'output/playwright/pose-look-{n}.png') for n in ['captain','engineer','medic','pilot','security','marine','salvage','recon','scientist','mechanic']], 'runtime-playback-frames':[(n,root/f'output/playwright/pose-final-{n}.png') for n in ['raise','turn-right','turn-left','forward','backward','strafe','sprint','seated','debug']]}
for name,entries in sets.items():
 cols=4 if name=='runtime-profiles' else 5 if name=='runtime-looks' else 3
 image=Image.new('RGB',(cols*300,((len(entries)+cols-1)//cols)*315),(16,23,32));draw=ImageDraw.Draw(image)
 for i,(label,path) in enumerate(entries):
  assert path.exists(),path
  im=Image.open(path).convert('RGB');im.thumbnail((300,285));x=i%cols*300;y=i//cols*315;image.paste(im,(x+(300-im.width)//2,y+25));draw.text((x+10,y+7),label+(' (fit failed; retained)' if label=='heavy-handgun' else ''),fill=(240,245,255))
 image.save(out/(name+'.png'))
entries=[('Exact aim reference',root/'assets/art-library/assets/character-animations-2--aim-key-pose-1/revisions/r000/reference.png'),('Legacy torso penetration',root/'output/playwright/pose-r001-baseline.png'),('r002 carbine candidate',root/'output/playwright/pose-final-carbine.png')]
image=Image.new('RGB',(1200,430),(16,23,32));draw=ImageDraw.Draw(image)
for i,(label,path) in enumerate(entries):
 im=Image.open(path).convert('RGB');im.thumbnail((400,390));
 if i==0:im=im.resize((im.width*3,im.height*3),Image.Resampling.NEAREST)
 image.paste(im,(i*400+(400-im.width)//2,35));draw.text((i*400+10,10),label,fill='white')
image.save(out/'reference-before-after.png')
