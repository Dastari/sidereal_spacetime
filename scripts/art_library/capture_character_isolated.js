// Dedicated browser routes select a real isolated DB. No client state is fabricated.
async(page)=>{
 await page.route('**/packages/net/src/index.ts*',async route=>{
  const response=await route.fetch();let body=await response.text();
  const matches=body.match(/\.withDatabaseName\([^)]*\)/g);
  if(matches?.length!==1)throw Error('Network database capture hook changed');
  body=body.replace(matches[0],'.withDatabaseName("sidereal-character-ui-review-20260908")');
  await route.fulfill({response,body});
 });
 const sockets=[];page.on('websocket',ws=>{if(ws.url().includes('/v1/'))sockets.push(ws.url().split('?')[0]);});
 await page.evaluate(()=>localStorage.removeItem('sidereal.lab.token'));
 await page.reload({waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>{const u=window.__characterUI;if(!u)return false;u.invalidate();u.paint();return u.hits.some(h=>h.id==='enter'&&!h.disabled);},{},{polling:150,timeout:60000});
 const enter=await page.evaluate(()=>{const u=window.__characterUI,h=u.hits.find(h=>h.id==='enter');return {x:(h.rect.x+h.rect.w/2)*u.scale,y:(h.rect.y+h.rect.h/2)*u.scale};});
 await page.mouse.click(enter.x,enter.y);
 await page.waitForFunction(()=>{const u=window.__characterUI;u.invalidate();u.paint();return u.hits.some(h=>h.id==='tool-0'&&!h.disabled);},{},{polling:150,timeout:60000});
 await page.keyboard.press('i');
 await page.waitForFunction(()=>{const u=window.__characterUI;u.invalidate();u.paint();return u.hits.some(h=>h.id.startsWith('inventory-item'));},{},{polling:150,timeout:30000}).catch(()=>{});
 return {sockets,ui:await page.evaluate(()=>({hits:window.__characterUI.hits.map(h=>({id:h.id,label:h.label,rect:h.rect,disabled:h.disabled})),aria:document.querySelector('canvas').getAttribute('aria-description')}))};
}
