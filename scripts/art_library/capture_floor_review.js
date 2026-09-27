// Run with the project's Playwright CLI run-code. Browser-only asset routing.
async (page) => {
  await page.unrouteAll({behavior: "wait"});
  const base = "/root/sidereal_spacetime/.runtime/art-library/floor/r002";
  const out = "/root/sidereal_spacetime/output/playwright/floor-kit";
  await page.setViewportSize({width: 1440, height: 1000});
  await page.addInitScript(() => {
    window.__floorRAF = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = () => 0;
    localStorage.removeItem("sidereal.assembly.draft.v1");
  });
  const mode = {ship: false};
  for (const name of ["catalog.json", "catalog.voxels.json", "wayfarer.json"])
    await page.route("**/assets/assembly/" + name, route => route.fulfill({
      path: base + "/" + (mode.ship ? "ship-" : "") + name, contentType: "application/json"
    }));
  await page.route("**/assets/assembly/floor-review/**", route => {
    const path = route.request().url().split("/floor-review/")[1].split("?")[0];
    return route.fulfill({path: base + "/" + path, contentType: path.endsWith(".png") ? "image/png" : "model/gltf-binary"});
  });
  await page.route("**/packages/render/src/assembly-editor.ts*", async route => {
    const response = await route.fetch();
    let body = await response.text();
    if (!body.includes("scene.useRightHandedSystem")) throw Error("Scene capture hook changed");
    body = body.replace("scene.useRightHandedSystem", "window.__floorScene = scene; scene.useRightHandedSystem");
    await route.fulfill({response, body});
  });
  const failures = [];
  page.on("pageerror", e => failures.push(e.message));
  let kitRequests = 0;
  page.on("request", r => {if (r.url().includes("/floor-review/kit.glb")) kitRequests++;});
  await page.goto("http://localhost:5174/shipyard", {waitUntil: "domcontentloaded"});
  await page.getByText("Select a part to inspect or move it", {exact: true}).waitFor({timeout: 90000});
  await page.waitForFunction(() => window.__floorScene?.transformNodes.some(n => n.name.includes("floor-review-square")), {}, {timeout: 90000});
  await page.getByRole("combobox", {name: "Part category"}).selectOption("floor");
  async function camera(target, radius, alpha = -.95, beta = Math.acos(1/Math.sqrt(3))) {
    return page.evaluate(({target, radius, alpha, beta}) => {
      const s=window.__floorScene,c=s.activeCamera;s.getEngine().stopRenderLoop();
      c.lowerRadiusLimit=.5;c.lowerBetaLimit=.0001;c.upperBetaLimit=Math.PI/2;
      c.target.set(...target);c.radius=radius;c.alpha=alpha;c.beta=beta;
      s.render();s.render();
      return {alpha:c.alpha,beta:c.beta,radius:c.radius,target:c.target.asArray()};
    }, {target,radius,alpha,beta});
  }
  const boardCamera=await camera([8,.1,-5.5],43,-1.15);
  await page.screenshot({path:out+"/runtime-board.png",timeout:60000});
  const stats=await page.evaluate(() => {
    const s=window.__floorScene;
    const meshes=s.meshes.filter(m=>m.isVisible&&m.isEnabled()&&m.parent?.name.includes("floor-review"));
    return {meshes:meshes.map(m=>({name:m.name,vertices:m.getTotalVertices(),triangles:m.getTotalIndices()/3,material:m.material?.name})),
      materials:s.materials.filter(m=>m.name.startsWith("MAT-deck-")).map(m=>({name:m.name,normal:!!m.bumpTexture,base:!!m.albedoTexture,normalScale:m.bumpTexture?.level,occlusion:!!m.ambientTexture,metallic:!!m.metallicTexture,backFaceCulling:m.backFaceCulling})),
      textures:s.textures.filter(t=>["normal","orm","basecolor"].some(n=>t.name.includes(n))).map(t=>({name:t.name,width:t.getSize().width,height:t.getSize().height})),
      lights:s.lights.filter(l=>l.isEnabled()).map(l=>({name:l.name,intensity:l.intensity})),webgl:s.getEngine().webGLVersion,viewport:[innerWidth,innerHeight]};
  });
  const placements=await page.evaluate(async()=> (await (await fetch("/assets/assembly/wayfarer.json")).json()).parts);
  const perPart=[];
  for (const p of placements) {
    const slug=p.id.replace("floor-review-","");
    const bounds=await page.evaluate(async id => (await (await fetch("/assets/assembly/catalog.json")).json()).assets.find(a=>a.id===id).bounds,p.assetId);
    const width=bounds.max[0],depth=bounds.max[1],span=Math.max(width,depth);
    const center=[p.position[0]+width/2,.09,-p.position[1]-depth/2];
    const close=await camera(center,span*3.3,.9);
    await page.screenshot({path:out+"/"+slug+"-runtime-close.png",timeout:60000});
    const top=await camera(center,span*3.4,0,.0001);
    await page.screenshot({path:out+"/"+slug+"-runtime-top.png",timeout:60000});
    perPart.push({slug,close,top});
  }
  await camera([1,.09,-1],6.8,.9);
  await page.screenshot({path:out+"/normal-on.png",timeout:60000});
  await page.evaluate(()=>{const s=window.__floorScene;window.__normalTextures=s.materials.filter(m=>m.name.startsWith("MAT-deck-")).map(m=>[m,m.bumpTexture]);for(const [m] of window.__normalTextures)m.bumpTexture=null;s.render();s.render();});
  await page.screenshot({path:out+"/normal-off.png",timeout:60000});
  await page.evaluate(()=>{const s=window.__floorScene;for(const [m,t] of window.__normalTextures)m.bumpTexture=t;const fill=s.getLightByName("workshop-fill");fill.setEnabled(false);s.render();s.render();});
  await page.screenshot({path:out+"/one-key-plus-environment.png",timeout:60000});
  const reduced=await page.evaluate(()=>({lights:window.__floorScene.lights.filter(l=>l.isEnabled()).map(l=>l.name),environment:window.__floorScene.environmentIntensity}));
  await page.evaluate(()=>{window.__floorScene.getLightByName("workshop-fill").setEnabled(true);});
  mode.ship=true;
  await page.reload({waitUntil:"domcontentloaded"});
  await page.getByText("Select a part to inspect or move it", {exact:true}).waitFor({timeout:90000});
  await camera([0,.4,0],44,-2.2);
  await page.screenshot({path:out+"/ship-floor-context.png",timeout:60000});
  await camera([0,.18,2],17,-2.2);
  await page.screenshot({path:out+"/ship-floor-close.png",timeout:60000});
  const shipStats=await page.evaluate(()=>({parts:window.__floorScene.transformNodes.filter(n=>n.metadata?.partId).length,
    floorMaterials:window.__floorScene.materials.filter(m=>m.name.startsWith("MAT-deck-")).length,
    floorDrawMeshes:window.__floorScene.meshes.filter(m=>m.isVisible&&m.isEnabled()&&m.material?.name.startsWith("MAT-deck-")).length}));
  return {boardCamera,stats,perPart,reduced,kitRequests,shipStats,failures,
    provenance:"Actual Shipyard renderer/UI; isolated routed unsigned assets. RAF paused for deterministic still capture. Top angle is a review-only override. No live database or published asset writes."};
}
