async (page) => {
  const click = async (id) => {
    const p = await page.evaluate((id) => {
      const u = window.__componentUI;
      u.invalidate();
      u.paint();
      const h = u.hits.find((h) => h.id === id);
      if (!h) throw Error("Missing " + id);
      return {
        x: (h.rect.x + h.rect.w / 2) * u.scale,
        y: (h.rect.y + h.rect.h / 2) * u.scale,
      };
    }, id);
    await page.mouse.click(p.x, p.y);
  };
  await click("enter");
  await page.waitForFunction(
    () => {
      const u = window.__componentUI,
        s = window.__componentScene;
      s.getEngine()._renderLoop();
      u.invalidate();
      u.paint();
      return (
        s.meshes.some((m) => m.name.startsWith("GEO-base-")) &&
        !document
          .querySelector("canvas")
          .getAttribute("aria-description")
          ?.includes("Loading vessel")
      );
    },
    {},
    { polling: 300, timeout: 90000 },
  );
  await click("character-open");
  await page.waitForTimeout(1500);
  await page.evaluate(() => {
    const u = window.__componentUI;
    u.invalidate();
    u.paint();
  });
  return page.evaluate(() => ({
    meshes: window.__componentScene.meshes.length,
    hits: window.__componentUI.hits.map((h) => ({
      id: h.id,
      label: h.label,
      rect: h.rect,
    })),
    aria: document.querySelector("canvas").getAttribute("aria-description"),
  }));
};
