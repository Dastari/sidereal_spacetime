async (page) => {
 const height=page.getByRole('spinbutton',{name:'Component height',exact:true});
 const original=await height.inputValue();
 const id=await page.evaluate(()=>window.armorEvidencePick.id);
 await height.fill(String(Number(original)+.03125));await height.press('Tab');
 const moved=await height.inputValue();if(Math.abs(Number(moved)-Number(original)-.03125)>1e-8)throw Error('Height edit failed');
 await page.screenshot({path:'output/playwright/armor-editor-r005/selected-height.png'});
 await page.getByRole('button',{name:'Undo',exact:true}).click();
 if(await height.inputValue()!==original)throw Error('Undo failed');
 const pointer=await page.evaluate(()=>window.armorEvidencePick);
 await page.mouse.move(pointer.x,pointer.y);await page.keyboard.down('Shift');await page.mouse.down();await page.mouse.move(pointer.x,pointer.y-28,{steps:6});await page.mouse.up();await page.keyboard.up('Shift');
 const dragged=await height.inputValue();if(dragged===original)throw Error('Shift-height drag failed');
 await page.getByRole('button',{name:'Undo',exact:true}).click();
 if(await height.inputValue()!==original)throw Error('Shift-height undo failed');
 await height.fill(String(Number(original)+.0625));await height.press('Tab');
 await page.getByRole('button',{name:'Save draft',exact:true}).click();
 const beforeReload=await page.evaluate(()=>Object.entries(localStorage).filter(([k])=>k.startsWith('sidereal.layout.recovery.v1')));
 await page.reload();
 await page.waitForFunction(()=>[...document.querySelectorAll('canvas')].some(c=>c.dataset.placements==='84'),null,{timeout:30000});
 const restored=await page.evaluate(({id})=>{
  const all=Object.entries(localStorage).filter(([k])=>k.startsWith('sidereal.layout.recovery.v1')).map(([k,v])=>[k,JSON.parse(v)]);
  return all.flatMap(([key,v])=>{const d=v.history?.present;const p=d?.assembly?.parts?.find(p=>p.id===id);return p?[{key,name:d.name,height:p.position[2],sequence:v.sequence,past:v.history.past.length}]:[];});
 },{id});
 if(!restored.some(r=>r.height===Number(original)+.0625))throw Error('Saved height missing after reload');
 if(!(await page.getByRole('button',{name:'Publish',exact:true}).isDisabled()))throw Error('Unqualified publication enabled');
 await page.getByRole('button',{name:'Undo',exact:true}).click();
 await page.getByRole('button',{name:'Save draft',exact:true}).click();
 return {pickedId:id,originalHeight:original,editedHeight:moved,shiftDraggedHeight:dragged,reload:restored,savedDraftsBeforeReload:beforeReload.length,publishDisabled:true};
}
