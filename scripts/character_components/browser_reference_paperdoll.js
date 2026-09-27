async (page) => {
  await page.route("**/assets/crew/components/modular-crew.glb", (route) =>
    route.fulfill({
      path: "/root/sidereal_spacetime/.runtime/character-reference/r008/modular-crew.glb",
      contentType: "model/gltf-binary",
    }),
  );
  await page.route("**/__character-component-review", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: '<!doctype html><html><head><title>Staged character calibration / production paper doll</title><style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#050d20}canvas{width:100%;height:100%;display:block;touch-action:none}</style></head><body><canvas tabindex="0"></canvas><script type="module" src="/@fs/root/sidereal_spacetime/scripts/character_components/runtime-review.ts"></script></body></html>',
    }),
  );
  await page.route("**/packages/canvas-ui/src/toolkit.ts*", async (route) => {
    const response = await route.fetch();
    const body = (await response.text()).replace(
      "this.layer =",
      "window.__componentUI = this; this.layer =",
    );
    await route.fulfill({ response, body });
  });
  await page.goto(
    "https://sidereal.tail7a58a6.ts.net:8444/__character-component-review",
    { waitUntil: "domcontentloaded" },
  );
  await page.waitForFunction(
    () => !!window.__componentReview,
    {},
    { timeout: 60000 },
  );
  return page.evaluate(() => ({
    items: window.__componentReview.connection.db.ownInventoryItems
      .count()
      .toString(),
    hits: window.__componentUI.hits.map((h) => h.id),
  }));
};
