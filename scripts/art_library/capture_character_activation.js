async(page)=>{
 const paint=async()=>{await page.waitForTimeout(70);await page.evaluate(()=>{const u=window.__characterUI;u.invalidate();u.paint();});};
 const click=async id=>{await paint();const p=await page.evaluate(id=>{const u=window.__characterUI,h=u.hits.find(h=>h.id===id||h.label.startsWith(id));if(!h)throw Error('Missing '+id);return{x:(h.rect.x+h.rect.w/2)*u.scale,y:(h.rect.y+h.rect.h/2)*u.scale};},id);await page.mouse.click(p.x,p.y);await paint();};
 await click('equip-item');
 await page.waitForFunction(()=>{const u=window.__characterUI;u.invalidate();u.paint();return !u.hits.some(h=>h.id.startsWith('item-inventory-')&&h.label.startsWith('Survey scanner'));},{},{polling:150,timeout:15000});
 await page.keyboard.press('i');await paint();await page.keyboard.press('Digit1');
 await page.waitForFunction(()=>{const u=window.__characterUI;u.invalidate();u.paint();return u.hits.some(h=>h.id==='tool-0'&&!h.disabled);},{},{polling:150,timeout:15000});
 await page.keyboard.press('c');await paint();
 await page.waitForFunction(()=>{const u=window.__characterUI;u.invalidate();u.paint();return u.hits.some(h=>h.id==='equip-slot-hand'&&h.label.includes('Frontier carbine'));},{},{polling:150,timeout:15000});
 const hand=await page.evaluate(()=>window.__characterUI.hits.find(h=>h.id==='equip-slot-hand')?.label);
 await page.keyboard.press('c');await paint();await page.keyboard.press('i');await paint();
 const points=await page.evaluate(()=>{const u=window.__characterUI;return ['Power cell','quick-slot-1'].map(id=>{const h=u.hits.find(h=>h.id===id||h.label.startsWith(id));return{x:(h.rect.x+h.rect.w/2)*u.scale,y:(h.rect.y+h.rect.h/2)*u.scale};});});
 await page.mouse.move(points[0].x,points[0].y);await page.mouse.down();await page.mouse.move(points[1].x,points[1].y,{steps:12});await page.mouse.up();await paint();
 const quick=await page.evaluate(()=>window.__characterUI.hits.find(h=>h.id==='quick-slot-1')?.label);
 await page.keyboard.press('i');await paint();await page.keyboard.press('Digit0');await paint();
 const inspected=await page.evaluate(()=>window.__characterUI.hits.find(h=>h.id==='selected-item-surface')?.label);
 if(inspected!=='Power cell')throw Error('Quick-slot drop/0 inspection failed');
 return {equippedScannerThroughUI:true,Digit1Restored:hand,draggedQuickSlot:quick,Digit0Inspected:inspected};
}
