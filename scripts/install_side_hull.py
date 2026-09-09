"""Publish the owner's exact R003 side-hull, preserving all other current ship content."""
from pathlib import Path
from collections import defaultdict
from copy import deepcopy
import hashlib,json,shutil
ROOT=Path(__file__).resolve().parents[1]
R=ROOT/'assets/runtime/assembly'; S=ROOT/'.runtime/art-library/side-hull/r003'
QUOTE='Great make them live please.'
def read(p):return json.loads(p.read_text())
def write(p,v):p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(v,indent=2)+'\n')
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def main():
    cat=read(R/'catalog.json');doc=read(R/'wayfarer.json');vol=read(R/'catalog.voxels.json');h=read(R/'hull-manifest.json')
    if h.get('side_armor_publication',{}).get('revision')==3:
        print('R003 already installed');return
    approved=read(ROOT/'assets/art-library/designs/shipyard.hull.side-armor/design.json')
    assert approved['owner_final_signoff'] and approved['current_revision']==3,'Exact revision requires owner signoff'
    assert sha(S/'kit.glb')=='eeef5b0cd37893c28b88fd54111b9cb58f086fba23b56a62fb6d7d44052c5ff7'
    sourcecat=read(S/'ship-catalog.json');sourcedoc=read(S/'ship-wayfarer.json');sourcevol=read(S/'ship-catalog.voxels.json')
    assets={a['id']:deepcopy(a)for a in sourcecat['assets']if a.get('visual',{}).get('designId')=='shipyard.hull.side-armor'}
    parts=[p for p in sourcedoc['parts']if p['assetId']in assets];current={p['id']:p for p in doc['parts']}
    assert len(parts)==18
    for p in parts:
        assert {k:v for k,v in current[p['id']].items()if k!='decals'}=={k:v for k,v in p.items()if k!='decals'},p['id']
        assert not current[p['id']].get('decals') or current[p['id']]['decals']==p.get('decals'), 'Preserve custom paint'
    archive=ROOT/'assets/source/archive/pre-side-hull-r003-2026-09-09'
    assert not archive.exists(),'Archive exists; inspect before retry'
    archive.mkdir(parents=True)
    for name in ['catalog.json','catalog.voxels.json','wayfarer.json','hull-manifest.json']:shutil.copy2(R/name,archive/name)
    shutil.copy2(ROOT/'assets/runtime/voxels/wayfarer.glb',archive/'legacy-wayfarer.glb')
    shutil.copy2(R/'parts.glb',archive/'parts.glb')
    dest=R/'side-hull/r003';dest.mkdir(parents=True,exist_ok=True);shutil.copy2(S/'kit.glb',dest/'kit.glb')
    editable=ROOT/'assets/source/published-side-hull/r003';editable.mkdir(parents=True,exist_ok=True)
    for name in ['side-hull-kit.blend','components.json','specification.json','generator.py']:shutil.copy2(S/name,editable/name)
    grouped=defaultdict(list)
    for p in parts:grouped[p['assetId']].append(p)
    for a in assets.values():
        slug=a['thumbnail'].split('/')[-2];(dest/slug).mkdir(exist_ok=True);shutil.copy2(S/slug/'cutout.png',dest/slug/'cutout.png')
        a['visual']['url']='/assets/assembly/side-hull/r003/kit.glb';a['thumbnail']=f'/assets/assembly/side-hull/r003/{slug}/cutout.png';a['label']=a['label'].replace(' / draft r003','')
    before=deepcopy(doc)
    replacements={p['id']:p for p in parts};doc['parts']=[replacements.get(p['id'],p)for p in doc['parts']]
    cat['assets']=[assets.get(a['id'],a)for a in cat['assets']]
    assert set(assets)<=set(a['id']for a in cat['assets'])
    vol['volumes'].update({id:sourcevol['volumes'][id]for id in assets})
    h.setdefault('previous_defaults',[]).append(before)
    h['entries']=[e for e in h['entries']if e['asset']['id']not in assets]+[{'asset':a,'placements':grouped[id],'volume':vol['volumes'][id]}for id,a in assets.items()]
    h.setdefault('retired_visual_regions',[]).extend([{'layer':'armor','min':[5,-9,-100],'max':[20,9,100]},{'layer':'armor','min':[-20,-9,-100],'max':[-5,9,100]}])
    receipt={'design_id':'shipyard.hull.side-armor','revision':3,'owner_quote':QUOTE,'kit_sha256':sha(dest/'kit.glb'),'editable_source':str((editable/'side-hull-kit.blend').relative_to(ROOT)),'source_sha256':sha(editable/'side-hull-kit.blend'),'placed_parts':18,'canonical_components':7,'triangles':33648,'decals':sum(len(p.get('decals',[]))for p in parts),'preserved_non_side-hull_parts':len(doc['parts'])-18,'archive':str(archive.relative_to(ROOT))}
    h['side_armor_publication']=receipt
    for p in before['parts']:
        if p['id']not in replacements:assert p==next(x for x in doc['parts']if x['id']==p['id'])
    for name,value in [('catalog.json',cat),('catalog.voxels.json',vol),('wayfarer.json',doc),('hull-manifest.json',h)]:write(R/name,value)
    write(ROOT/'docs/releases/side-hull-r003/publication.json',receipt)
    print(json.dumps(receipt,indent=2))
if __name__=='__main__':main()
