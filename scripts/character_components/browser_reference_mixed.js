async page=>{
 await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(()=>!!window.__referenceStudy,{}, {timeout:60000});await page.evaluate(()=>{for(const p of window.__referenceStudy.panes)p.engine.stopRenderLoop();});
 const records=[];
 for(const body of ['female','male']){
  await page.evaluate(body=>window.__referenceStudy.set({body,look:'mixed',hair:'swept',clip:'Walk',azimuth:-.52,lighting:'portrait'}),body);
  await page.waitForFunction(()=>window.__referenceStudy.panes.every(p=>p.scene.isReady()),{}, {timeout:30000});
  await page.evaluate(()=>window.__referenceStudy.apply());
  const path='output/playwright/character-fidelity-r008-'+body+'-mixed-fit.png';await page.screenshot({path});records.push({body,path});
 }
 return {records,equipment:'medic chest/visor/gloves/belt/boots/shoulders + captain helmet, engineer legs, recon backpack; selected swept hair is retained but hidden by the closed captain helmet',clip:'Walk',renderer:'Actual Chromium WebGL2 Babylon, isolated r008 harness; this sampled mixed set is not an exhaustive compatibility proof.'};
}
