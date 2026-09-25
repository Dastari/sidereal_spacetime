async(page)=>{
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.setViewportSize({width:700,height:580});await page.reload({waitUntil:'domcontentloaded'});
 const paint=async()=>{await page.waitForTimeout(70);await page.evaluate(()=>{const u=window.__characterUI;u.invalidate();u.paint();});};
 const click=async id=>{await paint();const p=await page.evaluate(id=>{const u=window.__characterUI,h=u.hits.find(h=>h.id===id||h.label.startsWith(id));if(!h)throw Error('Missing '+id);return{x:(h.rect.x+h.rect.w/2)*u.scale,y:(h.rect.y+h.rect.h/2)*u.scale};},id);await page.mouse.click(p.x,p.y);await paint();};
 const frame=async()=>{await paint();await page.evaluate(()=>{const s=window.__characterScene,e=s.getEngine();e.resize();if(e._activeRenderLoops.length)e._renderLoop();else s.render();});};
 const shot=async name=>{await frame();await page.screenshot({path:'/root/sidereal_spacetime/output/playwright/character-ui/r003-'+name+'.png',timeout:60000});};
 await page.waitForFunction(()=>{const u=window.__characterUI;if(!u)return false;u.invalidate();u.paint();return u.hits.some(h=>h.id==='tool-0'&&!h.disabled);},{},{polling:150,timeout:60000});
 await page.keyboard.press('c');await paint();
 await page.waitForFunction(()=>{const u=window.__characterUI,s=window.__characterScene;u.invalidate();u.paint();s.getEngine()._renderLoop();return s.isReady()&&u.layer._drawWrapper?.effect?.isReady()&&window.__portraitScene?.isReady()&&window.__portraitScene.meshes.some(m=>m.name.startsWith('GEO-'));},{},{polling:350,timeout:60000});
 await shot('compact-character');
 const compact=await page.evaluate(()=>({aria:document.querySelector('canvas').getAttribute('aria-description'),hits:window.__characterUI.hits.filter(h=>h.id.startsWith('character')||h.id==='selected-item-surface').map(h=>({id:h.id,rect:h.rect})),rotation:window.__portraitScene.getTransformNodeByName('portrait-display-pivot').rotation.y}));
 await click('character-turn-right');await shot('compact-rotated');
 const rotation=await page.evaluate(()=>window.__portraitScene.getTransformNodeByName('portrait-display-pivot').rotation.y);
 await page.mouse.move(450,325);await page.mouse.wheel(0,610);await paint();await shot('compact-stats');
 await page.keyboard.press('c');await paint();await page.keyboard.press('Digit9');await paint();
 await click('selected-item-close');
 const dismissed=await page.evaluate(()=>!window.__characterUI.hits.some(h=>h.id==='selected-item-surface'));
 if(!dismissed)throw Error('Item details did not dismiss');
 await click('Survey scanner');await page.keyboard.press('i');await paint();await page.keyboard.press('c');await paint();
 const cleared=await page.evaluate(()=>!window.__characterUI.hits.some(h=>h.id==='selected-item-surface'));
 if(!cleared)throw Error('Old selection leaked into fresh character window');
 await page.keyboard.press('c');await paint();await page.setViewportSize({width:1920,height:1080});await frame();
 await click('menu');await click('scale-1.35');await click('close');
 await page.keyboard.press('c');await paint();await shot('character-desktop');
 await page.keyboard.press('c');await paint();await page.keyboard.press('i');await paint();await click('Survey scanner');await shot('inventory');
 return {compact,manualRotation:rotation,dismissed,cleared,final:await page.evaluate(()=>({aria:document.querySelector('canvas').getAttribute('aria-description'),details:window.__characterUI.hits.filter(h=>h.id==='selected-item-surface'||h.id==='selected-item-close'||h.id.startsWith('tool-')||h.id.startsWith('quick-slot-')).map(h=>({id:h.id,label:h.label})),portraitContexts:window.__portraitScene.getEngine().isDisposed}))};
}
