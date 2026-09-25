async page=>{
 await page.route('**/@fs/root/sidereal_spacetime/assets/art-library/**',async route=>{
  const part=route.request().url().split('/assets/art-library/')[1];
  if(!part||part.includes('..')||!/[.](html|png|md|json)$/.test(part))return route.abort();
  await route.fulfill({path:'/root/sidereal_spacetime/assets/art-library/'+part});
 });
 await page.goto('https://sidereal.tail7a58a6.ts.net:8444/@fs/root/sidereal_spacetime/assets/art-library/character-components/calibration/index.html',{waitUntil:'domcontentloaded'});
 await page.waitForTimeout(800);await page.screenshot({path:'output/playwright/character-fidelity-r008-gallery.png'});
 return page.evaluate(()=>({title:document.title,figures:document.querySelectorAll('figure').length,firstImageLoaded:document.querySelector('img').naturalWidth>0}));
}
