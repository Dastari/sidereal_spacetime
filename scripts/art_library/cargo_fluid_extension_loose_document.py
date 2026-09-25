"""Validate final loose-container GLBs and real cutouts; preserve exact handoff hashes."""
from pathlib import Path
import json,hashlib
from PIL import Image
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'.runtime/art-library/cargo/loose-extension/r001'
helper=Path(__file__).with_name('cargo_fluid_extension_document.py');scope={'__file__':str(helper)}
exec(compile(helper.read_text().split('jobs=json.loads((OUT/')[0],str(helper),'exec'),scope)
validate=scope['validate'];sha=scope['sha'];rows=[]
for job in json.loads((OUT/'jobs.json').read_text())+json.loads((OUT/'variant-jobs.json').read_text()):
    out=Path(job['output']);validation=json.loads((out/'validation-blender.json').read_text());validation['native_glb_validation']=validate(out/'glb.glb')
    with Image.open(out/'cutout.png') as im:
        assert im.mode=='RGBA';alpha=im.getchannel('A').getextrema();assert alpha[0]==0 and alpha[1]>0
    validation['alpha']={'mode':'RGBA','extrema':list(alpha),'verified_transparent_background':True}
    (out/'validation.json').write_text(json.dumps(validation,indent=2)+'\n')
    rows.append({'id':job.get('id',job['design_id']),'output':str(out),'glb_sha256':sha(out/'glb.glb'),'source_sha256':sha(out/'blender-source.blend'),'close_sha256':sha(out/'blender-close.png'),'dimensions_m':validation['actual_dimensions_m'],'capacity_L':validation['capacity_litres']})
(OUT/'stable-hashes.json').write_text(json.dumps({'primary_count':2,'variant_count':1,'artifacts':rows,'publication':False},indent=2)+'\n')
print(json.dumps(rows,indent=2))
