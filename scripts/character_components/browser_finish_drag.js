async (page) => {
  const click = async (id) => {
    const p = await page.evaluate((id) => {
      const u = window.__componentUI,
        h = u.hits.find((h) => h.id === id);
      if (!h) throw Error("Missing " + id);
      return {
        x: (h.rect.x + h.rect.w / 2) * u.scale,
        y: (h.rect.y + h.rect.h / 2) * u.scale,
      };
    }, id);
    await page.mouse.click(p.x, p.y);
    await page.waitForTimeout(300);
  };
  if (
    await page.evaluate(() =>
      window.__componentUI.hits.some((h) => h.id === "selected-item-close"),
    )
  )
    await click("selected-item-close");
  const target = await page.evaluate(async () => {
    const { inventoryPlacement } =
      await import("/@fs/root/sidereal_spacetime/packages/canvas-ui/src/inventory.ts");
    const r = window.__componentReview,
      c = r.connection,
      state = r.state().inventory,
      u = window.__componentUI;
    const item = state.items.find((i) => i.equipmentSlot === "helmet"),
      container = state.containers.find(
        (c) => c.name === "Storage supply crate",
      ),
      h = u.hits.find((h) => h.id === "equip-slot-helmet");
    for (let y = 0; y < container.height; y++)
      for (let x = 0; x < container.width; x++) {
        const cell = u.hits.find(
          (h) => h.id === `slot-${container.id}-${x}-${y}`,
        );
        if (cell && !inventoryPlacement(state, item, container, x, y, false))
          return {
            id: item.id,
            container: container.id,
            from: {
              x: (h.rect.x + h.rect.w / 2) * u.scale,
              y: (h.rect.y + h.rect.h / 2) * u.scale,
            },
            to: {
              x: (cell.rect.x + 4) * u.scale,
              y: (cell.rect.y + 4) * u.scale,
            },
          };
      }
    throw Error("No visible vacancy");
  });
  await page.mouse.move(target.from.x, target.from.y);
  await page.mouse.down();
  await page.mouse.move(target.to.x, target.to.y, { steps: 16 });
  await page.mouse.up();
  await page.waitForFunction(
    (id) =>
      [...window.__componentReview.connection.db.ownInventoryItems.iter()].find(
        (i) => i.id === id,
      )?.equipmentSlot === "",
    target.id,
    { timeout: 10000 },
  );
  await page.screenshot({
    path: "output/playwright/components-drag-unequipped.png",
  });
  await page.evaluate(async () => {
    const c = window.__componentReview.connection;
    for (const id of [
      "medic-chest",
      "engineer-helmet",
      "recon-visor",
      "marine-shoulders",
      "security-gloves",
      "mechanic-belt",
      "pilot-legs",
      "salvage-boots",
      "scientist-back",
    ]) {
      const item = [...c.db.ownInventoryItems.iter()].find(
        (i) => i.definitionId === "crew-" + id,
      );
      await c.reducers.equipInventoryItem({
        itemId: item.id,
        expectedRevision: [...c.db.ownInventoryState.iter()][0].revision,
        operationId: crypto.randomUUID(),
      });
    }
  });
  if (
    await page.evaluate(() =>
      window.__componentUI.hits.some((h) => h.id === "selected-item-close"),
    )
  )
    await click("selected-item-close");
  await click(target.container + "-close");
  await page.waitForTimeout(1200);
  await page.screenshot({
    path: "output/playwright/components-female-mixed.png",
  });
  return {
    dragUnequip: true,
    ...(await page.evaluate(() => ({
      equipped: [
        ...window.__componentReview.connection.db.ownInventoryItems.iter(),
      ]
        .filter((i) => i.equipmentSlot)
        .map((i) => ({ definition: i.definitionId, slot: i.equipmentSlot })),
      appearance: [
        ...window.__componentReview.connection.db.ownAppearance.iter(),
      ][0].appearanceJson,
    }))),
  };
};
