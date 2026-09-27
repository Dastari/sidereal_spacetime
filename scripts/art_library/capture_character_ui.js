// Actual client inspection in a dedicated Playwright session; no data replacement.
async (page) => {
  await page.setViewportSize({width:1920,height:1080});
  await page.addInitScript(()=>{
    window.__reviewRAF=window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame=()=>0;
  });
  await page.route('**/packages/canvas-ui/src/toolkit.ts*',async route=>{
    const response=await route.fetch();let body=await response.text();
    if(!body.includes('this.layer ='))throw Error('CanvasUI capture hook changed');
    body=body.replace('this.layer =','window.__characterUI = this; window.__characterScene = scene; this.layer =');
    await route.fulfill({response,body});
  });
  await page.routeWebSocket('**/?token=*',ws=>ws.close());
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://sidereal.tail7a58a6.ts.net:5173/',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>!!window.__characterUI,{}, {timeout:90000,polling:100});
  return page.evaluate(()=>{
    const ui=window.__characterUI,s=window.__characterScene;s.getEngine().stopRenderLoop();ui.invalidate();ui.paint();
    return {url:location.href,hits:ui.hits.map(h=>({id:h.id,label:h.label,rect:h.rect})),scale:ui.scale,sceneMeshes:s.meshes.length};
  });
}
