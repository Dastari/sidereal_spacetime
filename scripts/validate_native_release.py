"""Exact native artifacts and identity audit for the combined local candidate."""
from pathlib import Path
import hashlib,json,struct,math

ROOT=Path(__file__).resolve().parents[1];R=ROOT/'assets/runtime/assembly';L=ROOT/'assets/art-library'
def read(p):return json.loads(Path(p).read_text())
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def glb(p):
    raw=Path(p).read_bytes();assert raw[:4]==b'glTF';return json.loads(raw[20:20+struct.unpack_from('<I',raw,12)[0]])
def validate():
    catalog={a['id']:a for a in read(R/'catalog.json')['assets']};draft=read(R/'wayfarer.json')
    placements={p['id']:p for p in draft['parts']};assert len(placements)==len(draft['parts'])
    old=read(ROOT/'assets/source/archive/pre-native-ship-2026-09-08/wayfarer.json')
    h=read(R/'hull-manifest.json');f=read(R/'floor-manifest.json');c=read(R/'cargo-manifest.json')
    assert h['revision']==6 and f['revision']==2 and len(c['entries'])==73
    assert len({e['asset']['visual']['designId']for e in c['entries']})==26
    assert 'pilot-r004-airlock-frame-22' in placements
    assert not set(['pilot-r004-vestibule-wall-19','pilot-r004-vestibule-wall-20','pilot-r004-airlock-frame-21'])&placements.keys()
    assert len([k for k in placements if k.startswith('pilot-r005-')])==7
    assert not any(k.startswith('pilot-review-')for k in placements)
    edited={p['id']for p in h['retired_placements']}|{p['id']for e in h['entries']+f['entries']+c['entries']for p in e['placements']}|{'equipment-control-seat'}
    for p in old['parts']:
        if p['id']not in edited:assert placements.get(p['id'])==p, 'Unrelated placement changed: '+p['id']
    assert placements['equipment-control-seat']['position']==[0,10.25,.1875]
    assert h['fixture_authority_migration']['pilot_layout_revision']==2
    native_files={};total_bytes=0
    for kind,manifest in [('hull',h),('floor',f),('cargo',c)]:
        for entry in manifest['entries']:
            a=entry['asset'];assert catalog[a['id']]==a
            p=ROOT/'assets/runtime'/a['visual']['url'].removeprefix('/assets/')
            assert sha(p)==a['visual']['sha256'],a['id']
            if 'approved_visual'in entry:
                original=ROOT/'assets/runtime'/entry['approved_visual']['url'].removeprefix('/assets/')
                assert sha(original)==entry['approved_visual']['sha256']
                assert sha(ROOT/entry['finish_review']['source'])==entry['finish_review']['source_sha256']
            thumb=ROOT/'assets/runtime'/a['thumbnail'].removeprefix('/assets/');assert thumb.is_file()
            for placed in entry['placements']:assert placements[placed['id']]==placed
            if str(p) not in native_files:
                g=glb(p);assert all('uri'not in image for image in g.get('images',[])),str(p)
                native_files[str(p.relative_to(ROOT))]={'sha256':sha(p),'bytes':p.stat().st_size,
                    'triangles':sum(g['accessors'][pr['indices']]['count']//3 for mesh in g.get('meshes',[])for pr in mesh['primitives'])}
                total_bytes+=p.stat().st_size
            if kind=='cargo':
                assert sha(ROOT/entry['source'])==entry['source_sha256']
                assert sha(thumb)==entry['thumbnail_sha256']
                assert entry['inventory_kind']==('liquid'if a['visual']['designId'].startswith('cargo.fluid')else'grid')
    for pid,m in c['placement_mapping'].items():
        assert m['after']['id']==m['before']['id']==pid
        if c.get('storage_layout',{}).get('revision')==2:
            assert m['after']['position']==[-4.0625 if pid.endswith('-0.25') else -3.3125,
                2.0625 if '-2.15-' in pid else 3.4375,.1875]
            assert m['after']['rotation']==math.pi/2
            assert m['pre_floor_layout']['id']==pid
        else:assert m['after']['position']==m['before']['position']
        assert placements[pid]==m['after']
    kit=glb(ROOT/'assets/runtime'/f['entries'][0]['asset']['visual']['url'].removeprefix('/assets/'))
    assert len(kit['images'])==3 and any('normalTexture'in m and 'occlusionTexture'in m for m in kit['materials'])
    assert all('TANGENT'in pr['attributes']for m in kit['meshes']for pr in m['primitives'])
    result={'status':'passed','scope':'Native artifact hashes, material channels and placement identity; actual browser/authority checks recorded separately',
        'hull_revision':6,'floor_candidate_revision':2,'cargo_assets':73,'native_asset_bytes':total_bytes,'artifacts':native_files}
    out=ROOT/'docs/releases/native-ship-2026-09-08/asset-validation.json';out.write_text(json.dumps(result,indent=2)+'\n')
    print(json.dumps({k:v for k,v in result.items()if k!='artifacts'}))
if __name__=='__main__':validate()
