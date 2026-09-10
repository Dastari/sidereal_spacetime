"""Exact native outward wall/corner qualification, including unchanged locker."""
import hashlib
import json
import math
from pathlib import Path
import sys

import manifold3d as m
import numpy as np
from shapely.geometry import Polygon
from shapely.ops import unary_union

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT/'scripts/art_library'))
from validate_cargo_carriers import triangles
from validate_reserved_envelope import qualify_points
from qualify_wayfarer_airlock_inlet import native_parts
from qualify_wayfarer_placement_interfaces import MAP, shape

DIRECTORY = ROOT/'assets/art-library/designs/shipyard.structure.usable-boundary-wall/revisions/r000/a004'


def clipped_area(triangle, lower, upper):
    """Clip actual native triangle to a forbidden convex volume, including thin surfaces."""
    polygon = [np.array(p, dtype=float) for p in triangle]
    for axis in range(3):
        for plane, sign in [(lower[axis],1), (upper[axis],-1)]:
            next_polygon = []
            if not polygon:
                return 0
            for a,b in zip(polygon, polygon[1:]+polygon[:1]):
                da, db = sign*(a[axis]-plane), sign*(b[axis]-plane)
                if da >= 0:
                    next_polygon.append(a)
                if (da >= 0) != (db >= 0):
                    next_polygon.append(a+(b-a)*(da/(da-db)))
            polygon = next_polygon
    if len(polygon) < 3:
        return 0
    return sum(np.linalg.norm(np.cross(polygon[i]-polygon[0],polygon[i+1]-polygon[0]))/2
               for i in range(1,len(polygon)-1))


