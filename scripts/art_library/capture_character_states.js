async(page)=>{
 const paint=async()=>{await page.waitForTimeout(60);return page.evaluate(()=>{const u=window.__characterUI;u.invalidate();u.paint();});};
 const point=async id=>page.evaluate(id=>{const u=window.__characterUI,h=u.hits.find(h=>h.id===id);if(!h)throw Error('Missing '+id);return{x:(h.rect.x+h.rect.w/2)*u.scale,y:(h.rect.y+h.rect.h/2)*u.scale};},id);
 const click=async id=>{const p=await point(id);await page.mouse.click(p.x,p.y);await paint();};
 const frame=async()=>{await paint();return page.evaluate(()=>{const s=window.__characterScene,e=s.getEngine();if(e._activeRenderLoops.length)e._renderLoop();else s.render();return {aria:document.querySelector('canvas').getAttribute('aria-description'),rotation:window.__portraitScene?.getTransformNodeByName('portrait-display-pivot')?.rotation.y};});};
 const shot=async name=>{await frame();await page.screenshot({path:'/root/sidereal_spacetime/output/playwright/character-ui/r002-'+name+'.png',timeout:60000});};
 const evidence=[];evidence.push({initial:await frame()});await shot('character-live');
 const p=await point('character-rotate');await page.mouse.move(p.x,p.y);await page.mouse.down();await page.mouse.move(p.x+100,p.y,{steps:8});await page.mouse.up();await paint();
 evidence.push({drag:await frame()});await shot('character-rotated');
 await click('character-stat-Combat');await shot('combat-stats');
 await click('character-stat-Resists');await shot('resist-stats');
 await click('character-stat-Overview');
 await click('menu');
 evidence.push({menu:await page.evaluate(()=>window.__characterUI.hits.map(h=>({id:h.id,label:h.label,rect:h.rect})))});
 return evidence;
}
