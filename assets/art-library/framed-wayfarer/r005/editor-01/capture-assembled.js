async (page) => {
  await page.waitForFunction(() => [...document.querySelectorAll('canvas')].some(c => c.dataset.placements === c.dataset.expectedPlacements && Number(c.dataset.placements) > 70));
  const evidence = await page.evaluate(async () => {
    const source=await (await fetch('/@fs/root/sidereal_spacetime/packages/render/src/layout-hull.ts')).text();
    const url=source.match(/import \{ Engine \} from "([^"]+)"/)[1];
    const {Engine}=await import(url);
    const scene=Engine.Instances.flatMap(e=>e.scenes).find(s=>s.activeCamera?.name==='hull-editor-camera');
    window.armorEvidenceScene=scene;
    const camera=scene.activeCamera, engine=scene.getEngine();
    camera.alpha=-2.75;camera.beta=.955;camera.radius=42;camera.target.set(0,1,-1);
    const times=[];
    for(let i=0;i<20;i++){engine._drawCalls.fetchNewFrame();const t=performance.now();engine.beginFrame();scene.render();engine.endFrame();if(i>=5)times.push(performance.now()-t);await new Promise(r=>requestAnimationFrame(r));}
    times.sort((a,b)=>a-b);
    return window.armorLastEvidence = {camera:{alpha:camera.alpha,beta:camera.beta,radius:camera.radius,target:camera.target.asArray()},draws:engine._drawCalls.current,renderCpuMedianMs:times[7],samples:times.length,canvases:document.querySelectorAll('canvas').length,parts:engine.getRenderingCanvas().dataset.placements};
  });
  await page.screenshot({path:'output/playwright/armor-editor-r005/assembled.png'});
  return evidence;
}
