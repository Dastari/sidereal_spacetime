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
  await page.waitForTimeout(3500);
  await page.screenshot({ path: "output/playwright/components-male-base.png" });
  await click("character-body");
  await page.waitForTimeout(1800);
  await page.screenshot({
    path: "output/playwright/components-female-base.png",
  });
  return page.evaluate(() => ({
    appearance: [
      ...window.__componentReview.connection.db.ownAppearance.iter(),
    ][0].appearanceJson,
    hits: window.__componentUI.hits
      .filter((h) => h.id.startsWith("character-") || h.id.startsWith("equip-"))
      .map((h) => ({ id: h.id, label: h.label })),
  }));
};
