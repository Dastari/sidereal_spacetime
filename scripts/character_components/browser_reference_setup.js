async page=>{
 await page.context().grantPermissions(['local-network-access'],{origin:'https://sidereal.tail7a58a6.ts.net:8444'});
 // Keep staged art private: serve only this browser request from its exact local file.
 await page.route('**/assets/art-library/character-components/publications/r008/rollback-r002/modular-crew.glb', async route => {
   await route.fulfill({path:'/root/sidereal_spacetime/assets/art-library/character-components/publications/r008/rollback-r002/modular-crew.glb',contentType:'model/gltf-binary'});
 });
 await page.route('**/.runtime/character-reference/*/modular-crew.glb', async route => {
   const revision=route.request().url().match(/character-reference\/(r003-rendered|r00[4-8])\/modular-crew\.glb/)[1];
   await route.fulfill({path:'/root/sidereal_spacetime/.runtime/character-reference/'+revision+'/modular-crew.glb',contentType:'model/gltf-binary'});
 });
 await page.route('**/assets/art-library/assets/characters-weapons-items*/revisions/r000/reference.png', async route => {
   const id=route.request().url().split('/assets/art-library/assets/')[1].split('/')[0];
   if (!['characters-weapons-items--medic','characters-weapons-items-female--medic'].includes(id)) return route.abort();
   await route.fulfill({path:'/root/sidereal_spacetime/assets/art-library/assets/'+id+'/revisions/r000/reference.png',contentType:'image/png'});
 });
 await page.goto('https://sidereal.tail7a58a6.ts.net:8444/@fs/root/sidereal_spacetime/scripts/character_components/reference_review.html?revision=r008',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>!!window.__referenceStudy,{},{timeout:60000});
 await page.evaluate(()=>{for(const p of window.__referenceStudy.panes){p.engine.stopRenderLoop();p.scene.render();}});
 await page.waitForTimeout(250);await page.screenshot({path:'output/playwright/character-fidelity-r008-open.png'});
 return page.evaluate(()=>({revision:window.__referenceStudy.candidate,panes:window.__referenceStudy.panes.map(p=>({id:p.id,meshes:p.scene.meshes.length,ready:p.scene.isReady()}))}));
}
