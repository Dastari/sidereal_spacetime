"""Publish the owner's exact R004 roof, preserving all other current ship content."""
from pathlib import Path
from collections import defaultdict
from copy import deepcopy
import hashlib,json,shutil
ROOT=Path(__file__).resolve().parents[1]
R=ROOT/'assets/runtime/assembly'; S=ROOT/'.runtime/art-library/roof/r004'
QUOTE='That looks good, make this the "live" roof of the current in game ship please.'
def read(p):return json.loads(p.read_text())
def write(p,v):p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(v,indent=2)+'\n')
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def main():
    cat=read(R/'catalog.json');doc=read(R/'wayfarer.json');vol=read(R/'catalog.voxels.json');h=read(R/'hull-manifest.json')
    if h.get('roof_publication',{}).get('revision')==4:
        print('R004 already installed');return
    approved=read(ROOT/'assets/art-library/designs/shipyard.roof.frontier/design.json')
    assert approved['owner_final_signoff'] and approved['current_revision']==4,'Exact revision requires owner signoff'
    assert sha(S/'kit.glb')=='8f2af39abadfff8a944e59840ccfa8190959778b1b914adfc0293005363c546f'
    sourcecat=read(S/'ship-catalog.json');sourcedoc=read(S/'ship-wayfarer.json');sourcevol=read(S/'ship-catalog.voxels.json')
    assets={a['id']:deepcopy(a)for a in sourcecat['assets']if a.get('visual',{}).get('designId')=='shipyard.roof.frontier'}
    parts=[p for p in sourcedoc['parts']if p['assetId']in assets];current={p['id']:p for p in doc['parts']}
    assert len(parts)==73
    for p in parts:
        assert {k:v for k,v in current[p['id']].items()if k!='decals'}=={k:v for k,v in p.items()if k!='decals'},p['id']
        assert not current[p['id']].get('decals') or current[p['id']]['decals']==p.get('decals'), 'Preserve custom paint'
    archive=ROOT/'assets/source/archive/pre-roof-r004-2026-09-09'
    assert not archive.exists(),'Archive exists; inspect before retry'
    archive.mkdir(parents=True)
    for name in ['catalog.json','catalog.voxels.json','wayfarer.json','hull-manifest.json']:shutil.copy2(R/name,archive/name)
    shutil.copy2(ROOT/'assets/runtime/voxels/wayfarer.glb',archive/'legacy-wayfarer.glb')
    dest=R/'roof/r004';dest.mkdir(parents=True,exist_ok=True);shutil.copy2(S/'kit.glb',dest/'kit.glb')
    editable=ROOT/'assets/source/published-roof/r004';editable.mkdir(parents=True,exist_ok=True)
    for name in ['roof-kit.blend','components.json','specification.json','AUTHORING_NOTES.md']:shutil.copy2(S/name,editable/name)
    grouped=defaultdict(list)
    for p in parts:grouped[p['assetId']].append(p)
    for a in assets.values():
        slug=a['thumbnail'].split('/')[-2];(dest/slug).mkdir(exist_ok=True);shutil.copy2(S/slug/'cutout.png',dest/slug/'cutout.png')
        a['visual']['url']='/assets/assembly/roof/r004/kit.glb';a['thumbnail']=f'/assets/assembly/roof/r004/{slug}/cutout.png';a['label']=a['label'].replace(' / draft r004','')
    before=deepcopy(doc)
    replacements={p['id']:p for p in parts};doc['parts']=[replacements.get(p['id'],p)for p in doc['parts']]
    cat['assets']=[assets.get(a['id'],a)for a in cat['assets']]
    assert set(assets)<=set(a['id']for a in cat['assets'])
    vol['volumes'].update({id:sourcevol['volumes'][id]for id in assets})
    h.setdefault('previous_defaults',[]).append(before)
    h['entries']=[e for e in h['entries']if e['asset']['id']not in assets]+[{'asset':a,'placements':grouped[id],'volume':vol['volumes'][id]}for id,a in assets.items()]
    h['retired_visual_layers']=sorted(set(h.get('retired_visual_layers',[]))|{'roof','markings'})
    receipt={'design_id':'shipyard.roof.frontier','revision':4,'owner_quote':QUOTE,'kit_sha256':sha(dest/'kit.glb'),'editable_source':str((editable/'roof-kit.blend').relative_to(ROOT)),'source_sha256':sha(editable/'roof-kit.blend'),'placed_parts':73,'canonical_components':26,'triangles':34200,'decals':sum(len(p.get('decals',[]))for p in parts),'preserved_non_roof_parts':len(doc['parts'])-73,'archive':str(archive.relative_to(ROOT))}
    h['roof_publication']=receipt
    for p in before['parts']:
        if p['id']not in replacements:assert p==next(x for x in doc['parts']if x['id']==p['id'])
    for name,value in [('catalog.json',cat),('catalog.voxels.json',vol),('wayfarer.json',doc),('hull-manifest.json',h)]:write(R/name,value)
    write(ROOT/'docs/releases/roof-r004/publication.json',receipt)
    print(json.dumps(receipt,indent=2))
if __name__=='__main__':main()
