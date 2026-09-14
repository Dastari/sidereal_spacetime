async (page) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/packages/net/src/index.ts*", async (route) => {
    const response = await route.fetch();
    let body = await response.text();
    const match = body.match(/\.withDatabaseName\([^)]*\)/g);
    if (match?.length !== 1) throw Error("Database route hook changed");
    body = body.replace(
      match[0],
      '.withDatabaseName("sidereal-character-components-review-20260909")',
    );
    await route.fulfill({ response, body });
  });
  await page.route("**/packages/canvas-ui/src/toolkit.ts*", async (route) => {
    const response = await route.fetch();
    let body = await response.text();
    if (!body.includes("this.layer ="))
      throw Error("Canvas capture hook changed");
    body = body.replace(
      "this.layer =",
      "window.__componentUI = this; window.__componentScene = scene; this.layer =",
    );
    await route.fulfill({ response, body });
  });
  await page.addInitScript(() => {
    window.__nativeRAF = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = () => 0;
  });
  await page.routeWebSocket("**/?token=*", (ws) => ws.close());
  await page.goto("http://sidereal.tail7a58a6.ts.net:5173/", {
    waitUntil: "domcontentloaded",
  });
  if (
    await page
      .getByText("Existing development character", { exact: true })
      .isVisible()
  ) {
    await page
      .getByText("Existing development character", { exact: true })
      .click();
    await page
      .getByRole("button", { name: "Continue development character" })
      .click();
  }
  await page.waitForFunction(
    () => !!window.__componentUI,
    {},
    { timeout: 90000, polling: 200 },
  );
  return {
    errors,
    ...(await page.evaluate(() => {
      const u = window.__componentUI;
      u.invalidate();
      u.paint();
      return {
        hits: u.hits.map((h) => ({ id: h.id, label: h.label, rect: h.rect })),
        meshes: window.__componentScene.meshes.length,
      };
    })),
  };
};
