"""Fixed-identity native end/shoulder source composition; no live refit."""
import hashlib,json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
MAP=ROOT/'assets/art-library/designs/shipyard.structure.wayfarer-airlock-inlet/revisions/r000/a003/replacement-mapping.json'

def plan(reuse_native_shoulders=False, shoulder_pockets=False):
    originals={p['sourcePlacedId']:p for p in json.loads(MAP.read_text())['preserveOriginalPlacements']}
    catalog={p['id']:p for p in json.loads((ROOT/'assets/runtime/assembly/catalog.json').read_text())['assets']}
    entries={}
    def add(ident,source,selection,anchor,q):
        p=originals[ident]['originalPlacement'];assert p['rotation']==0 and not p['flipped']
        entry=entries.setdefault(ident,{'sourcePlacedId':ident,'originalPlacement':p,'components':[],
            'preservePartitionNodes':[n for n in catalog[originals[ident]['assetId']]['nodes'] if n.endswith('--partitions')]})
        entry['components'].append({'source':source,'selection':selection,'anchorWorldM':anchor,'quarterTurns':q,
            'sourceTranslationM':[anchor[i]-p['position'][i] for i in range(3)]})
    for sign,prefix in [(-1,'-'),(1,'')]:
        q=-1 if sign<0 else 1
        for cell in [-4,4]:
            anchor=[sign*5,cell*2+(1 if sign<0 else -1),0]
            add(f'wall-{prefix}3-{cell}','straight-2m','body',anchor,q)
            add(f'wall-{prefix}2-{cell}','straight-2m','facing',anchor,q)
        # Fore shoulder has no separate historical exterior pressure ID.
        # Keep its existing composite facing ID for both shoulder source layers.
        if not reuse_native_shoulders:
            add(f'wall-{prefix}2-4','straight-2m','all',[-3 if sign<0 else 5,9,0],2)
            add(f'wall-{prefix}2-4','outer-corner','all',[sign*5,9,0],-1 if sign<0 else 2)
        if shoulder_pockets:
            add(f'wall-{prefix}2-4','outer-corner','all',[sign*5,9,0],-1 if sign<0 else 2)
        corner=('aft-corner-port' if sign<0 else 'aft-corner-starboard') if reuse_native_shoulders else 'outer-corner'
        add(f'wall-{prefix}3--5',corner,'all',[sign*5,-9,0],0 if sign<0 else 1)
    for cell in range(-2,3):
        add(f'wall-{cell}--5','straight-2m','body',[cell*2-1,-9,0],0)
        add(f'wall-{cell}--4','straight-2m','facing',[cell*2-1,-9,0],0)
    return {'schema':'sidereal.usable-wall-end-plan.v1','sourceMappingSha256':hashlib.sha256(MAP.read_bytes()).hexdigest(),
        'shoulderStructuralPockets':shoulder_pockets,'reuseUnchangedNativeShoulderBoundaries':reuse_native_shoulders,'entries':list(entries.values()),'originalPlacementCount':len(originals),'originalIdsRemoved':[],
        'placedTransformsChanged':0,'installed':False,'status':'native-source-plan-awaiting-export-and-qualification',
        'limits':['Keep exact original R006 cockpit and armor sources.','Front pressure/corner surfaces use existing front composite identity; preserve cutaway roles at node level.','Geometry and support/collision/material joins must pass before template admission.']}
if __name__=='__main__':
    import sys
    reuse='--reuse-native-shoulders' in sys.argv
    pocket='--shoulder-pockets' in sys.argv
    result=plan(reuse,pocket);(ROOT/('.runtime/usable-wall-end-plan-a009.json' if pocket else '.runtime/usable-wall-end-plan-a008.json' if reuse else '.runtime/usable-wall-end-plan.json')).write_text(json.dumps(result,indent=2)+'\n')
    print(json.dumps({'sourceIdentities':len(result['entries']),'nativeComponents':sum(len(p['components']) for p in result['entries'])}))
