async (page) => {
  const ids = await page.evaluate(() =>
    [...window.__componentReview.connection.db.ownInventoryItems.iter()]
      .filter((i) => i.definitionId.startsWith("crew-medic-"))
      .map((i) => i.id),
  );
  if (ids.length !== 9)
    throw Error(
      "Expected 9 discovered medic pieces; walk to the existing supply crates before equipping. Found " +
        ids.length,
    );
  for (const id of ids) {
    await page.evaluate(async (id) => {
      const c = window.__componentReview.connection;
      await c.reducers.equipInventoryItem({
        itemId: id,
        expectedRevision: [...c.db.ownInventoryState.iter()][0].revision,
        operationId: crypto.randomUUID(),
      });
    }, id);
    await page.waitForFunction(
      (id) =>
        [
          ...window.__componentReview.connection.db.ownInventoryItems.iter(),
        ].some((i) => i.id === id && i.equipmentSlot),
      id,
      { timeout: 10000 },
    );
  }
  await page.evaluate(async () => {
    const c = window.__componentReview.connection,
      a = [...c.db.ownAppearance.iter()][0];
    await c.reducers.setCharacterAppearance({
      appearanceJson: JSON.stringify({
        ...JSON.parse(a.appearanceJson),
        bodyType: "female",
        hairStyle: "ponytail",
        skin: "#EBC2AC",
        hair: "#252139",
      }),
      expectedRevision: a.revision,
      operationId: crypto.randomUUID(),
    });
  });
  await page.waitForTimeout(300);
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
  };
  if (
    !(await page.evaluate(() =>
      window.__componentUI.hits.some((h) => h.id === "character-body"),
    ))
  )
    await click("character-open");
  await page.waitForTimeout(1600);
  await page.screenshot({
    path: "output/playwright/character-fidelity-r008-paperdoll-female-sealed.png",
  });
  return page.evaluate(() => ({
    appearance: window.__componentReview.state().characterAppearance,
    equipped: window.__componentReview.state().inventory.equippedComponents,
    errors: window.__componentReview.state().error,
    source:
      "Production createGameUI + createCharacterPreview, isolated review DB, browser-only r008 GLB route. No live publication or new comms inventory.",
  }));
};
