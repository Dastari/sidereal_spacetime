"""Independent planar native boundary witnesses; does not allocate gas volume."""
import json
from shapely.geometry import Polygon,box,Point
from inspect_wayfarer_native_enclosure import inspect,ROOF

def run():
 shell=inspect(True);reports=[]
 for z in [.02,.1,.18,.20,.5,.98,1,1.02,1.2,1.24,1.25,1.28,1.31,1.35,1.5,1.8,2,2.3,2.5,2.59,2.61,2.625,2.64,2.66,2.68,2.69,2.72,2.8,2.9]:
  section=Polygon()
  for loop in shell.slice(z).to_polygons():section=section.symmetric_difference(Polygon(loop))
  free=box(-7,-11,15,15).difference(section);regions=list(free.geoms)if hasattr(free,'geoms')else[free];containing=[p for p in regions if p.covers(Point(0,11))];report={'heightM':z,'mainRegions':[{'areaM2':p.area,'boundsM':p.bounds,'outsideConnected':p.intersects(box(-7,-11,-6.9,15))}for p in containing]};reports.append(report);print(json.dumps(report),flush=True)
 return {'diagnosticOnly':True,'reports':reports}
if __name__=='__main__':
 r=run();(ROOF/'canopy-sections-a002.json').write_text(json.dumps(r,indent=2)+'\n')
