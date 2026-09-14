import json, subprocess
from pathlib import Path
root=Path('/root/sidereal_spacetime');folder=root/'output/playwright/planet-reference-20260914/volcanic-moon-2-r005'
expression="""JSON.stringify({camera:{alpha:window.planetReview.camera.alpha,beta:window.planetReview.camera.beta,radius:window.planetReview.camera.radius},hits:[[633,538],[653,538],[626,568],[630,611],[563,650],[579,670],[477,631],[496,622],[453,779],[476,759],[414,145],[442,140],[330,162],[163,515]].map(([x,y])=>{const r=window.planetReview,h=r.scene.pick(x,y,m=>m.isEnabled()&&Boolean(m.metadata?.trianglePlacementRanges));const placement=h?.pickedMesh?.metadata?.trianglePlacementRanges.find(t=>h.faceId>=t.firstTriangle&&h.faceId<t.firstTriangle+t.triangleCount);return{x,y,hit:h?.hit,mesh:h?.pickedMesh?.name,face:h?.faceId,placement,point:h?.pickedPoint?.asArray()};})})"""
r=subprocess.run(['bash',str(root/'.agents/skills/playwright/scripts/playwright_cli.sh'),'-s=planet-art-recovery','eval',expression],cwd=root,capture_output=True,text=True,check=True)
(folder/'bank-placement-probe.log').write_text(r.stdout+r.stderr)
raw=r.stdout.split('### Result\n',1)[1];d=json.JSONDecoder().raw_decode(raw)[0];d=json.loads(d)if isinstance(d,str)else d
(folder/'bank-placement-probe.json').write_text(json.dumps(d,indent=2)+'\n');print(json.dumps(d))
