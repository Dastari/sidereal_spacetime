async page => {
 const out='/root/sidereal_spacetime/assets/art-library/framed-wayfarer/r004/browser/final-01';
 const errors=[];page.on('pageerror',e=>errors.push(e.message));const captures=[];
 for(const mode of ['armor','bare','exploded']){
  await page.goto('https://sidereal.tail7a58a6.ts.net:8445/__armor-review/index.html?mode='+mode);
  await page.waitForFunction(()=>window.review?.ready,undefined,{timeout:60000});
  const metrics=await page.evaluate(()=>window.review.view('concept'));
  await page.screenshot({path:out+'/'+mode+'.png',timeout:60000});captures.push({mode,...metrics});
 }
 return {captures,errors,scope:'Exact native armor only, retained structure with armor hidden, and1.5m rigid exploded inspection offsets. Private pure fixture; no live state changes.'};
}
