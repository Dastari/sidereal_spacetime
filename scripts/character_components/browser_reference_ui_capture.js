async (page) => {
  const records = [];
  const tick = async () => {
    await page.evaluate(() => {
      const u = window.__componentUI;
      u.invalidate();
      u.paint();
      window.__componentReview.scene.render();
    });
    await page.waitForTimeout(300);
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
    await tick();
  };
  if (
    !(await page.evaluate(() =>
      window.__componentUI.hits.some((h) => h.id === "character-body"),
    ))
  )
    await click("character-open");
  for (const body of ["female", "male"]) {
    await page.evaluate(async (body) => {
      const c = window.__componentReview.connection,
        a = [...c.db.ownAppearance.iter()][0];
      await c.reducers.setCharacterAppearance({
        appearanceJson: JSON.stringify({
          ...JSON.parse(a.appearanceJson),
          bodyType: body,
        }),
        expectedRevision: a.revision,
        operationId: crypto.randomUUID(),
      });
    }, body);
    await page.waitForTimeout(1000);
    await tick();
    if (
      !(await page.evaluate(() =>
        window.__componentUI.hits.some((h) => h.id === "character-body"),
      ))
    )
      throw Error("Character panel is not open");
    const path =
      "output/playwright/character-fidelity-r008-paperdoll-" +
      body +
      "-reviewed.png";
    await page.screenshot({ path });
    records.push({ body, path });
  }
  await page.setViewportSize({ width: 900, height: 700 });
  await tick();
  await page.waitForTimeout(1000);
  await page.screenshot({
    path: "output/playwright/character-fidelity-r008-paperdoll-small-reviewed.png",
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  return {
    records,
    ...(await page.evaluate(() => ({
      appearance: window.__componentReview.state().characterAppearance,
      equippedItems: [
        ...window.__componentReview.connection.db.ownInventoryItems.iter(),
      ]
        .filter((i) => i.equipmentSlot)
        .map((i) => ({
          id: i.id,
          definitionId: i.definitionId,
          slot: i.equipmentSlot,
        })),
      errors: window.__componentReview.state().error,
    }))),
    context:
      "Actual production canvas UI/portrait, isolated sidereal-character-components-review-20260909 database and real equip reducers. Browser-only candidate r008 asset route; no live ship publication.",
  };
};