def qualify(directory=DIRECTORY):
    manifest = json.loads((directory/'delivery-manifest.json').read_text())
    checks = []
    solids = {}
    pins = []

    def check(name, passed, detail=None):
        checks.append({'name': name, 'pass': bool(passed), 'detail': detail})

    thickness = manifest['structuralEnvelopeM']['outwardThickness']
    for part in manifest['parts']:
        path = directory/part['file']
        assert hashlib.sha256(path.read_bytes()).hexdigest() == part['sha256']
        faces, doc = triangles(path)
        inverse = np.linalg.inv(np.array(part['canonicalSourceTransform'])) if part['canonicalSourceTransform'] else np.eye(4)
        canonical = [(name, [(inverse @ np.array([*point,1]))[:3].tolist() for point in face]) for name,face in faces]
        is_corner = part['id'] == 'outer-corner'
        footprint = [[-thickness,-thickness],[.0625,-thickness],[.0625,.0625],[-thickness,.0625]] if is_corner else [[0,-thickness],[2,-thickness],[2,.0625],[0,.0625]]
        result = qualify_points((p for _,face in canonical for p in face), footprint, 0, 2.75)
        check('Complete raw reserved export '+part['id'], True, result)
        lower = [1e-6,1e-6,.1875+1e-6] if is_corner else [-1,1e-6,.1875+1e-6]
        upper = [3,3,2.6875-1e-6]
        area = sum(clipped_area(face,lower,upper) for _,face in canonical)
        check('No native surface intrudes usable floor '+part['id'], area < 1e-12, {'forbiddenSurfaceAreaM2': area})
        check('No proxy exported '+part['id'], not any('PROXY' in name for name,_ in faces))
        material_roles = {material['name'] for material in doc['materials']}
        check('Native material separation '+part['id'], len(material_roles)>=2, sorted(material_roles))
        body, count = native_parts(path)
        solids[part['id']] = body
        check('Closed native export '+part['id'], body.status()==m.Error.NoError and body.volume()>0, {'nativeTriangles': count})
        pins.append(part)

    # Actual separate source contact proxies must be occupied by native union,
    # without keeping duplicate coplanar source meshes in exported visuals.
    for core in json.loads((directory/'contact-proxies.json').read_text())['cores']:
        expected = m.Manifold.cube(np.array(core['maxM'])-core['minM']).translate(core['minM'])
        missing = (expected-solids[core['part']]).volume()
        check('Native union contains declared contact '+core['node'], missing < 1e-9, {'missingM3': missing})

    source = {p['sourcePlacedId']:p for p in json.loads(MAP.read_text())['preserveOriginalPlacements']}
    floor, floor_pin = shape(source['floor--2--3'])
    roof, roof_pin = shape(source['roof--2--3'])
    armor, armor_pin = shape(source['superstructure--3--3'])
    old_wall, wall_pin = shape(source['wall--2--3'])
    locker, locker_pin = shape(source['equipment-locker--4.7--6'])
    origin = source['wall--2--3']['originalPlacement']['position']
    assert origin == [-4.6875,-6,0]
    corrected = solids['straight-port-legacy'].translate(origin)
    old_overlap, new_overlap = (old_wall^locker).volume(), (corrected^locker).volume()
    check('Original unchanged locker intersection is a real negative control', old_overlap > 1e-5, {'nativeM3': old_overlap})
    check('Corrected source clears unchanged locker', new_overlap < 1e-10 and corrected.min_gap(locker,.1)>=.0625-1e-6,
          {'nativeM3':new_overlap, 'minimumNativeGapM':corrected.min_gap(locker,.1)})
    check('Unchanged outer armor has separate nonoverlapping reservation', (corrected^armor).volume()<1e-10 and corrected.min_gap(armor,.1)>=.0625-1e-6, {'nativeM3':(corrected^armor).volume(),'minimumGapM':corrected.min_gap(armor,.1)})
    usable = m.Manifold.cube([2,2,2.5]).translate([-5,-7,.1875])
    check('Corrected source leaves entire declared usable prism free', (corrected^usable).volume()<1e-10)
    check('Original unchanged floor has positive bearing contact', (corrected^floor).volume()>1e-4, {'nativeM3':(corrected^floor).volume()})
    check('Original unchanged roof has positive bearing contact', (corrected^roof).volume()>1e-4, {'nativeM3':(corrected^roof).volume()})

    coupon = m.Manifold.cube([.042,.20,.25]).translate([-5.012,-6.10,-.01])
    def through_floor(body):
        return [c.volume() for c in (coupon-body).decompose() if c.bounding_box()[2]<-.00999 and c.bounding_box()[5]>.23999]
    bearing = m.Manifold.cube([.125,2,.09375]).translate([-5.0625,-7,.03125])
    check('Native floor bearing closes actual edge void', not through_floor(corrected+floor))
    check('Removing authored floor bearing opens edge negative control', bool(through_floor((corrected-bearing)+floor)))

    straight = solids['straight-2m']
    second = straight.rotate([0,0,-90]).translate([0,2,0])
    corner = solids['outer-corner']
    check('Exterior corner overlaps both straight native cores', (corner^straight).volume()>1e-5 and (corner^second).volume()>1e-5,
          {'firstM3': (corner^straight).volume(), 'secondM3': (corner^second).volume()})
    quadrant = m.Manifold.cube([2,2,2.5]).translate([0,0,.1875])
    check('Two-wall corner union preserves full usable quadrant', ((corner+straight+second)^quadrant).volume()<1e-10)
    def top_surface(filename):
        faces, _ = triangles(directory/filename)
        return unary_union([Polygon([(p[0],p[1]) for p in face]) for _,face in faces if all(abs(p[2]-2.75)<1e-7 for p in face)])
    visible_overlap = top_surface('straight-2m.glb').intersection(top_surface('outer-corner.glb')).area
    check('Separate modules have no overlapping visible top faces', visible_overlap < 1e-10,
          {'samePlaneSameFacingOverlapM2':visible_overlap})
    check('Armor sockets remain outward with unresolved ratings', all(s['positionM'][1]==-thickness and s['outwardNormal']==[0,-1,0] and s['rating'] is None for s in manifest['armorMounts']))
    return {
        'schema':'sidereal.usable-boundary-wall-native-qualification.v1',
        'pass':all(c['pass'] for c in checks), 'checks': checks, 'candidatePins':pins,
        'originalSourcePins': {'floor':floor_pin,'roof':roof_pin,'wall':wall_pin,'locker':locker_pin,'armor':armor_pin},
        'sourceMappingSha256':hashlib.sha256(MAP.read_bytes()).hexdigest(),
        'originalPlacementChanges':0, 'nativeSourceRevisionsChanged':0,
        'limits':['Representative straight/corner source family only, not entire Wayfarer rebuild or all21 mixed groups.',
                  'No approved armor/strength/load/power rating or qualified mechanical locker attachment.',
                  'No runtime install, pressure allocation or final owner artistic approval.',
                  'Raw surfaces use1micrometre GLB encoding tolerance; native CSG uses separately recorded normalization.'],
    }


if __name__ == '__main__':
    report = qualify()
    output = DIRECTORY/'native-qualification.json'
    if output.exists():
        assert json.loads(output.read_text()) == json.loads(json.dumps(report)), 'Preserve changed evidence as a new attempt'
    else:
        output.write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps({'pass':report['pass'],'checks':len(report['checks']),'failures':[c for c in report['checks'] if not c['pass']],'output':str(output)}))
    raise SystemExit(0 if report['pass'] else 1)
