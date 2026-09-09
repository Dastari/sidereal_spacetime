import json,struct,math,sys,hashlib
from pathlib import Path
import numpy as np
src=Path('.runtime/construction-boundary-kit/r004/validate_family.py').read_text();exec(src[src.index('class GLB:'):src.index('kit=GLB(')])
P=Path(sys.argv[1]);base=GLB('assets/art-library/designs/shipyard.structure.boundary-kit/revisions/r001/kit.glb');groups=next(g for n,g in base.meshes()if n=='GEO-door-frame-2m--surface');tris=np.concatenate([g['tris']for g in groups]);result=[]
for x,sign in [(.0625,-1),(1.9375,1)]:
 t=tris[np.max(abs(tris[:,:,0]-x),axis=1)<1e-7];area=float(np.linalg.norm(np.cross(t[:,1]-t[:,0],t[:,2]-t[:,0]),axis=1).sum()/2);expected=.09375*2.8125;result.append({'planeX':x,'normal':[sign,0,0],'actualTriangleAreaM2':area,'expectedM2':expected,'pass':abs(area-expected)<1e-7,'triangleCount':len(t)})
r={'dependencyRevision':'r001','dependencyGlbSha256':hashlib.sha256(base.bytes).hexdigest(),'selector':'GEO-door-frame-2m--surface','nominalSpanUnits':[64,0],'requiredStartNodeCutbackM':.0625,'requiredEndNodeCutbackM':.0625,'nativePortChecks':result,'pass':all(x['pass']for x in result),'limits':['Only compatible with r004 node ports at exact .0625m cutbacks and .09375m core width, floor6/ceiling96.','Opening reservation remains exact40units wide, centered in64unit native frame, authored direction and swing rules unchanged.','Frame/leaf/gasket runtime and pressure acceptance remain independently required.']};(P/'r001-door-compatibility.json').write_text(json.dumps(r,indent=2)+'\n');print(json.dumps(r,indent=2));raise SystemExit(0 if r['pass']else 1)
