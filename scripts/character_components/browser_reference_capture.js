async page => {
 const revision=await page.evaluate(()=>window.__referenceStudy.candidate);
 const records=[];
 const capture=async(name,state,whole=true)=>{
  await page.evaluate(s=>window.__referenceStudy.set(s),state);
  await page.waitForTimeout(220);
  const path='output/playwright/character-fidelity-'+revision+'-'+name+'.png';
  if(whole) await page.screenshot({path}); else await page.locator('#candidate').screenshot({path});
  records.push({name,path,state});
 };
 const bodyFilter=await page.evaluate(()=>window.__captureBody??'female');
 for (const body of [bodyFilter]) {
  await capture(body+'-open',{body,look:'open',hair:body==='female'?'ponytail':'swept',clip:'Idle',azimuth:.38,lighting:'portrait'});
  await capture(body+'-reference-stance',{clip:'Reference',azimuth:-.52,lighting:'reference'});
  await capture(body+'-sealed',{look:'sealed',clip:'Idle',azimuth:.38,lighting:'portrait'});
  for(const clip of ['Walk','Sprint','Seated','Idle-Rifle','Idle-Pistol']) await capture(body+'-'+clip,{clip},false);
  for(const hair of ['swept','crest','ponytail']) await capture(body+'-base-'+hair,{look:'bare',hair,clip:'Idle'},false);
  await capture(body+'-rear',{look:'open',hair:'ponytail',azimuth:2.65},false);
  await page.evaluate(()=>{for(const p of window.__referenceStudy.panes){p.scene.clearColor.set(.55,.59,.65,1);for(const l of p.scene.effectLayers)l.isEnabled=false;}});
  await capture(body+'-hair-rear-light',{azimuth:2.65},false);
  await page.evaluate(()=>{for(const p of window.__referenceStudy.panes)p.scene.clearColor.set(.019,.034,.066,1);});
  await capture(body+'-no-bloom',{azimuth:-.52},false);
  for(const h of [256,128]) {
   await page.evaluate(h=>{for(const p of window.__referenceStudy.panes){const w=Math.round(h*400/560),c=document.getElementById(p.id);c.style.width=w+'px';c.style.height=h+'px';p.engine.setSize(w,h);p.scene.render();}},h);
   await capture(body+'-open-'+h,{},false);
  }
  await page.evaluate(()=>{for(const p of window.__referenceStudy.panes){const c=document.getElementById(p.id);c.style.width='400px';c.style.height='560px';p.engine.setSize(400,560);}});
 }
 await page.evaluate(()=>{for(const p of window.__referenceStudy.panes){p.camera.beta=.08;p.camera.alpha=-Math.PI/2;}});
 await capture(bodyFilter+'-runtime-top',{body:'female',look:'sealed',clip:'Idle'},false);
 await page.evaluate(()=>{for(const p of window.__referenceStudy.panes){p.camera.beta=1.31;p.camera.alpha=-Math.PI/2+.19;}});
 await capture(bodyFilter+'-final-comparison',{body:bodyFilter,look:bodyFilter==='female'?'open':'sealed',hair:'ponytail',clip:'Reference',azimuth:-.52,lighting:'reference'});
 return {revision,records,renderer:'Actual Chromium WebGL2 Babylon createCrewVisual; isolated review harness, not live inventory or ship.',viewport:{width:1440,height:1000},camera:{orthoTop:1.17,orthoBottom:-1.17,target:[0,1.01,0],beta:1.31,alpha:-Math.PI/2+.19},lights:'same HDR and portrait key/fill as production; explicit reference-blue comparison; no-bloom and light-background shots separately labeled',ownerFinalSignoff:null};
}
