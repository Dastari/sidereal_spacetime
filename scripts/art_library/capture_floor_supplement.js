// Continue the dedicated floor-kit-review session after capture_floor_review.js.
async (page) => {
  const base = '/root/sidereal_spacetime/.runtime/art-library/floor/r002';
  const out = '/root/sidereal_spacetime/output/playwright/floor-kit';
  for (const name of ['catalog.json', 'catalog.voxels.json', 'wayfarer.json'])
    await page.unroute('**/assets/assembly/' + name);
  await page.reload({waitUntil:'domcontentloaded'});
  await page.getByText('Select a part to inspect or move it', {exact:true}).waitFor({timeout:90000});
  async function camera(target, radius, alpha) {
    return page.evaluate(({target,radius,alpha}) => {
      const s=window.__floorScene,c=s.activeCamera;s.getEngine().stopRenderLoop();
      c.lowerRadiusLimit=.5;c.target.set(...target);c.radius=radius;c.alpha=alpha;c.beta=Math.acos(1/Math.sqrt(3));
      s.render();s.render();
      return {target:c.target.asArray(),radius:c.radius,alpha:c.alpha,beta:c.beta};
    },{target,radius,alpha});
  }
  const baselineCamera=await camera([0,.4,0],44,-2.2);
  await page.screenshot({path:out+'/legacy-ship-context.png',timeout:60000});
  await camera([0,.18,2],17,-2.2);
  await page.screenshot({path:out+'/legacy-ship-close.png',timeout:60000});
  for (const name of ['catalog.json','catalog.voxels.json','wayfarer.json'])
    await page.route('**/assets/assembly/'+name,route=>route.fulfill({path:base+'/'+name,contentType:'application/json'}));
  await page.reload({waitUntil:'domcontentloaded'});
  await page.getByText('Select a part to inspect or move it',{exact:true}).waitFor({timeout:90000});
  await page.getByRole('combobox',{name:'Part category'}).selectOption('floor');
  await camera([8,.1,-5.5],43,-1.15);
  return {baselineCamera,baseline:'Published catalog at capture time; original surfaces and all original placements. Same camera, viewport and workshop lighting as r002 ship context.',ready:'Board reloaded for UI interaction review'};
}
