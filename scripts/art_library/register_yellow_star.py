"""Preserve S39's exact crop and native revision evidence. No publication/sign-off."""
from pathlib import Path
import json,uuid,hashlib
from PIL import Image
root=Path(__file__).resolve().parents[2];base=root/'assets/art-library';rid='stars--yellow-main-sequence';did='star.yellow-main-sequence'
ref=base/'assets'/rid;crop=ref/'revisions/r000';crop.mkdir(parents=True,exist_ok=True)
source=root/'reference/art/stars.png';im=Image.open(source);box=[35,64,462,364]
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
if not (crop/'reference.png').exists():im.crop(box).save(crop/'reference.png')
def write(p,d):p.write_text(json.dumps(d,indent=2)+'\n')
if not (ref/'reference.json').exists():write(ref/'reference.json',dict(id=rid,name='Yellow main sequence star',source='stars.png',box=box,category='environment',observation='S39 upper-left 01. Exact original pixels.',kind='object',family='yellow-main-sequence',schema='sidereal.art-library.v1',reference_uuid=str(uuid.uuid5(uuid.NAMESPACE_URL,'sidereal/reference/'+rid)),source_sha256=sha(source),source_dimensions_px=list(im.size),crop_revision=0,crop_sha256=sha(crop/'reference.png'),crop_path=f'assets/{rid}/revisions/r000/reference.png',style='studless-native',design_id=did,proposal={'radius_m':72,'status':'owner-directed presentation scale'}))
(ref/'BRIEF.md').write_text('# Yellow main sequence star\n\nGolden native stepped photosphere, asymmetric dark sunspot complexes, hot rim and short active corona. Radius72m at owner direction, below the playable plane. Preserve original Blender surfaces and PBR.\n')
p=base/'designs'/did
notes=['Render failed: unavailable denoiser. Source/export retained.','Rejected: pale tiled shell, rectangular pits, weak corona.','Rejected: tiled grid remains dominant despite brighter emission.','Astra: finer relief and stronger corona required.','Astra: relief close; remove face-like spot layout and improve corona.','Shared flare geometry/material export; continued visual review.','Astra: body/pits close, no further sculpt needed; runtime corona and playback pending.']
revisions=[]
for i,note in enumerate(notes,1):
 r=p/'revisions'/f'r{i:03}';e=[]
 for name,role in [('blender-source.blend','blender-source'),('star.glb','glb'),('blender-close.png','blender-close'),('validation.json','validation')]:
  f=r/name
  if f.exists():e.append(dict(role=role,path=str(f.relative_to(base)),sha256=sha(f)))
 revisions.append(dict(revision=i,created_at='2026-09-15',stage='review',change=note,hypothesis=note,covered_reference_ids=[rid],evidence=e,review=note))
write(p/'design.json',dict(schema='sidereal.art-library.v1',id=did,asset_uuid=str(uuid.uuid5(uuid.NAMESPACE_URL,'sidereal/design/'+did)),reference_ids=[rid],mapping_status='Explicit S39 yellow main sequence only',current_revision=7,state='in-progress',owner_final_signoff=None,priority=1,profile='star',assigned_to='root/yellow-star-solar-system',blocker=None,feedback=[{'source':'Astra independent reviewer','date':'2026-09-15','text':notes[-1]}],approvals=[],revisions=revisions))
