// Run after clicking the long-left Add button in the dedicated review board.
async (page) => {
  const read=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('sidereal.assembly.draft.v1')).present);
  const added=await read();
  if(added.parts.length!==13)throw Error('Expected twelve originals and one new long triangle');
  const initial=added.parts.at(-1),id=initial.id;
  await page.getByRole('button',{name:'Rotate selected part (R)',exact:true}).click();
  await page.waitForFunction(({id,angle})=>JSON.parse(localStorage.getItem('sidereal.assembly.draft.v1')).present.parts.find(p=>p.id===id)?.rotation===angle,{id,angle:initial.rotation+Math.PI/2},{polling:100});
  const rotated=(await read()).parts.find(p=>p.id===id);
  if(Math.abs(rotated.rotation-initial.rotation-Math.PI/2)>1e-6)throw Error('Rotate did not apply a quarter turn');
  await page.getByRole('button',{name:'Flip selected part (F)',exact:true}).click();
  await page.waitForFunction(({id,before})=>JSON.parse(localStorage.getItem('sidereal.assembly.draft.v1')).present.parts.find(p=>p.id===id)?.flipped!==before,{id,before:initial.flipped},{polling:100});
  const flipped=(await read()).parts.find(p=>p.id===id);
  if(flipped.flipped===initial.flipped)throw Error('Flip did not change handedness');
  await page.evaluate(()=>{window.__floorScene.render();window.__floorScene.render();});
  await page.screenshot({path:'/root/sidereal_spacetime/output/playwright/floor-kit/ui-rotate-flip.png',timeout:60000});
  for(let i=0;i<3;i++)await page.getByRole('button',{name:'Undo',exact:true}).click();
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem('sidereal.assembly.draft.v1')).present.parts.length===12,{}, {polling:100});
  const restored=await read();
  if(restored.parts.length!==12||restored.parts.some(p=>p.id===id))throw Error('Undo did not restore the twelve-piece board');
  const top=await page.evaluate(()=>{
    const s=window.__floorScene,c=s.activeCamera;
    c.lowerBetaLimit=.0001;c.upperBetaLimit=Math.PI/2;c.beta=.0001;c.alpha=0;c.radius=43;c.target.set(8,.1,-5.5);
    s.render();s.render();return {alpha:c.alpha,beta:c.beta,radius:c.radius,target:c.target.asArray()};
  });
  await page.screenshot({path:'/root/sidereal_spacetime/output/playwright/floor-kit/runtime-board-top.png',timeout:60000});
  return {passed:true,initial,rotated,flipped,restoredCount:restored.parts.length,top,
    provenance:'Actual Shipyard Add, Rotate, Flip and Undo controls in isolated local draft. No reducer call or published catalog mutation.'};
}
