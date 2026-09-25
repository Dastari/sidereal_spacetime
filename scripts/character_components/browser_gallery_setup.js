async (page) => {
  await page.evaluate(async () => {
    const r = window.__componentReview;
    r.gui.dispose();
    const { createCharacterPreview } =
      await import("/@fs/root/sidereal_spacetime/packages/render/src/character-preview.ts");
    const {
      CHARACTER_COMPONENTS,
      CHARACTER_COMPONENT_SETS,
      CHARACTER_HAIR_STYLES,
    } =
      await import("/@fs/root/sidereal_spacetime/packages/content/src/character-components.ts");
    const preview = createCharacterPreview({ width: 400, height: 560 });
    await preview.ready;
    preview.resize(400, 560);
    preview.canvas.id = "component-runtime-gallery";
    preview.canvas.style.cssText =
      "position:fixed;left:0;top:0;width:400px;height:560px;background:#071222;z-index:999";
    document.body.append(preview.canvas);
    const jobs = CHARACTER_COMPONENTS.map((c) => ({
      id: c.id,
      appearance: {
        bodyType: "male",
        hairStyle: "none",
        equippedComponents: { [c.slot]: c.id },
      },
    }));
    for (const bodyType of ["male", "female"]) {
      jobs.push({
        id: "base-" + bodyType,
        appearance: { bodyType, hairStyle: "none", equippedComponents: {} },
      });
      for (const [set, equippedComponents] of Object.entries(
        CHARACTER_COMPONENT_SETS,
      ))
        jobs.push({
          id: "outfit-" + bodyType + "-" + set,
          appearance: { bodyType, hairStyle: "cropped", equippedComponents },
        });
    }
    for (const hairStyle of CHARACTER_HAIR_STYLES.filter((h) => h !== "none"))
      jobs.push({
        id: "hair-" + hairStyle,
        appearance: { bodyType: "female", hairStyle, equippedComponents: {} },
      });
    window.__componentGallery = { preview, jobs, cursor: 0, records: [] };
  });
  return page.evaluate(() => ({
    jobs: window.__componentGallery.jobs.length,
    status: window.__componentGallery.preview.status,
  }));
};
