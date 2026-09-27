"""Create actual Shipyard browser routes; no asset publication or live mutations."""
from pathlib import Path
import json,struct,hashlib,sys
ROOT=Path(__file__).resolve().parents[2];REV=sys.argv[1] if len(sys.argv)>1 else 'r001';OUT=ROOT/'.runtime/art-library/cargo'/REV;PW=ROOT/'output/playwright'/('cargo' if REV=='r001' else 'cargo-'+REV);PW.mkdir(exist_ok=True)
jobs=json.loads((OUT/'jobs.json').read_text());ready=[j for j in jobs if (Path(j['output'])/'glb.glb').exists()]
assets=[];parts=[]
for j in ready:
 d=Path(j['output']);b=json.loads((d/'validation-blender.json').read_text())['bounds_m'];sha=hashlib.sha256((d/'glb.glb').read_bytes()).hexdigest()
 assets.append({'id':j['asset_id'],'label':j['slug']+' | UNSIGNED '+REV,'category':'cargo','nodes':[],'bounds':b,'lights':[],'visual':{'url':'/assets/assembly/cargo-review/'+j['slug']+'/glb.glb','sha256':sha,'designId':j['design_id'],'revision':int(REV[1:]),'bounds':b,'damagePreview':'unsupported'}})
 parts.append({'id':'cargo-review-'+j['slug'],'assetId':j['asset_id'],'position':[0,0,0],'rotation':0,'flipped':False,'removedCells':[]})
(OUT/'catalog.json').write_text(json.dumps({'schema':'sidereal.part-catalog.v1','assets':assets}));(OUT/'wayfarer.json').write_text(json.dumps({'schema':'sidereal.assembly-draft.v1','id':'cargo-review','name':'Unsigned cargo review','parts':parts}));(OUT/'catalog.voxels.json').write_text(json.dumps({'schema':'sidereal.part-volumes.v1','palette':[],'volumes':{}}))
content=json.dumps({'asset':{'version':'2.0'},'scene':0,'scenes':[{'nodes':[]}],'nodes':[]}).encode();content+=b' '*((-len(content))%4);(OUT/'empty.glb').write_bytes(struct.pack('<III',0x46546c67,2,20+len(content))+struct.pack('<II',len(content),0x4e4f534a)+content)
paths={n:str(OUT/n) for n in ['catalog.json','wayfarer.json','catalog.voxels.json']};paths['parts.glb']=str(OUT/'empty.glb')
setup='''async(page)=>{
 await page.unrouteAll({behavior:'wait'});
 for(const [name,path] of Object.entries(PATHS))await page.route('**/assets/assembly/'+name,r=>r.fulfill({path,contentType:name.endsWith('.json')?'application/json':'model/gltf-binary'}));
 await page.route('**/assets/assembly/cargo-review/**',r=>r.fulfill({path:BASE+'/'+r.request().url().split('/cargo-review/')[1].split('?')[0],contentType:'model/gltf-binary'}));
 await page.route('**/packages/render/src/assembly-editor.ts*',async route=>{const response=await route.fetch();let body=await response.text();if(!body.includes('scene.useRightHandedSystem'))throw Error('Hook changed');body=body.replace('scene.useRightHandedSystem','window.__cargoScene=scene; scene.useRightHandedSystem');await route.fulfill({response,body});});
 await page.goto('http://localhost:5174/shipyard');await page.evaluate(()=>localStorage.removeItem('sidereal.assembly.draft.v1'));await page.reload();
 await page.getByText('Select a part to inspect or move it',{exact:true}).waitFor({timeout:90000});
 await page.waitForFunction(()=>window.__cargoScene?.transformNodes.filter(n=>n.name.startsWith('placement-cargo-review-')).length===COUNT,{},{timeout:90000});
 return {url:page.url(),count:COUNT};
}'''.replace('PATHS',json.dumps(paths)).replace('BASE',json.dumps(str(OUT))).replace('COUNT',str(len(ready)))
(PW/'setup.js').write_text(setup)
for j in ready:
 d=Path(j['output']);w,dep,h=j['specification']['dimensions_m'];radius=max(w,dep,h)*2.8+.9
 script='''async(page)=>{
 await page.waitForFunction(()=>window.__cargoScene?.isReady(),{},{timeout:90000});
 const stats=await page.evaluate(({slug,height,radius})=>{const s=window.__cargoScene,e=s.getEngine(),c=s.activeCamera;e.stopRenderLoop();
 for(const n of s.transformNodes)if(n.name.startsWith('placement-cargo-review-'))n.setEnabled(n.name==='placement-cargo-review-'+slug);
 c.lowerRadiusLimit=.2;c.radius=radius;c.alpha=1.0;c.lowerBetaLimit=.0001;c.upperBetaLimit=Math.PI/2;c.beta=.955316618;c.target.set(0,height*.49,0);s.render();
 const selected=s.meshes.filter(m=>m.name.startsWith('cargo-review-'+slug+'--'));if(!selected.length||selected.some(m=>!m.isEnabled()))throw Error('Missing visible review geometry');
 return {url:location.href,camera:{alpha:c.alpha,beta:c.beta,radius:c.radius,target:c.target.asArray()},renderer:e.webGLVersion,viewport:[innerWidth,innerHeight],visibleMeshes:selected.length,triangles:selected.reduce((a,m)=>a+m.getTotalIndices()/3,0),materials:[...new Set(selected.map(m=>m.material?.name))]};},PARAM);
 await page.screenshot({path:CLOSE,timeout:90000});
 await page.evaluate(()=>{const s=window.__cargoScene;s.activeCamera.beta=.0001;s.render();});await page.screenshot({path:TOP,timeout:90000});
 return stats;
}'''.replace('PARAM',json.dumps({'slug':j['slug'],'height':h,'radius':radius})).replace('CLOSE',json.dumps(str(d/'runtime-close.png'))).replace('TOP',json.dumps(str(d/'runtime-top.png')))
 (PW/(j['slug']+'.js')).write_text(script)
print('Capture scripts:',len(ready))
