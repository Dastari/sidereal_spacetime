async (page) => {
  await page.routeWebSocket("**/?token=*", (ws) => ws.close());
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(
    () => !!window.__componentUI?.scene,
    {},
    { polling: 200, timeout: 60000 },
  );
  const tick = async () => {
    await page.evaluate(() => {
      const u = window.__componentUI,
        s = window.__componentScene;
      s.getEngine()._renderLoop();
      u.invalidate();
      u.paint();
      s.render();
    });
    await page.waitForTimeout(100);
  };
  await page.waitForFunction(
    () => {
      const u = window.__componentUI,
        s = window.__componentScene;
      s.getEngine()._renderLoop();
      u.invalidate();
      u.paint();
      return (
        u.hits.some((h) => h.id === "enter" && !h.disabled) ||
        u.hits.some((h) => h.id === "character-open" && !h.disabled)
      );
    },
    {},
    { polling: 200, timeout: 90000 },
  );
  const click = async (id) => {
    await tick();
    const p = await page.evaluate((id) => {
      const u = window.__componentUI,
        h = u.hits.find((h) => h.id === id && !h.disabled);
      if (!h) return;
      return {
        x: (h.rect.x + h.rect.w / 2) * u.scale,
        y: (h.rect.y + h.rect.h / 2) * u.scale,
      };
    }, id);
    if (p) await page.mouse.click(p.x, p.y);
  };
  await click("enter");
  for (let i = 0; i < 4; i++) await tick();
  await click("character-open");
  for (let i = 0; i < 20; i++) await tick();
  await page.screenshot({ path: "output/playwright/components-male-base.png" });
  await click("character-body");
  for (let i = 0; i < 10; i++) await tick();
  await page.screenshot({
    path: "output/playwright/components-female-base.png",
  });
  return {
    errors,
    ...(await page.evaluate(() => ({
      hits: window.__componentUI.hits.map((h) => ({
        id: h.id,
        label: h.label,
        rect: h.rect,
      })),
      aria: document.querySelector("canvas").getAttribute("aria-description"),
    }))),
  };
};
