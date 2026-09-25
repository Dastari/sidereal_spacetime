async (page) => {
  return await page.evaluate(async () => {
    const { DbConnection, tables } =
      await import("/@fs/root/sidereal_spacetime/packages/net/src/generated/index.ts");
    const token = localStorage.getItem("sidereal.lab.token");
    const c = await new Promise((resolve, reject) =>
      DbConnection.builder()
        .withUri(location.origin)
        .withDatabaseName("sidereal-character-components-review-20260909")
        .withToken(token || undefined)
        .onConnect((c) =>
          c
            .subscriptionBuilder()
            .onApplied(() => resolve(c))
            .subscribe([
              tables.ownCharacters,
              tables.ownStations,
              tables.ownAppearance,
              tables.ownInventoryItems,
              tables.ownInventoryContainers,
              tables.ownInventoryState,
              tables.ownInventoryHotbar,
            ]),
        )
        .onConnectError((_, e) => reject(e))
        .build(),
    );
    window.__componentConnection = c;
    return {
      characterCount: c.db.ownCharacters.count().toString(),
      items: c.db.ownInventoryItems.count().toString(),
      body: [...c.db.ownAppearance.iter()][0]?.appearanceJson,
    };
  });
};
