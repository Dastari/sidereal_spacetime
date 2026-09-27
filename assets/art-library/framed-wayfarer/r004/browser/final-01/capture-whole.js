async page => {
  const source='/root/sidereal_spacetime/.runtime/shipyard-completion/armor-geometry-pass-20260914/final-01-review';
  const out='/root/sidereal_spacetime/assets/art-library/framed-wayfarer/r004/browser/final-01';
  await page.goto('about:blank'); await page.unrouteAll({behavior:'ignoreErrors'});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/assets/**',route=>{
    const rel=route.request().url().split('/assets/')[1].split('?')[0];
    if(!/^[\w/.-]+$/.test(rel)||rel.includes('..'))return route.abort();
    return route.fulfill({path:'/root/wayfarer-framed-r001-candidate/assets/runtime/'+rel});
  });
  await page.route('**/__armor-review/**',route=>{
    const rel=route.request().url().split('/__armor-review/')[1].split('?')[0];
    return route.fulfill({path:source+'/'+rel,contentType:rel.endsWith('.html')?'text/html':rel.endsWith('.js')?'application/javascript':'application/json'});
  });
  await page.route('**/__armor-native/**',route=>{const rel=route.request().url().split('/__armor-native/')[1].split('?')[0]; if(!/^[\w/.-]+$/.test(rel)||rel.includes('..'))return route.abort(); return route.fulfill({path:'/root/sidereal_spacetime/assets/art-library/framed-wayfarer/r004/library-01/'+rel});});
  await page.setViewportSize({width:1400,height:950});
  await page.goto('https://sidereal.tail7a58a6.ts.net:8445/__armor-review/index.html?mode=whole');
  await page.waitForFunction(()=>window.review?.ready,undefined,{timeout:60000});
  const captures=[];
  for(const name of ['concept','starboard','bow','joined','gameplay']){
    const metrics=await page.evaluate(name=>window.review.view(name),name);
    await page.screenshot({path:out+'/'+name+'.png',timeout:60000});captures.push({name,...metrics});
  }
  return {captures,errors,scope:'Final01 complete28nativeplacements; zero fallback or missing required models; exact game-loader pure fixture; no authenticated gameplay or live authority'};
}
