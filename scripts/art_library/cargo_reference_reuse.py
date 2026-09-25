"""Record repeated source appearances with unchanged canonical geometry and evidence."""
from pathlib import Path
import sys,json,hashlib
from PIL import Image,ImageDraw,ImageFont
R=Path(__file__).resolve().parents[2];sys.path.insert(0,str(R/'scripts'));import art_catalog as ac
plans=[('cargo.standard.medium','storage-pale-loose-crate'),('cargo.standard.large','storage-orange-loose-crate'),('cargo.standard.large','storage-large-gold-loose-crate')];font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',17)
with ac.locked():
 for design,suffix in plans:
  key='modular-spaceship-design-2--'+suffix;ledger=ac.read(ac.design_path(design));revision=ledger['revisions'][-1];folder=ac.design_path(design).parent/'revisions'/f"r{revision['revision']:03}";dest=folder/('reference-reuse-'+suffix+'.png');meta=ac.read(ac.LIB/'assets'/key/'reference.json')
  if not dest.exists():
   board=Image.new('RGB',(1300,620),(19,27,40));draw=ImageDraw.Draw(board);im=Image.open(ac.LIB/meta['crop_path']).convert('RGBA');im=im.resize((im.width*3,im.height*3),Image.Resampling.NEAREST);im.thumbnail((420,450));board.paste(im,(30,75),im);im=Image.open(folder/'cutout.png');im.thumbnail((740,510));board.paste(im,(530,55),im);draw.text((25,20),'Preserved repeated source: '+suffix,font=font,fill='white');draw.text((610,20),design+f" r{revision['revision']:03}",font=font,fill='white');draw.text((25,580),'Shared canonical geometry and base finish; existing source/GLB/runtime evidence applies.',font=font,fill='#e6b36a');board.save(dest)
   revision['evidence'].append(dict(role='comparison',path=str(dest.relative_to(ac.LIB)),sha256=hashlib.sha256(dest.read_bytes()).hexdigest(),bytes=dest.stat().st_size,notes='Explicit repeated appearance: '+key+'; same canonical base geometry/finish, no added variant.',capture_context=None,recorded_at=ac.now()))
  revision['covered_reference_ids']=list(dict.fromkeys(revision['covered_reference_ids']+[key]));ac.write(ac.design_path(design),ledger)
 ac.refresh()
