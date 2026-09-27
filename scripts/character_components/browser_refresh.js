async (page) => {
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(
    () => !!window.__componentUI,
    {},
    { polling: 200, timeout: 60000 },
  );
  for (let i = 0; i < 5; i++) {
    await page.evaluate(() => {
      const u = window.__componentUI,
        s = window.__componentScene;
      s.getEngine()._renderLoop();
      u.invalidate();
      u.paint();
      s.render();
    });
    await page.waitForTimeout(100);
  }
  return page.evaluate(() => ({
    hits: window.__componentUI.hits.map((h) => ({
      id: h.id,
      label: h.label,
      disabled: h.disabled,
    })),
    aria: document.querySelector("canvas").getAttribute("aria-description"),
  }));
};
