async(page)=>{
 const paint=async()=>{await page.waitForTimeout(70);await page.evaluate(()=>{const u=window.__characterUI;u.invalidate();u.paint();});};
 const click=async id=>{await paint();const p=await page.evaluate(id=>{const u=window.__characterUI,h=u.hits.find(h=>h.id===id);if(!h)throw Error('Missing '+id);return{x:(h.rect.x+h.rect.w/2)*u.scale,y:(h.rect.y+h.rect.h/2)*u.scale};},id);await page.mouse.click(p.x,p.y);await paint();};
 const frame=async()=>{await paint();await page.evaluate(()=>{const s=window.__characterScene,e=s.getEngine();e.resize();if(e._activeRenderLoops.length)e._renderLoop();else s.render();});};
 const shot=async name=>{await frame();await page.screenshot({path:'/root/sidereal_spacetime/output/playwright/character-ui/r002-'+name+'.png',timeout:60000});};
 await click('motion');await click('close');await frame();await frame();
 const reduced=await page.evaluate(()=>{window.__motionCheck=window.__portraitCanvas.toDataURL();return window.__motionCheck.length;});
 await page.waitForTimeout(800);await frame();
 const staticStable=await page.evaluate(()=>window.__motionCheck===window.__portraitCanvas.toDataURL());
 if(!staticStable)throw Error('Reduced motion portrait changed without user input');
 await shot('reduced-motion');await click('character-turn-left');await frame();
 const manualTurnChanged=await page.evaluate(()=>window.__motionCheck!==window.__portraitCanvas.toDataURL());
 if(!manualTurnChanged)throw Error('Reduced motion disabled requested portrait rotation');
 await page.keyboard.press('c');await paint();await shot('hud');
 await page.keyboard.press('Digit9');await paint();await shot('inventory-quick-inspect');
 const quickInspection=await page.evaluate(()=>window.__characterUI.hits.find(h=>h.id==='selected-item-surface')?.label);
 await page.keyboard.press('i');await paint();
 // Use actual UI scale preference before the smaller viewport.
 await click('menu');await click('scale-1');await click('close');
 await page.setViewportSize({width:700,height:580});await frame();
 await page.keyboard.press('c');await paint();await shot('compact-character');
 const p=await page.evaluate(()=>{const u=window.__characterUI,h=u.hits.find(h=>h.id==='character-surface');return{x:(h.rect.x+h.rect.w*.75)*u.scale,y:(h.rect.y+h.rect.h*.7)*u.scale};});
 await page.mouse.move(p.x,p.y);await page.mouse.wheel(0,610);await paint();await shot('compact-stats');
 return {reducedMotion:{staticStable,manualTurnChanged,dataUrlLength:reduced},quickInspection,compact:await page.evaluate(()=>({viewport:[innerWidth,innerHeight],scale:window.__characterUI.scale,hits:window.__characterUI.hits.filter(h=>!h.id.startsWith('slot-')).map(h=>({id:h.id,label:h.label,rect:h.rect})),panels:window.__characterUI.panels}))};
}
