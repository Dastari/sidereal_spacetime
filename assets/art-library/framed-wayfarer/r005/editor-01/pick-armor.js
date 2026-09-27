async (page) => {
  await page.waitForFunction(() => [...document.querySelectorAll('canvas')].some(c => c.dataset.placements === '84' && Number(c.dataset.nativeWallPieces) > 160), null, {timeout:30000});
  const picked = await page.evaluate(async () => {
    const source=await (await fetch('/@fs/root/sidereal_spacetime/packages/render/src/layout-hull.ts')).text();
    const url=source.match(/import \{ Engine \} from "([^"]+)"/)[1];
    const {Engine}=await import(url);
    const scene=Engine.Instances.flatMap(e=>e.scenes).find(s=>s.activeCamera?.name==='hull-editor-camera');
    window.armorEvidenceScene=scene;
    const engine=scene.getEngine(),camera=scene.activeCamera,canvas=engine.getRenderingCanvas(),rect=canvas.getBoundingClientRect();
    camera.alpha=-2.75;camera.beta=.955;camera.radius=42;camera.target.set(0,1,-1);scene.render();
    for(const mesh of scene.meshes.filter(m=>m.metadata?.assetId?.startsWith('armor-block-') && m.isVisible && m.isEnabled())){
      mesh.computeWorldMatrix(true);
      const center=mesh.getBoundingInfo().boundingBox.centerWorld;
      const point=center.constructor.Project(center,mesh.getWorldMatrix().constructor.Identity(),scene.getTransformMatrix(),camera.viewport.toGlobal(engine.getRenderWidth(),engine.getRenderHeight()));
      const hit=scene.pick(point.x,point.y,m=>m.isPickable && m.isEnabled());
      if(!hit?.pickedMesh?.metadata?.assetId?.startsWith('armor-block-'))continue;
      return window.armorEvidencePick={id:hit.pickedMesh.metadata.partId,assetId:hit.pickedMesh.metadata.assetId,x:rect.left+point.x*rect.width/engine.getRenderWidth(),y:rect.top+point.y*rect.height/engine.getRenderHeight()};
    }
    throw Error('No selectable native armor found');
  });
  await page.mouse.click(picked.x,picked.y);
  await page.getByRole('spinbutton',{name:'Component height',exact:true}).waitFor();
  return {picked,height:await page.getByRole('spinbutton',{name:'Component height',exact:true}).inputValue()};
}
