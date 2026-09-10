"""Temporary diagnostic planes localize native leaks; NEVER asset/pressure proof."""
import json
import manifold3d as m
from native_void_components import components_without_zero_area_bridges
from inspect_wayfarer_native_enclosure import inspect, ROOF

def cube(lo, hi):
    return m.Manifold.cube([b-a for a,b in zip(lo,hi)]).translate(lo)

def run():
    shell=inspect(True)
    box=cube([-7,-11,-2],[15,15,6])
    probes={'main':[0,0,1.2],'rear':[0,-6,1.2],'front':[0,8,1.2],'cockpit':[0,11,1.2]}
    faces={
      'roof':cube([-7,-10,2.5],[7,7,2.55]),
      'floor':cube([-7,-10,.19],[7,7,.20]),
      'front':cube([-7,5.5,-1],[7,5.55,4]),
      'rear':cube([-7,-8.55,-1],[7,-8.5,4]),
      'left':cube([-4.85,-10,-1],[-4.8,7,4]),
      'right':cube([4.8,-10,-1],[4.85,7,4]),
    }
    scenarios={'native-roof':[v for k,v in faces.items()if k!='roof']}
    result={}
    for name,extra in scenarios.items():
        solids=shell+m.Manifold.batch_boolean(extra,m.OpType.Add)
        candidates=[]
        normalized,proof=components_without_zero_area_bridges(box-solids)
        print('NORMALIZATION',proof,flush=True)
        for component in normalized:
            print('COMP',component.volume(),component.bounding_box(),flush=True)
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
    path=ROOF/'closure-regions-a010.json'
    if path.exists():assert json.loads(path.read_text())==report
    else:path.write_text(json.dumps(report,indent=2)+'\n')
