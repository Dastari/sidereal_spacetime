async(page)=>{
 const paint=()=>page.evaluate(()=>{const u=window.__characterUI;u.invalidate();u.paint();});
 const hit=async id=>page.evaluate(id=>{const u=window.__characterUI,h=u.hits.find(h=>h.id===id||h.label.startsWith(id));if(!h)throw Error('Missing '+id);return{x:(h.rect.x+h.rect.w/2)*u.scale,y:(h.rect.y+h.rect.h/2)*u.scale};},id);
 const click=async id=>{const h=await hit(id);await page.mouse.click(h.x,h.y);await page.waitForTimeout(100);await paint();};
 await click('inventory-dismiss-error');
 await page.keyboard.press('c');await paint();await page.keyboard.press('i');await paint();
 await click('Frontier carbine');await click('tool-0');
 await page.waitForFunction(()=>{const u=window.__characterUI;u.invalidate();u.paint();return u.hits.some(h=>h.id==='tool-0'&&h.label.includes('Frontier carbine'));},{},{polling:150,timeout:15000});
 await click('equip-item');
 await page.waitForFunction(()=>{const u=window.__characterUI;u.invalidate();u.paint();return !u.hits.some(h=>h.id.startsWith('item-inventory-')&&h.label.startsWith('Frontier carbine'));},{},{polling:150,timeout:15000});
 await click('Survey scanner');await click('quick-slot-1');
 for(let i=0;i<3;i++){await page.evaluate(()=>{const u=window.__characterUI;u.invalidate();u.paint();window.__characterScene.render();});await page.waitForTimeout(150);}
 await page.screenshot({path:'/root/sidereal_spacetime/output/playwright/character-ui/r001-inventory.png',timeout:60000});
 return page.evaluate(()=>({hits:window.__characterUI.hits.filter(h=>!h.id.startsWith('slot-')).map(h=>({id:h.id,label:h.label,rect:h.rect,disabled:h.disabled})),aria:document.querySelector('canvas').getAttribute('aria-description')}));
}
