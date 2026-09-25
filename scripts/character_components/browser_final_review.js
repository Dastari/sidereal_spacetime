async (page) => {
  const click = async (id) => {
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
    await page.waitForTimeout(450);
  };
  await click("character-open");
  await page.waitForTimeout(2500);
  await page.screenshot({
    path: "output/playwright/components-final-mixed-desktop.png",
  });
  const saved = await page.evaluate(() => ({
    appearance: window.__componentReview.state().characterAppearance,
    equipped: window.__componentReview.state().inventory.equippedComponents,
  }));
  // Genuine overhead render from the production portrait's Babylon scene.
  await page.evaluate(() => {
    const p = window.__componentPortrait,
      c = p.scene.activeCamera;
    p.before = { beta: c.beta, alpha: c.alpha };
    c.beta = 0.08;
    c.alpha = -Math.PI / 2;
    p.canvas.style.cssText =
      "position:fixed;left:480px;top:30px;width:480px;height:840px;z-index:999;background:#081424";
    document.body.append(p.canvas);
    p.engine.beginFrame();
    p.scene.render();
    p.engine.endFrame();
  });
  await page.screenshot({
    path: "output/playwright/components-runtime-top.png",
  });
  await page.evaluate(() => {
    const p = window.__componentPortrait,
      c = p.scene.activeCamera;
    c.beta = p.before.beta;
    c.alpha = p.before.alpha;
    p.canvas.remove();
    p.engine.beginFrame();
    p.scene.render();
    p.engine.endFrame();
  });
  await page.setViewportSize({ width: 900, height: 700 });
  await page.waitForTimeout(1500);
  await page.screenshot({
    path: "output/playwright/components-final-small.png",
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.waitForTimeout(600);
  return {
    saved,
    portraitReady: await page.evaluate(() =>
      window.__componentPortrait.scene.isReady(),
    ),
  };
};
