async page => {
  const source='/root/sidereal_spacetime/.runtime/shipyard-completion/armor-block-kit-20260914/browser-work';
  const out='/root/sidereal_spacetime/assets/art-library/framed-wayfarer/r005/browser/final-02';
  await page.goto('about:blank'); await page.unrouteAll({behavior:'ignoreErrors'});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/assets/**',route=>{
    const rel=route.request().url().split('/assets/')[1].split('?')[0];
    if(!/^[\w/.-]+$/.test(rel)||rel.includes('..'))return route.abort();
    return route.fulfill({path:'/root/wayfarer-framed-r001-candidate/assets/runtime/'+rel});
  });
  await page.route('**/__armor-review/**',route=>{
    const rel=route.request().url().split('/__armor-review/')[1].split('?')[0];
    if(!/^[\w/.-]+$/.test(rel)||rel.includes('..'))return route.abort();
    return route.fulfill({path:source+'/'+rel,contentType:rel.endsWith('.html')?'text/html':rel.endsWith('.js')?'application/javascript':'application/json'});
  });
  await page.route('**/__armor-native/**',route=>{
    const rel=route.request().url().split('/__armor-native/')[1].split('?')[0];
    if(!/^[\w/.-]+$/.test(rel)||rel.includes('..'))return route.abort();
    return route.fulfill({path:'/root/sidereal_spacetime/assets/art-library/framed-wayfarer/r005/library-02/'+rel});
  });
  await page.setViewportSize({width:1400,height:950});
  const captures=[];
  for(const assembly of ['heights','bulkheads','directions-32','junction-registry']){
    await page.goto('https://sidereal.tail7a58a6.ts.net:8445/__armor-review/index.html?assembly='+assembly);
    await page.waitForFunction(()=>window.review?.ready,undefined,{timeout:60000});
    const list=assembly==='wayfarer'?[['concept','whole'],['starboard','whole'],['bow','whole'],['joined','whole'],['gameplay','whole'],['top','whole'],['concept','backing'],['concept','finish'],['exploded','exploded'],['concept','bare']]:assembly==='alternate-station'?[['alternate','whole'],['top','backing']]:[['fixture','whole']];
    for(const [name,mode] of list){
      const metrics=await page.evaluate(([name,mode])=>{window.review.views.fixture[0]=1.15;return window.review.view(name,mode);},[name,mode]);
      const file=assembly+'-front-'+mode;
      await page.screenshot({path:out+'/'+file+'.png',timeout:60000});captures.push({file,...metrics});
    }
  }
  return {captures,errors,scope:'Exact native GLBs in game-renderer review. Qualified old document loads unchanged; old armor is filtered and equipment is rigidly repositioned for private review only. No live or authority qualification.'};
}
