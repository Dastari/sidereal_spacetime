async (page) => {
  await page.route('**/packages/render/src/character-preview.ts*',async route=>{
    const response=await route.fetch();let body=await response.text();
    body=body.replace('scene.useRightHandedSystem = true;', 'window.__portraitScene=scene; window.__portraitCanvas=canvas; scene.useRightHandedSystem = true;');
    await route.fulfill({response,body});
  });
  await page.keyboard.press('c');
  await page.waitForFunction(()=>{
    const ui=window.__characterUI;ui.invalidate();ui.paint();
    return !!window.__portraitScene&&window.__portraitScene.meshes.some(m=>m.name.startsWith('GEO-'))&&window.__portraitScene.isReady();
  },{},{polling:150,timeout:90000});
  await page.evaluate(()=>{
    const s=window.__characterScene,ui=window.__characterUI;s.getEngine().stopRenderLoop();
    ui.invalidate();ui.paint();s.render();
  });
  await page.screenshot({path:'/root/sidereal_spacetime/output/playwright/character-ui/r001-character-desktop.png',timeout:60000});
  return page.evaluate(()=>({
    hits:window.__characterUI.hits.map(h=>({id:h.id,label:h.label,rect:h.rect,disabled:h.disabled})),
    portrait:{meshes:window.__portraitScene.meshes.length,width:window.__portraitCanvas.width,height:window.__portraitCanvas.height},
    world:document.querySelector('canvas').getAttribute('aria-description'),
  }));
}
