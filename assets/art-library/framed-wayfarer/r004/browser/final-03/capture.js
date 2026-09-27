async page => {
  const source='/root/sidereal_spacetime/.runtime/shipyard-completion/armor-geometry-pass-20260914/final-03-review';
  const out='/root/sidereal_spacetime/assets/art-library/framed-wayfarer/r004/browser/final-03';
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
    return route.fulfill({path:'/root/sidereal_spacetime/assets/art-library/framed-wayfarer/r004/library-03/'+rel});
  });
  await page.setViewportSize({width:1400,height:950});
  const captures=[];
  for(const mode of ['whole','armor','bare','exploded']){
    await page.goto('https://sidereal.tail7a58a6.ts.net:8445/__armor-review/index.html?mode='+mode);
    await page.waitForFunction(()=>window.review?.ready,undefined,{timeout:60000});
    for(const name of (mode==='whole'?['concept','starboard','bow','joined','gameplay']:['concept'])){
      const metrics=await page.evaluate(name=>window.review.view(name),name);
      const file=mode==='whole'?name:mode;
      await page.screenshot({path:out+'/'+file+'.png',timeout:60000});captures.push({file,...metrics});
    }
  }
  return {captures,errors,scope:'Final03 complete native family using exact game construction loader and private qualified fixture. Armor/bare/exploded are explicit inspection modes. No authenticated gameplay or live authority.'};
}
