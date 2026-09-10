"""Temporary diagnostic planes localize native leaks; NEVER asset/pressure proof."""
import json
import manifold3d as m
from inspect_wayfarer_native_enclosure import inspect, ROOF

def cube(lo, hi):
    return m.Manifold.cube([b-a for a,b in zip(lo,hi)]).translate(lo)

def run():
    shell=inspect(True)
    box=cube([-7,-11,-2],[15,15,6])
    probes={'main':[0,0,1.2],'rear':[0,-6,1.2],'front':[0,8,1.2],'cockpit':[0,11,1.2]}
    from shapely.geometry import Polygon, box as sbox
    sectionResults=[]
    for z in [.03125,.10,.17,2.69,2.72,2.8]:
        section=Polygon()
        for contour in shell.slice(z).to_polygons():section=section.symmetric_difference(Polygon(contour))
        missing=sbox(-4.8,-8.5,4.8,5.5).difference(section)
        polys=list(missing.geoms)if hasattr(missing,'geoms')else[missing]
        detail={'z':z,'missingArea':missing.area,'holes':[{'area':p.area,'bounds':p.bounds,'wkt':p.wkt if len(p.wkt)<1000 else p.wkt[:1000]}for p in polys if p.area>1e-12]}
        sectionResults.append(detail);print(json.dumps(detail),flush=True)
    return {'diagnosticOnly':True,'sections':sectionResults}
    scenarios={}
    result={}
    for name,extra in scenarios.items():
        solids=shell+m.Manifold.batch_boolean(extra,m.OpType.Add)
        candidates=[]
        for component in (box-solids).decompose():
            if component.volume()<.001:continue
            bb=component.bounding_box()
            if any(abs(bb[i]-[-7,-11,-2,15,15,6][i])<1e-6 for i in range(6)):continue
            contained=[key for key,p in probes.items() if (component^cube([v-.005 for v in p],[v+.005 for v in p])).volume()>5e-7]
            if contained:candidates.append({'volumeM3':component.volume(),'probes':contained,'bounds':bb})
        result[name]=candidates
        print(name,candidates,flush=True)
    return {'diagnosticOnly':True,'syntheticCapsNotAnAuthoredAssetOrAirtightQualification':True,'results':result}

if __name__=='__main__':
    report=run()
    path=ROOF/'closure-sections-a002.json'
    if path.exists():assert json.loads(path.read_text())==report
    else:path.write_text(json.dumps(report,indent=2)+'\n')
