"""Guarded canonical appearance memberships, without changing revision coverage."""
from pathlib import Path
import copy,json,sys
ROOT=Path(__file__).resolve().parents[2];sys.path.insert(0,str(ROOT/'scripts'))
import art_catalog as ac
OUT=ROOT/'.runtime/art-library/cargo/fluid-extension/r001'

def main():
    rows=[]
    for path in [OUT/'variant-jobs.json',ROOT/'.runtime/art-library/cargo/r002/finishes/jobs.json']:
        for job in json.loads(path.read_text()):
            rows.extend((ref,job['design_id'],str(path)) for ref in job['reference_ids'])
    rows += [('modular-spaceship-design-2--storage-pale-loose-crate','cargo.standard.medium','Explicit inspected base reuse'),('modular-spaceship-design-2--storage-orange-loose-crate','cargo.standard.large','Explicit inspected base reuse'),('modular-spaceship-design-2--storage-large-gold-loose-crate','cargo.standard.large','Explicit inspected base reuse')]
    assert len({r[0] for r in rows})==len(rows)
    changes=[]
    with ac.locked():
        catalog=ac.read(ac.LIB/'catalog.json');byref={r['id']:r for r in catalog['references']};designs={};original_revisions={}
        def design(key):
            if key not in designs:
                designs[key]=ac.read(ac.design_path(key));original_revisions[key]=copy.deepcopy(designs[key]['revisions'])
            return designs[key]
        # Validate the complete move set before the first write.
        for ref,target,reason in rows:
            oldkey=byref[ref]['design_id'];old=design(oldkey);new=design(target)
            if oldkey==target:continue
            assert ref in old['reference_ids']
            assert not any(ref in r.get('covered_reference_ids',[]) for r in old['revisions']),f'Existing covered history requires reviewed migration: {ref}'
            assert not new.get('owner_final_signoff'),f'Destination is owner-approved: {target}'
        for ref,target,reason in rows:
            oldkey=byref[ref]['design_id']
            if oldkey==target:continue
            old=design(oldkey);new=design(target)
            entry={'at':ac.now(),'from':oldkey,'to':target,'reference_ids':[ref],'reason':'Explicit inspected appearance reuse; authored native source/preset manifest: '+reason+'. Canonical membership only; saved revision coverage/evidence unchanged.'}
            old['reference_ids'].remove(ref);new['reference_ids'].append(ref)
            old.setdefault('inventory_history',[]).append(entry);new.setdefault('inventory_history',[]).append(entry)
            byref[ref]['design_id']=target
            meta_path=ac.LIB/'assets'/ref/'reference.json';meta=ac.read(meta_path)
            meta['design_id']=target;meta.setdefault('design_mapping_history',[]).append(entry);ac.write(meta_path,meta)
            brief=ac.LIB/byref[ref]['brief']
            brief.write_text(brief.read_text().replace(f'[{oldkey}](../../designs/{oldkey}/DESIGN.md)',f'[{target}](../../designs/{target}/DESIGN.md)'))
            changes.append(entry)
        for key,d in designs.items():
            assert d['revisions']==original_revisions[key],'Prior revisions must not change'
            ac.write(ac.design_path(key),d)
        ac.write(ac.LIB/'catalog.json',catalog);ac.refresh()
    (OUT/'canonical-membership-changes.json').write_text(json.dumps({'requested_memberships':len(rows),'moved':len(changes),'changes':changes,'revision_coverage_changed':False,'crop_pixels_changed':False,'publication':False},indent=2)+'\n')
    audit={'schema':'sidereal.bounded-cargo-coverage-audit.v1','canonical_membership_moves':len(changes),'fluid':'5 canonical fluid geometries, 25 exact source appearances authored; source memberships unified, runtime/evidence registration separate','existing_cargo':'19 canonical size/family designs with 26 finish/accessory jobs and 3 inspected base reuses mapped; earlier revision coverage untouched','remaining_distinct_container_geometry':[{'design':'cargo.standard.narrow','references':['modular-spaceship-design-2--storage-narrow-blue-crate','modular-spaceship-design-2--storage-red-canister'],'status':'Assigned next: one narrow upright case, blue/red appearances'},{'design':'cargo.standard.tiny','references':['modular-spaceship-design-2--storage-tiny-magenta-crate'],'status':'Assigned next: tiny squat magenta case, pinch/lanyard handling'}],'compositions':[{'reference':'modular-spaceship-design-2--storage-crate-tile','disposition':'Composition of standard small/medium/large plus floor; does not create duplicate container geometry'},{'reference':'cargo-pods-ore-etc--cargo-rack-storage-example','disposition':'Rack composition using canonical standard/reinforced containers; independent assembly evidence'},{'reference':'cargo-pods-ore-etc--tractor-target-lock-example','disposition':'Container/effect composition; reuse canonical container and preserve whole crop'},{'reference':'cargo-pods-ore-etc--tractor-transport-example','disposition':'Transport composition; reuse canonical container and preserve whole crop'}],'excluded_from_new_container_geometry':['cargo pallet and stacked-supply assemblies','ore/resource chunks and ingot stacks','UI/category icons','unrelated source design queues'],'publication':False,'owner_approval':False}
    (OUT/'bounded-coverage-audit.json').write_text(json.dumps(audit,indent=2)+'\n')
    print('Moved',len(changes),'canonical memberships; all saved revision coverage and crop pixels unchanged.')

if __name__=='__main__':main()
