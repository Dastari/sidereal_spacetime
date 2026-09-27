async (page) => {
  const names = await page.evaluate(() =>
    window.__componentGallery.jobs
      .slice(
        window.__componentGallery.cursor,
        window.__componentGallery.cursor + 20,
      )
      .map((j) => j.id),
  );
  for (const id of names) {
    await page.evaluate(async (id) => {
      const g = window.__componentGallery,
        j = g.jobs.find((j) => j.id === id);
      g.preview.setAppearance("engineer", j.appearance);
      g.preview.setRotation(0.32);
      for (let i = 0; i < 5; i++) {
        g.preview.render(performance.now() / 1000, true);
        await new Promise((r) => setTimeout(r, 30));
      }
    }, id);
    await page.locator("#component-runtime-gallery").screenshot({
      path: "output/playwright/character-runtime-gallery/" + id + ".png",
    });
    await page.evaluate((id) => {
      const g = window.__componentGallery;
      g.records.push({
        id,
        appearance: g.jobs.find((j) => j.id === id).appearance,
        status: g.preview.status,
        error: g.preview.error ?? null,
      });
      g.cursor++;
    }, id);
  }
  return page.evaluate(() => ({
    completed: window.__componentGallery.cursor,
    total: window.__componentGallery.jobs.length,
    errors: window.__componentGallery.records.filter((r) => r.error),
  }));
};
