async (page) => {
  await page.waitForFunction(
    () => {
      const u = window.__componentUI,
        s = u?.scene;
      if (!s) return false;
      s.getEngine()._renderLoop();
      u.invalidate();
      u.paint();
      s.render();
      return s.meshes.length > 1000 && s.isReady();
    },
    {},
    { polling: 250, timeout: 90000 },
  );
  const tick = async () => {
    await page.waitForTimeout(80);
    await page.evaluate(() => {
      const u = window.__componentUI,
        s = u.scene;
      s.getEngine()._renderLoop();
      u.invalidate();
      u.paint();
      s.render();
    });
  };
  const click = async (id) => {
    await tick();
    const p = await page.evaluate((id) => {
      const u = window.__componentUI,
        h = u.hits.find((h) => h.id === id && !h.disabled);
      if (!h) throw Error("Missing " + id);
      return {
        x: (h.rect.x + h.rect.w / 2) * u.scale,
        y: (h.rect.y + h.rect.h / 2) * u.scale,
      };
    }, id);
    await page.mouse.click(p.x, p.y);
  };
  await click("character-open");
  for (let i = 0; i < 25; i++) await tick();
  await page.screenshot({ path: "output/playwright/components-male-base.png" });
  await click("character-body");
  for (let i = 0; i < 10; i++) await tick();
  await page.screenshot({
    path: "output/playwright/components-female-base.png",
  });
  return page.evaluate(() => ({
    hits: window.__componentUI.hits
      .filter((h) => h.id.startsWith("character-") || h.id.startsWith("equip-"))
      .map((h) => ({ id: h.id, label: h.label })),
    aria: document.querySelector("canvas").getAttribute("aria-description"),
  }));
};
