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
    await page.waitForTimeout(350);
  };
  const supply = await page.evaluate(() => {
    const r = window.__componentReview,
      c = r.connection;
    const container = [...c.db.ownInventoryContainers.iter()].find(
      (c) => c.name === "Storage supply crate",
    );
    r.gui.openContainer(container.id);
    return container.id;
  });
  await page.waitForTimeout(700);
  const target = await page.evaluate(() => {
    const c = window.__componentReview.connection,
      item = [...c.db.ownInventoryItems.iter()].find(
        (i) => i.definitionId === "crew-captain-helmet",
      );
    const u = window.__componentUI,
      h = u.hits.find(
        (h) => h.id === "item-" + item.containerId + "-" + item.id,
      );
    const slot = u.hits.find((h) => h.id === "equip-slot-helmet");
    if (!h || !slot) throw Error("Missing drag endpoints");
    return {
      id: item.id,
      from: {
        x: (h.rect.x + h.rect.w / 2) * u.scale,
        y: (h.rect.y + h.rect.h / 2) * u.scale,
      },
      to: {
        x: (slot.rect.x + slot.rect.w / 2) * u.scale,
        y: (slot.rect.y + slot.rect.h / 2) * u.scale,
      },
    };
  });
  await page.mouse.move(target.from.x, target.from.y);
  await page.mouse.down();
  await page.mouse.move(target.to.x, target.to.y, { steps: 16 });
  await page.mouse.up();
  await page.waitForFunction(
    (id) =>
      [...window.__componentReview.connection.db.ownInventoryItems.iter()].find(
        (i) => i.id === id,
      )?.equipmentSlot === "helmet",
    target.id,
    { timeout: 10000 },
  );
  await page.screenshot({
    path: "output/playwright/components-final-drag-equipped.png",
  });
  // Reverse drag into a free cell in the same visible authoritative crate.
  if (
    await page.evaluate(() =>
      window.__componentUI.hits.some((h) => h.id === "selected-item-close"),
    )
  )
    await click("selected-item-close");
  const reverse = await page.evaluate(
    async ({ supply }) => {
      const { inventoryPlacement } =
        await import("/@fs/root/sidereal_spacetime/packages/canvas-ui/src/inventory.ts");
      const u = window.__componentUI,
        s = window.__componentReview.state().inventory,
        item = s.items.find((i) => i.equipmentSlot === "helmet"),
        c = s.containers.find((c) => c.id === supply),
        h = u.hits.find((h) => h.id === "equip-slot-helmet");
      for (let y = 0; y < c.height; y++)
        for (let x = 0; x < c.width; x++) {
          const cell = u.hits.find((h) => h.id === `slot-${supply}-${x}-${y}`);
          if (cell && !inventoryPlacement(s, item, c, x, y, false))
            return {
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
      throw Error("No visible free location");
    },
    { supply },
  );
  await page.mouse.move(reverse.from.x, reverse.from.y);
  await page.mouse.down();
  await page.mouse.move(reverse.to.x, reverse.to.y, { steps: 16 });
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
    path: "output/playwright/components-final-drag-unequipped.png",
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
  await click(supply + "-close");
  await page.waitForTimeout(1300);
  await page.screenshot({
    path: "output/playwright/components-final-female-mixed.png",
  });
  return {
    dragEquip: true,
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
