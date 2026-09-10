"""Read-only native side-bay expansion and preserved partition-role evidence."""
import hashlib
import json
import math

import manifold3d as m

from qualify_usable_wall_pairs import DIRECTORY
from qualify_wayfarer_placement_interfaces import MAP, ROOT, shape
from qualify_wayfarer_airlock_inlet import native_parts


def inspect():
    mapping = json.loads(MAP.read_text())
    originals = {p['sourcePlacedId']:p for p in mapping['preserveOriginalPlacements']}
    catalog = {p['id']:p for p in json.loads((ROOT/'assets/runtime/assembly/catalog.json').read_text())['assets']}
    manifest = json.loads((DIRECTORY/'delivery-manifest.json').read_text())
    asset = next(p for p in manifest['parts'] if p['id']=='straight-2m')
    path = DIRECTORY/asset['file']
    assert hashlib.sha256(path.read_bytes()).hexdigest()==asset['sha256']
    canonical = native_parts(path)[0]
    pairs = []
    for side,sign,prefix in [('port',-1,'-'),('starboard',1,'')]:
        q = -1 if side=='port' else 1
        for cell in range(-3,4):
            y = cell*2
            inner_id,outer_id = f'wall-{prefix}2-{cell}',f'wall-{prefix}3-{cell}'
            inner,outer = originals[inner_id],originals[outer_id]
            anchor = [sign*5,y+(1 if sign<0 else -1),0]
            body = canonical.rotate([0,0,q*90]).translate(anchor)
            armor_id = f'superstructure-{prefix}3-{cell}'
            armor,armor_pin = shape(originals[armor_id])
            preserved = []
            for node in catalog[inner['assetId']]['nodes']:
                if not node.endswith('--partitions'):
                    continue
                source = ROOT/'assets/runtime/assembly/parts.glb'
                local,count = native_parts(source,node)
                placement = inner['originalPlacement']
                current = local.rotate([0,0,placement['rotation']*180/math.pi]).translate(placement['position'])
                preserved.append({'sourceNode':node,'sourceSha256':hashlib.sha256(source.read_bytes()).hexdigest(),
                    'nativeTriangles':count,'nativeVolumeM3':current.volume(),'nativeBoundsM':current.bounding_box(),
                    'role':'preserved-interior-partition','pressureReady':False,
                    'geometryRule':'Retain exact historical native mesh and local transform; do not relabel it as newly authored or full-height sealed structure.'})
            floor_id = f'floor-{prefix}2-{cell}'
            roof_id = f'roof-{prefix}2-{cell}'
            floor,_ = shape(originals[floor_id]); roof,_ = shape(originals[roof_id])
            actor_prism = m.Manifold.cube([2,2,2.5]).translate([-5 if sign<0 else 3,y-1,.1875])
            pairs.append({'exteriorId':outer_id,'interiorId':inner_id,
                'originalExteriorPlacement':outer['originalPlacement'],'originalInteriorPlacement':inner['originalPlacement'],
                'canonicalSourceAnchorWorldM':anchor,'canonicalSourceQuarterTurns':q,
                'nativeSourceFrameExteriorTranslationM':[anchor[i]-outer['originalPlacement']['position'][i] for i in range(3)],
                'nativeSourceFrameInteriorTranslationM':[anchor[i]-inner['originalPlacement']['position'][i] for i in range(3)],
                'unchangedFloor':floor_id,'unchangedRoof':roof_id,'unchangedArmor':armor_id,'armorSource':armor_pin,
                'preservedPartitionNodes':preserved,'floorContactM3':(body^floor).volume(),
                'roofContactM3':(body^roof).volume(),'armorIntersectionM3':(body^armor).volume(),
                'newOuterFamilyUsableIntrusionM3':(body^actor_prism).volume(),
                'exportState':'Exact source-frame plan; these composite GLBs are not yet authored/exported or game-admissible.'})
    return {'schema':'sidereal.usable-wall-side-expansion-inspection.v1',
        'sourceMappingSha256':hashlib.sha256(MAP.read_bytes()).hexdigest(),'pairs':pairs,
        'candidateNativeSource':asset,'placedTransformsChanged':0,'renderedOrInstalled':False,
        'limits':['14straight side bays only; aft/front combined groups and shoulder/cockpit joins remain separate.',
                  'Preserved partitions keep their exact native occupancy; they may be partial-height and confer no seal qualification.',
                  'New source-frame exports, complete asset reservations, neighbor joins and full template validation remain required.']}


if __name__=='__main__':
    result = inspect()
    output = ROOT/'.runtime/usable-wall-side-expansion.json'
    output.write_text(json.dumps(result,indent=2)+'\n')
    print(json.dumps({'pairs':len(result['pairs']),
        'preservedPartitionGroups':sum(len(p['preservedPartitionNodes']) for p in result['pairs']),
        'armorConflicts':[p['interiorId'] for p in result['pairs'] if p['armorIntersectionM3']>1e-9],
        'missingRoofContacts':[p['interiorId'] for p in result['pairs'] if p['roofContactM3']<1e-8],
        'usableIntrusions':[p['interiorId'] for p in result['pairs'] if p['newOuterFamilyUsableIntrusionM3']>1e-9]}))
