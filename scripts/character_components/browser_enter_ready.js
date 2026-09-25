async (page) => {
  await page.waitForFunction(
    () => {
      const u = window.__componentUI,
        s = window.__componentScene;
      s.getEngine()._renderLoop();
      u.invalidate();
      u.paint();
      return u.hits.some((h) => h.id === "enter" && !h.disabled);
    },
    {},
    { polling: 200, timeout: 60000 },
  );
  const pos = await page.evaluate(() => {
    const u = window.__componentUI,
      h = u.hits.find((h) => h.id === "enter");
    return {
      x: (h.rect.x + h.rect.w / 2) * u.scale,
      y: (h.rect.y + h.rect.h / 2) * u.scale,
    };
  });
  await page.mouse.click(pos.x, pos.y);
  await page.waitForFunction(
    () => {
      const u = window.__componentUI,
        s = window.__componentScene;
      s.getEngine()._renderLoop();
      u.invalidate();
      u.paint();
      return u.hits.some((h) => h.id === "character-open" && !h.disabled);
    },
    {},
    { polling: 200, timeout: 60000 },
  );
  await page.keyboard.press("c");
  await page.waitForTimeout(1800);
  for (let i = 0; i < 12; i++) {
    await page.evaluate(() => {
      const u = window.__componentUI;
      u.invalidate();
      u.paint();
    });
    await page.waitForTimeout(80);
  }
  await page.screenshot({ path: "output/playwright/components-initial.png" });
  return page.evaluate(() => ({
    hits: window.__componentUI.hits.map((h) => ({
      id: h.id,
      label: h.label,
      rect: h.rect,
    })),
    aria: document.querySelector("canvas").getAttribute("aria-description"),
  }));
};
