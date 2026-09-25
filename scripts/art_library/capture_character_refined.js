async(page)=>{
 await page.reload({waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>{const u=window.__characterUI;if(!u)return false;u.invalidate();u.paint();return u.hits.some(h=>h.id==='tool-0'&&!h.disabled);},{},{polling:150,timeout:60000});
 await page.keyboard.press('c');
 await page.waitForFunction(()=>{const u=window.__characterUI;u.invalidate();u.paint();return window.__portraitScene?.isReady()&&window.__portraitScene.meshes.some(m=>m.name.startsWith('GEO-'));},{},{polling:150,timeout:60000});
 for(let i=0;i<3;i++){await page.evaluate(()=>{const u=window.__characterUI;u.invalidate();u.paint();window.__characterScene.render();});await page.waitForTimeout(200);}
 await page.screenshot({path:'/root/sidereal_spacetime/output/playwright/character-ui/r002-character-desktop.png',timeout:60000});
 return page.evaluate(()=>({hits:window.__characterUI.hits.map(h=>({id:h.id,label:h.label,rect:h.rect,disabled:h.disabled})),aria:document.querySelector('canvas').getAttribute('aria-description'),portrait:{size:[window.__portraitCanvas.width,window.__portraitCanvas.height],meshes:window.__portraitScene.meshes.length},worldMeshes:window.__characterScene.meshes.length}));
}
