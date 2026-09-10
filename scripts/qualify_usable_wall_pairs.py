"""Preserve both legacy wall identities without rendering duplicate structure."""
import hashlib
import json
from pathlib import Path
import sys
from collections import Counter

import manifold3d as m

from qualify_usable_boundary_wall import ROOT, qualify
from qualify_wayfarer_placement_interfaces import MAP, shape
from qualify_wayfarer_airlock_inlet import native_parts
from qualify_usable_boundary_wall import triangles

DIRECTORY = ROOT/'assets/art-library/designs/shipyard.structure.usable-boundary-wall/revisions/r000/a005'


def qualify_pairs():
    inherited = qualify(DIRECTORY)
    manifest = json.loads((DIRECTORY/'delivery-manifest.json').read_text())
    assets = {p['id']:p for p in manifest['parts']}
    mapping = json.loads(MAP.read_text())
    originals = {p['sourcePlacedId']:p for p in mapping['preserveOriginalPlacements']}
    checks = list(inherited['checks'])
    replacements = []
    pairs = []
    def check(name, passed, detail=None):
        checks.append({'name':name,'pass':bool(passed),'detail':detail})
    def body(asset):
        entry = assets[asset]
        path = DIRECTORY/entry['file']
        assert hashlib.sha256(path.read_bytes()).hexdigest()==entry['sha256']
        return native_parts(path)[0]
    def surface_signature(asset, offset):
        faces, doc = triangles(DIRECTORY/assets[asset]['file'])
        material_by_node = {}
        for node in doc['nodes']:
            if 'mesh' not in node:
                continue
            materials = {doc['materials'][p['material']]['name'] for p in doc['meshes'][node['mesh']]['primitives']}
            assert len(materials)==1, 'Split source needs primitive-level material mapping'
            material_by_node[node['name']] = next(iter(materials))
        # Blender truncates long node labels differently for differently sized prefixes.
        # Compare the complete triangle/material multiset, not display labels.
        return Counter((material_by_node[name],
                        tuple(sorted(tuple(round(p[i]+offset[i],6) for i in range(3)) for p in face)))
                       for name,face in faces)
    for side, sign, prefix in [('port',-1,'-'),('starboard',1,'')]:
        for cell,y in [(-3,-6),(-1,-2)]:
            outer_id = f'wall-{prefix}3-{cell}'
            inner_id = f'wall-{prefix}2-{cell}'
            outer = originals[outer_id]['originalPlacement']
            inner = originals[inner_id]['originalPlacement']
            assert outer['position']==[sign*5.125,y,0] and inner['position']==[sign*4.6875,y,0]
            assert not outer['flipped'] and not inner['flipped'] and outer['rotation']==inner['rotation']==0
            outer_asset, inner_asset = side+'-pressure-body', side+'-inner-facing'
            outside = body(outer_asset).translate(outer['position'])
            inside = body(inner_asset).translate(inner['position'])
            combined = outside+inside
            prototype = body('straight-'+side+'-legacy').translate(inner['position'])
            difference = (prototype-combined).volume()+(combined-prototype).volume()
            check('Split source pair matches qualified native visual '+inner_id, difference<1e-10, {'symmetricDifferenceM3':difference})
            prototype_signature = surface_signature('straight-'+side+'-legacy',inner['position'])
            split_signature = surface_signature(outer_asset,outer['position'])+surface_signature(inner_asset,inner['position'])
            check('Every native surface triangle and material survives split '+inner_id, prototype_signature==split_signature,
                  {'nativeTriangleCount':sum(prototype_signature.values()),'encodingComparisonM':1e-6})
            old_outer, _ = shape(originals[outer_id])
            check('Retaining old outer wall would duplicate native structure '+outer_id, (combined^old_outer).volume()>.1,
                  {'forbiddenDuplicateM3':(combined^old_outer).volume()})
            locker_id = f'equipment-locker-{sign*4.7:g}-{y}'
            locker,_ = shape(originals[locker_id])
            check('Both replacement IDs clear unchanged locker '+locker_id, (combined^locker).volume()<1e-10 and combined.min_gap(locker,.1)>=.0625-1e-6)
            armor_id = f'superstructure-{prefix}3-{cell}'
            armor,_ = shape(originals[armor_id])
            check('Both replacement IDs clear unchanged armor '+armor_id, (combined^armor).volume()<1e-10)
            for ident,asset in [(outer_id,outer_asset),(inner_id,inner_asset)]:
                replacements.append({'sourcePlacedId':ident,'originalPlacement':originals[ident]['originalPlacement'],
                    'candidateNativeAsset':assets[asset], 'sourceOriginUnchanged':True,
                    'semanticRole':'outward-pressure-structure' if ident==outer_id else 'interior-facing-within-outward-reservation'})
            pairs.append({'exteriorId':outer_id,'interiorId':inner_id,'unchangedLocker':locker_id,'unchangedArmor':armor_id})
    check('Eight distinct IDs replaced once',len(replacements)==len({p['sourcePlacedId'] for p in replacements})==8)
    return {'schema':'sidereal.usable-wall-pair-candidate.v1','pass':all(c['pass'] for c in checks),'checks':checks,
        'sourceMappingSha256':hashlib.sha256(MAP.read_bytes()).hexdigest(),'originalPlacementCount':len(originals),
        'pairs':pairs,'replacements':replacements,'originalTransformsChanged':0,'originalIdsRemoved':[],
        'authorityChanges':False,'fullWayfarerAdmissible':False,
        'remaining':['Mixed exterior/partition groups and their junctions remain unresolved; do not erase partitions.',
                     'Current retained neighboring strips require compatible seam adapters or corrected source pairs.',
                     'No full pressure enclosure, damage-ready surfaces, fitted spacer strength or game install qualification.']}


if __name__=='__main__':
    report = qualify_pairs()
    output = DIRECTORY/'pair-qualification-a003.json'
    if output.exists():
        assert json.loads(output.read_text())==json.loads(json.dumps(report)), 'Preserve changed evidence'
    else:
        output.write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps({'pass':report['pass'],'checks':len(report['checks']),'replacements':len(report['replacements']),
                     'failures':[c for c in report['checks'] if not c['pass']]}))
    raise SystemExit(0 if report['pass'] else 1)
