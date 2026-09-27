"""Review-only routes: published catalog and live database are untouched."""
from pathlib import Path
import json,struct
root=Path(__file__).resolve().parents[2];out=root/'.runtime/art-library/hull/r001';dest=root/'output/playwright/hull'
content=json.dumps({'asset':{'version':'2.0'},'scene':0,'scenes':[{'nodes':[]}],'nodes':[]}).encode();content+=b' '*((-len(content))%4)
(out/'empty.glb').write_bytes(struct.pack('<III',0x46546c67,2,20+len(content))+struct.pack('<II',len(content),0x4e4f534a)+content)
paths={name:str(out/name) for name in ['catalog.json','catalog.voxels.json','wayfarer.json']};paths['parts.glb']=str(out/'empty.glb')
script='''async (page) => {
 await page.unrouteAll({behavior:'wait'});
 const paths=PATHS;
 for(const [name,path] of Object.entries(paths))await page.route('**/assets/assembly/'+name,r=>r.fulfill({path,contentType:name.endsWith('.json')?'application/json':'model/gltf-binary'}));
 await page.route('**/assets/assembly/hull-review/**',r=>r.fulfill({path:BASE+'/'+r.request().url().split('/hull-review/')[1].split('?')[0],contentType:r.request().url().endsWith('.png')?'image/png':'model/gltf-binary'}));
 await page.route('**/packages/render/src/assembly-editor.ts*',async route=>{
 const response=await route.fetch();let body=await response.text();if(!body.includes('scene.useRightHandedSystem'))throw Error('Scene hook changed');
 body=body.replace('scene.useRightHandedSystem','window.__hullReviewScene = scene; scene.useRightHandedSystem');await route.fulfill({response,body});});
 await page.goto('http://localhost:5174/shipyard');await page.evaluate(()=>localStorage.removeItem('sidereal.assembly.draft.v1'));await page.reload();
 await page.getByText('Select a part to inspect or move it',{exact:true}).waitFor({timeout:90000});
 await page.waitForFunction(()=>window.__hullReviewScene?.meshes.some(m=>m.name.includes('pilot-review')),{},{timeout:90000});
 await page.evaluate(()=>{const s=window.__hullReviewScene,c=s.activeCamera;c.lowerRadiusLimit=2;c.radius=29;c.alpha=-2.25;c.target.set(0,1.2,-7);s.render();});
 await page.screenshot({path:BASE+'/runtime-close.png',timeout:90000});
 const stats=await page.evaluate(()=>{const s=window.__hullReviewScene,c=s.activeCamera;return {camera:{alpha:c.alpha,beta:c.beta,radius:c.radius,target:c.target.asArray()},meshes:s.meshes.filter(m=>m.name.includes('pilot-review')).map(m=>({name:m.name,indices:m.getTotalIndices(),visible:m.isVisible,enabled:m.isEnabled()})),materials:s.materials.map(m=>({name:m.name,normal:!!m.bumpTexture,base:!!m.albedoTexture,alpha:m.alpha,emission:m.emissiveColor?.asArray()})),viewport:[innerWidth,innerHeight],url:location.href};});
 return stats;
}'''.replace('PATHS',json.dumps(paths)).replace('BASE',json.dumps(str(out)))
(dest/'capture.js').write_text(script)
