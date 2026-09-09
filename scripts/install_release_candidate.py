"""Pinned native asset integration; merges identities, never installs a review snapshot."""
from pathlib import Path
import argparse, copy, hashlib, json, math, shutil, zipfile

ROOT = Path(__file__).resolve().parents[1]
RUNTIME = ROOT / 'assets/runtime/assembly'
LIB = ROOT / 'assets/art-library'
RELEASE = ROOT / 'docs/releases/native-ship-2026-09-08'

def read(p): return json.loads(Path(p).read_text())
def digest(p): return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def write(p, d):
    p = Path(p); p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(d, indent=2) + '\n')
def archive():
    target = ROOT / 'assets/source/archive/pre-native-ship-2026-09-08'
    target.mkdir(parents=True, exist_ok=True)
    for name in ['catalog.json', 'catalog.voxels.json', 'wayfarer.json', 'hull-manifest.json', 'equipment-manifest.json']:
        if not (target/name).exists(): shutil.copy2(RUNTIME/name, target/name)
    return target
def upsert(rows, value, key='id'):
    index = next((i for i, row in enumerate(rows) if row[key] == value[key]), None)
    if index is None: rows.append(value)
    else: rows[index] = value

def bounds_proxy(bounds):
    """Conservative fitting envelope only; never an authoritative collision export."""
    pitch=.0625;lo=[math.floor(v/pitch) for v in bounds['min']];hi=[math.ceil(v/pitch)for v in bounds['max']];chunks={}
    for z in range(lo[2],hi[2]):
        for y in range(lo[1],hi[1]):
            for x in range(lo[0],hi[0]):
                key=(x//32,y//32,z//32);cells=chunks.setdefault(key,bytearray(32768));cells[x%32+y%32*32+z%32*1024]=1
    def runs(cells):
        out=[];last=cells[0];count=0
        for v in cells:
            if v!=last:out.extend([last,count]);last=v;count=0
            count+=1
        out.extend([last,count]);return out
    return {'cellMeters':pitch,'layers':[{'layer':'draft-bounds-envelope','chunks':[{'origin':[n*32 for n in k],'runs':runs(v)}for k,v in chunks.items()]}]}

def install_hull():
    archive()
    source = LIB / 'designs/shipyard.hull.pilot-section/revisions/r006'
    old = read(RUNTIME/'hull-manifest.json')
    current = read(RUNTIME/'wayfarer.json')
    catalog = read(RUNTIME/'catalog.json')
    volumes = read(RUNTIME/'catalog.voxels.json')
    # The reviewed context supplies only scoped hull placements/removals.
    reference = read(ROOT/'.runtime/art-library/hull/r006/context/wayfarer-final.json')
    additions = [p for p in reference['parts'] if p['id'].startswith(('pilot-r004-', 'pilot-r005-', 'pilot-context-'))]
    retirement_ids = {p['id'] for p in old['retired_placements']}
    retirement_ids.update(p['id'] for e in old['entries'] for p in e['placements'] if p['id'].startswith('pilot-review-'))
    retirement_ids.update(['floor-0-4','roof--1-4','roof-0-4','roof-1-4',
                           'pilot-r004-vestibule-wall-19','pilot-r004-vestibule-wall-20','pilot-r004-airlock-frame-21'])
    prior = {p['id']:p for p in current['parts']}
    entries = []
    with zipfile.ZipFile(source/'recipe.zip') as z:
        reviewed_assets = {a['id']:a for a in json.loads(z.read('catalog.json'))['assets']}
        proxy = json.loads(z.read('catalog.voxels.json'))['volumes']
        components = {c['id']:c for c in json.loads(z.read('components.json'))}
        for asset_id in sorted({p['assetId'] for p in additions}):
            asset = copy.deepcopy(reviewed_assets[asset_id])
            if asset_id in components:
                target = RUNTIME/'hull/r006'/asset_id; target.mkdir(parents=True, exist_ok=True)
                slug = components[asset_id]['slug']
                for name in ['clean.glb','worn.glb','damaged.glb','cutout.png']:
                    (target/name).write_bytes(z.read(slug+'/'+name))
                assert digest(target/'clean.glb') == asset['visual']['sha256'], asset_id
                asset['visual']['url'] = f'/assets/assembly/hull/r006/{asset_id}/clean.glb'
                asset['thumbnail'] = f'/assets/assembly/hull/r006/{asset_id}/cutout.png'
            else:
                assert digest(ROOT/'assets/runtime'/asset['visual']['url'].removeprefix('/assets/')) == asset['visual']['sha256']
            placements = [p for p in additions if p['assetId'] == asset_id]
            entries.append({'asset':asset,'placements':placements,'volume':proxy[asset_id]})
            upsert(catalog['assets'], asset); volumes['volumes'][asset_id] = proxy[asset_id]
    current['parts'] = [p for p in current['parts'] if p['id'] not in retirement_ids]
    for p in additions: upsert(current['parts'], p)
    # Keep all live fixture transforms until the authoritative layout migration is installed.
    fixture_deltas = [{'current':p,'reviewed':q} for p in current['parts'] for q in reference['parts']
                      if p['id']==q['id'] and p['id'].startswith('equipment-') and p!=q]
    retired = {p['id']:p for p in old['retired_placements']}
    retired.update({k:prior[k] for k in retirement_ids if k in prior})
    manifest = {**old, 'revision':6, 'integration_revision':3, 'entries':entries,
        'retired_placements':list(retired.values()), 'previous_defaults':[*old.get('previous_defaults',[]),read(RUNTIME/'wayfarer.json')],
        'publication_authorization':{'quote':'Integrate and publish the completed pilot hull revision R006 alongside the other approved changes, including the new floor tiles. This message explicitly authorizes making R006 live.',
            'scope':'Exact R006 cumulative hull; owner integration handoff in current conversation'},
        'source_sha256':digest(source/'blender-source.blend'), 'recipe_sha256':digest(source/'recipe.zip'),
        'integration':'Merge scoped hull IDs into current assembly. Retain equipment identities and current authoritative poses; reviewed seat adjustment tracked separately.',
        'fixture_deltas_pending_authority':fixture_deltas}
    dst=ROOT/'assets/source/published-hull/pilot-kit-r006.blend';dst.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(source/'blender-source.blend',dst)
    write(RUNTIME/'catalog.json',catalog);write(RUNTIME/'catalog.voxels.json',volumes)
    write(RUNTIME/'wayfarer.json',current);write(RUNTIME/'hull-manifest.json',manifest)
    write(RELEASE/'hull-installation.json',{'revision':6,'placements':len(additions),'retired_ids':sorted(retirement_ids),'fixture_deltas':fixture_deltas,'recipe_sha256':manifest['recipe_sha256']})
    print('R006 hull merged:',len(additions),'placements;',len(fixture_deltas),'fixture differences pending authority review')

def install_cargo():
    original=read(archive()/'wayfarer.json')
    original_parts={p['id']:p for p in original['parts']}
    approval = read(LIB/'cargo-collection/approval/owner-approval.json')
    manifest_file=LIB/'cargo-collection/current/manifest.json'
    assert digest(manifest_file)==approval['manifest_sha256']
    approved=read(manifest_file)['entries'];assert len(approved)==73
    catalog=read(RUNTIME/'catalog.json');current=read(RUNTIME/'wayfarer.json');entries=[];volumes=read(RUNTIME/'catalog.voxels.json')
    storage=sorted(p['id'] for p in current['parts'] if p['id'].startswith('room-storage-container-'))
    assert len(storage)==4
    previous=read(RUNTIME/'cargo-manifest.json') if (RUNTIME/'cargo-manifest.json').exists() else {}
    # Retain current placed frames; cargo-layout performs the explicit floor migration.
    mapping={pid:('standard-small-red' if i%2 else 'standard-small') for i,pid in enumerate(storage)}
    for record in approved:
        design=record['design_id'];revision=record['revision'];appearance=record['appearance']
        assert approval['approved_revisions'][design]==revision
        ledger=read(LIB/'designs'/design/'design.json')
        base=LIB/'designs'/design/'revisions'/f'r{revision:03}'
        candidates=[base,*[p.parent for p in base.glob('appearances/**/glb.glb')]]
        source=next((p for p in candidates if (p/'glb.glb').exists() and digest(p/'glb.glb')==record['glb_sha256']),None)
        if source is None: raise ValueError('Approved durable source not found: '+appearance)
        assert digest(source/'blender-source.blend')==record['source_sha256']
        asset_id='part-'+hashlib.sha256(('approved-cargo/'+design+'/'+appearance).encode()).hexdigest()[:20]
        target=RUNTIME/'cargo'/asset_id;target.mkdir(parents=True,exist_ok=True)
        for name in ['glb.glb','cutout.png']:shutil.copy2(source/name,target/name)
        source_target=ROOT/'assets/source/approved-cargo'/asset_id;source_target.mkdir(parents=True,exist_ok=True)
        shutil.copy2(source/'blender-source.blend',source_target/'source.blend')
        validation=read(source/'validation-blender.json');bounds=validation['bounds_m']
        asset={'id':asset_id,'label':appearance.replace('-',' ').title(),'category':'cargo','nodes':[],
            'bounds':bounds,'lights':[],'thumbnail':f'/assets/assembly/cargo/{asset_id}/cutout.png',
            'visual':{'url':f'/assets/assembly/cargo/{asset_id}/glb.glb','sha256':record['glb_sha256'],
            'designId':design,'revision':revision,'bounds':bounds,'damagePreview':'unsupported'}}
        placements=[]
        for p in current['parts']:
            if mapping.get(p['id'])==appearance:
                before=copy.deepcopy(original_parts.get(p['id'],p));p['assetId']=asset_id;placements.append(copy.deepcopy(p))
                mapping[p['id']]={'appearance':appearance,'before':before,'after':copy.deepcopy(p)}
                old_mapping=previous.get('placement_mapping',{}).get(p['id'],{})
                if 'pre_floor_layout'in old_mapping:mapping[p['id']]['pre_floor_layout']=old_mapping['pre_floor_layout']
        entry={'asset':asset,'placements':placements,'canonical_uuid':ledger['asset_uuid'],'appearance':appearance,
            'revision':revision,'source':str(source_target.relative_to(ROOT)/'source.blend'),
            'approved_source':str(source.relative_to(ROOT)),'source_sha256':record['source_sha256'],
            'thumbnail_sha256':digest(target/'cutout.png'),'sockets':validation.get('sockets',[]),
            'inventory_kind':'liquid' if design.startswith('cargo.fluid') else 'grid',
            'gameplay':'Existing installed storage limits only; design capacity/mass/operating values remain proposals.'}
        entry['proxy_basis']='Conservative neutral visual bounds for local fitting only; not authority collision, contents, clearance sweep or damage'
        entries.append(entry);upsert(catalog['assets'],asset);volumes['volumes'][asset_id]=bounds_proxy(bounds)
    assert all(isinstance(value,dict) for value in mapping.values())
    installed={'schema':'sidereal.installed-cargo.v1','approval':approval,'entries':entries,'placement_mapping':mapping}
    if 'storage_layout'in previous:installed['storage_layout']=previous['storage_layout']
    write(RUNTIME/'cargo-manifest.json',installed);write(RUNTIME/'catalog.json',catalog);write(RUNTIME/'wayfarer.json',current);write(RUNTIME/'catalog.voxels.json',volumes)
    write(RELEASE/'cargo-installation.json',{'approved_manifest_sha256':digest(manifest_file),'assets':len(entries),'mapping':mapping,'state':'Installed assets; actual game verification pending'})
    print('Cargo installed:',len(entries),'approved appearances; four existing placement identities preserved')

def align_cargo():
    """Keep inventory identities while seating four unscaled pods on the deck."""
    manifest=read(RUNTIME/'cargo-manifest.json');current=read(RUNTIME/'wayfarer.json')
    parts={p['id']:p for p in current['parts']}
    for pid,mapping in manifest['placement_mapping'].items():
        p=parts[pid]
        mapping.setdefault('pre_floor_layout',copy.deepcopy(p))
        p['position']=[-4.0625 if pid.endswith('-0.25') else -3.3125,
                       2.0625 if '-2.15-' in pid else 3.4375,.1875]
        p['rotation']=math.pi/2
        mapping['after']=copy.deepcopy(p)
        for entry in manifest['entries']:
            entry['placements']=[copy.deepcopy(p) if q['id']==pid else q for q in entry['placements']]
    manifest['storage_layout']={'revision':2,'authority':'packages/content/src/storage-fixtures.ts',
        'arrangement':'Four floor-standing pods; closed inventory access; no filled stacking or lid sweep claim',
        'deck_top_m':.1875,'rotation_radians':math.pi/2}
    write(RUNTIME/'wayfarer.json',current);write(RUNTIME/'cargo-manifest.json',manifest)
    record=read(RELEASE/'cargo-installation.json');record['mapping']=manifest['placement_mapping']
    record['storage_layout']=manifest['storage_layout'];write(RELEASE/'cargo-installation.json',record)
    print('Four cargo pods aligned to deck; authoritative container identities retained')

def install_floor():
    archive()
    source=LIB/'shipyard-floor/r002';components=read(source/'components.json')
    catalog=read(RUNTIME/'catalog.json');current=read(RUNTIME/'wayfarer.json')
    old_assets={a['id']:a for a in catalog['assets']};entries=[];changes=[]
    previous=read(RUNTIME/'floor-manifest.json') if (RUNTIME/'floor-manifest.json').exists() else {}
    prior_migrations={m['before']['id']:m for m in previous.get('placement_migrations',[])}
    target=RUNTIME/'floor/r002';target.mkdir(parents=True,exist_ok=True)
    shutil.copy2(source/'kit.glb',target/'kit.glb')
    assert digest(target/'kit.glb')==read(source/'validation.json')['kit']['sha256']
    dst=ROOT/'assets/source/review-floor-r002';dst.mkdir(parents=True,exist_ok=True)
    shutil.copy2(source/'floor-kit.blend',dst/'floor-kit.blend')
    shutil.copytree(source/'maps',dst/'maps',dirs_exist_ok=True)
    for name in ['specification.json','components.json','validation.json']:shutil.copy2(source/name,dst/name)
    for c in components:
        slug=c['slug'];asset_id=c['id'];thumb=target/slug/'cutout.png';thumb.parent.mkdir(parents=True,exist_ok=True)
        shutil.copy2(source/'variants'/slug/'cutout.png',thumb)
        asset={'id':asset_id,'label':c['label']+' / r002 review candidate','category':'floor','nodes':[],
            'bounds':c['bounds'],'lights':[],'thumbnail':f'/assets/assembly/floor/r002/{slug}/cutout.png',
            'visual':{'url':'/assets/assembly/floor/r002/kit.glb','sha256':digest(target/'kit.glb'),
            'designId':'shipyard.floor.mapped-deck-kit','revision':2,'bounds':c['bounds'],
            'damagePreview':'unsupported','nodePrefix':c['node_prefix']}}
        entries.append({'asset':asset,'placements':[],'polygon_xy_m':c['polygon_xy_m']})
        upsert(catalog['assets'],asset)
    square=next(e for e in entries if 'square-2m' in e['asset']['thumbnail'])
    triangle=next(e for e in entries if 'triangle-45' in e['asset']['thumbnail'])
    for p in current['parts']:
        a=old_assets[p['assetId']]
        if a['category']!='floor':continue
        # Idempotent installation retains already-migrated nominal frames.
        if a.get('visual',{}).get('designId')=='shipyard.floor.mapped-deck-kit':
            next(e for e in entries if e['asset']['id']==p['assetId'])['placements'].append(copy.deepcopy(p))
            if p['id']in prior_migrations:
                m=copy.deepcopy(prior_migrations[p['id']]);m['after']=copy.deepcopy(p);changes.append(m)
            continue
        before=copy.deepcopy(p);e=triangle if 'corner45' in a['label'] else square
        p['assetId']=e['asset']['id']
        if not a.get('visual'):
            dx,dy=a['bounds']['min'][:2]
            if p['flipped']:dx=-a['bounds']['max'][0]
            angle=p['rotation'];p['position'][0]+=dx*math.cos(angle)-dy*math.sin(angle)
            p['position'][1]+=dx*math.sin(angle)+dy*math.cos(angle);p['position'][2]=0
        e['placements'].append(copy.deepcopy(p));changes.append({'before':before,'after':copy.deepcopy(p),'proxy':'Original authority unchanged; new fitting polygon is presentation metadata'})
    hull=read(RUNTIME/'hull-manifest.json')
    for e in hull['entries']:
        if e['asset']['category']=='floor':e['placements']=[]
    hull['retain_deck_backing_below_m']=0
    manifest={'schema':'sidereal.installed-floor.v1','revision':2,'approval':'Local candidate integration authorized; final art sign-off absent',
        'entries':entries,'placement_migrations':changes,'source_sha256':digest(source/'floor-kit.blend'),
        'backing':'Original legacy deck voxels below z=0 retained; upper visible surface replaced with native kit',
        'gameplay':'No authoritative collision, pressure or load-rating changes'}
    write(RUNTIME/'floor-manifest.json',manifest);write(RUNTIME/'hull-manifest.json',hull)
    write(RUNTIME/'catalog.json',catalog);write(RUNTIME/'wayfarer.json',current)
    # Retain original proxy records, add only explicitly labelled draft-fitting kit proxies.
    proxy=read(RUNTIME/'catalog.voxels.json')
    draft=read(ROOT/'.runtime/art-library/floor/r002/catalog.voxels.json')
    proxy['volumes'].update(draft['volumes']);write(RUNTIME/'catalog.voxels.json',proxy)
    write(RELEASE/'floor-installation.json',{'revision':2,'kit_sha256':digest(target/'kit.glb'),'placements':sum(len(e['placements'])for e in entries),'migrations':changes,'status':'Review candidate, not final art approval'})
    print('Floor r002 candidate:',sum(len(e['placements'])for e in entries),'placements; original below-deck backing retained')

def align_seat():
    """Run after additive PILOT_LAYOUT revision 2 publication and isolated smoke."""
    hull=read(RUNTIME/'hull-manifest.json');eq=read(RUNTIME/'equipment-manifest.json');draft=read(RUNTIME/'wayfarer.json')
    pid='equipment-control-seat'
    def align(p):
        if p['id']!=pid:return
        assert p['position'] in [[0,10,.1875],[0,10.25,.1875]], 'Unknown pilot pose requires explicit migration review'
        p['position']=[0,10.25,.1875]
    for p in draft['parts']:align(p)
    for e in eq['entries']:
        for p in e['placements']:align(p)
    for p in hull.get('equipment_placement_overrides',[]):align(p)
    hull['fixture_deltas_pending_authority']=[]
    hull['fixture_authority_migration']={'pilot_layout_revision':2,'station_y_m':10.25,'identity':'preserved','scope':'Known lab baseline only; reducer migration on entry'}
    write(RUNTIME/'hull-manifest.json',hull);write(RUNTIME/'equipment-manifest.json',eq);write(RUNTIME/'wayfarer.json',draft)
    print('Seat visual synchronized to authoritative pilot layout revision 2')

def preserve_floor_fitting():
    manifest=read(RUNTIME/'floor-manifest.json');draft=read(RUNTIME/'wayfarer.json')
    migrations={m['before']['id']:m for m in manifest['placement_migrations']}
    for e in manifest['entries']:
        for p in e['placements']:
            if p['id']not in migrations:continue
            m=migrations[p['id']];before=m['before']
            # Express old proxy origin in new visual local coordinates.
            dx=before['position'][0]-p['position'][0];dy=before['position'][1]-p['position'][1];angle=p['rotation']
            offset=[(math.cos(angle)*dx+math.sin(angle)*dy)*(-1 if p['flipped']else 1),-math.sin(angle)*dx+math.cos(angle)*dy,before['position'][2]-p['position'][2]]
            p['fittingProxy']={'assetId':before['assetId'],'offset':offset,'maxZ':.1875-before['position'][2]}
            upsert(draft['parts'],copy.deepcopy(p));m['after']=copy.deepcopy(p)
            m['proxy']='Original immutable fitting volume retained below native deck-top .1875m, with explicit local origin offset; no authority change'
    write(RUNTIME/'floor-manifest.json',manifest);write(RUNTIME/'wayfarer.json',draft)
    report=read(RELEASE/'floor-installation.json');report['migrations']=manifest['placement_migrations'];write(RELEASE/'floor-installation.json',report)
    print('Retained original floor fitting geometry in independently transformed local proxy frames')

def record_artifacts():
    from validate_native_release import validate
    validate()
    p=RUNTIME/'manifest.json';manifest=read(p)
    paths=[RUNTIME/name for name in ['catalog.json','catalog.voxels.json','wayfarer.json','equipment-manifest.json','hull-manifest.json','floor-manifest.json','cargo-manifest.json']]
    for folder in ['hull/r006','hull/finish-r004','floor/r002','cargo']:
        paths.extend(path for path in (RUNTIME/folder).rglob('*')if path.is_file())
    for path in paths:manifest['outputs'][str(path.relative_to(ROOT))]=digest(path)
    manifest['native_integration']={'release_record':'docs/releases/native-ship-2026-09-08','hull':6,'floor_candidate':2,'cargo_approved_appearances':73,'visual_authority':'Preserved Blender GLBs; local fitting proxies separate'}
    write(p,manifest)
    print('Recorded validated native integration outputs in assembly manifest')

def install_finish():
    """Install the reviewed native finish derivative; preserve approved R006 bytes."""
    study=LIB/'shipyard-hull/material-studies/native-r006-polymer-04'
    mapping=read(study/'integration-map.json')
    exports={e['approvedSourceSha256']:e for e in mapping['exports']}
    hull=read(RUNTIME/'hull-manifest.json');catalog=read(RUNTIME/'catalog.json');changes=[]
    for entry in hull['entries']:
        a=entry['asset'];v=a['visual'];base=entry.get('approved_visual',v)
        candidate=exports.get(base['sha256'])
        if not candidate or a['category']=='floor':continue
        source=ROOT/candidate['candidate'];assert digest(source)==candidate['candidateSha256']
        entry.setdefault('approved_visual',copy.deepcopy(v))
        target=RUNTIME/'hull/finish-r004'/a['id']/'clean.glb';target.parent.mkdir(parents=True,exist_ok=True)
        shutil.copy2(source,target)
        v['url']='/assets/assembly/'+str(target.relative_to(RUNTIME));v['sha256']=candidate['candidateSha256']
        entry['finish_review']={'study':'native-r006-polymer-04','status':'Local review candidate; exact owner final art sign-off absent',
            'source':str((study/'candidate.blend').relative_to(ROOT)),'source_sha256':digest(study/'candidate.blend')}
        upsert(catalog['assets'],copy.deepcopy(a));changes.append({'assetId':a['id'],'before':entry['approved_visual'],'after':copy.deepcopy(v)})
    assert len(changes)==15
    hull['finish_candidate']={'study':'native-r006-polymer-04','base_revision':6,'mapping_sha256':digest(study/'integration-map.json'),
        'authorization':'Owner requested continued geometry/plastic integration; local candidate only, not exact final art approval'}
    write(RUNTIME/'hull-manifest.json',hull);write(RUNTIME/'catalog.json',catalog)
    write(RELEASE/'finish-installation.json',{'study':hull['finish_candidate'],'changes':changes})
    print('Installed 15 native hull finish derivatives; approved R006 visuals preserved')

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('part',choices=['hull','cargo','cargo-layout','floor','seat','floor-fitting','finish','record']);args=p.parse_args()
    {'hull':install_hull,'cargo':install_cargo,'cargo-layout':align_cargo,'floor':install_floor,'seat':align_seat,'floor-fitting':preserve_floor_fitting,'finish':install_finish,'record':record_artifacts}[args.part]()
