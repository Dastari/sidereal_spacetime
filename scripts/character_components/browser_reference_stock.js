async (page) => {
  await page.evaluate(async () => {
    const c = window.__componentReview.connection;
    if ([...c.db.ownStations.iter()][0]?.occupantId)
      await c.reducers.useStation({});
    let sequence = BigInt(Date.now());
    for (const [x, y] of [
      [0, 3],
      [-2.4, 3],
      [-2.5, 2.75],
    ]) {
      const end = Date.now() + 15000;
      while (Date.now() < end) {
        const a = [...c.db.ownCharacters.iter()][0],
          dx = x - a.localX,
          dy = y - a.localY,
          l = Math.hypot(dx, dy);
        await c.reducers.setIntent({
          sequence: ++sequence,
          throttle: 0,
          turn: 0,
          dx: l < 0.09 ? 0 : dx / Math.max(1, l),
          dy: l < 0.09 ? 0 : dy / Math.max(1, l),
          sprint: false,
        });
        if (l < 0.09) break;
        await new Promise((r) => setTimeout(r, 70));
      }
    }
  });
  await page.waitForTimeout(300);
  return page.evaluate(() => {
    const c = window.__componentReview.connection,
      items = [...c.db.ownInventoryItems.iter()];
    return {
      crates: [...c.db.ownInventoryContainers.iter()]
        .filter((c) => c.placementId)
        .map((c) => ({
          id: c.id,
          name: c.name,
          width: c.width,
          height: c.height,
          uniforms: items.filter(
            (i) => i.containerId === c.id && i.definitionId.startsWith("crew-"),
          ).length,
        })),
      totalUniforms: items.filter((i) => i.definitionId.startsWith("crew-"))
        .length,
    };
  });
}
