async (page) => {
  const report = {
    kind: "Actual createGameUI/CanvasUI private browser review",
    authority:
      "Local callback only; no database/auth/reducer connection or persistence acceptance",
    viewports: [],
    screenshots: [],
  };
  const click = async (id) => {
    const hit = await page.evaluate((id) => {
      const u = window.crewControlsReview.ui,
        h = u.hits.find((h) => h.id === id);
      if (!h || h.disabled) return null;
      const r = u.canvas.getBoundingClientRect();
      return {
        x: r.left + (h.rect.x + h.rect.w / 2) * u.scale,
        y: r.top + (h.rect.y + h.rect.h / 2) * u.scale,
      };
    }, id);
    if (!hit) throw Error("Missing/disabled real hit: " + id);
    await page.mouse.click(hit.x, hit.y);
    await page.waitForTimeout(55);
  };
  const capture = async (name) => {
    const path = "output/playwright/character-faces-r009/" + name + ".png";
    await page.screenshot({ path });
    report.screenshots.push(path);
  };
  const scroll = async (delta) => {
    const center = await page.evaluate(() => {
      const u = window.crewControlsReview.ui;
      const h = u.hits.find((h) => h.id === "scroll-down");
      return { x: (h.rect.x - 50) * u.scale, y: (h.rect.y - 90) * u.scale };
    });
    await page.mouse.move(center.x, center.y);
    await page.mouse.wheel(0, delta);
    await page.waitForTimeout(100);
  };
  for (const [width, height] of [
    [1280, 760],
    [1920, 1080],
    [768, 900],
    [390, 844],
  ]) {
    await page.setViewportSize({ width, height });
    await page.reload();
    await page.waitForFunction(
      () => window.crewControlsReview?.ui?.hits.length > 0,
    );
    if (width === 1280) {
      await page
        .locator("#asset")
        .setInputFiles(
          "/root/sidereal_spacetime/assets/art-library/designs/crew.base-and-outfits/revisions/r009/final-delivery/modular-crew.glb",
        );
      await page.waitForFunction(
        () => window.crewControlsReview.scene.meshes.length > 100,
      );
    }
    await page.keyboard.press("Escape");
    await page.waitForTimeout(100);
    await click("tab-Crew");
    const top = await page.evaluate(() => ({
      scale: window.crewControlsReview.ui.scale,
      selectors: window.crewControlsReview.ui.hits
        .filter((h) =>
          [
            "crew-bodyType",
            "crew-hairStyle",
            "crew-expression",
            "crew-faceDetail",
            "crew-facialHair",
            "crew-faceAge",
          ].includes(h.id),
        )
        .map((h) => ({ id: h.id, label: h.label })),
    }));
    await capture("crew-ui-" + width + "-top");
    if (width === 1280) {
      for (const id of [
        "crew-bodyType",
        "crew-hairStyle",
        "crew-expression",
        "crew-faceDetail",
        "crew-facialHair",
        "crew-faceAge",
      ])
        await click(id);
    }
    const visibleHair = new Set(),
      visibleEyes = new Set(),
      visibleSkin = new Set();
    for (let step = 0; step < 30; step++) {
      const info = await page.evaluate(() => ({
        ids: window.crewControlsReview.ui.hits.map((h) => h.id),
        bottom: window.crewControlsReview.ui.hits.find(
          (h) => h.id === "scroll-down",
        )?.disabled,
      }));
      for (const id of info.ids) {
        if (id.startsWith("crew-hair-color-")) visibleHair.add(id);
        if (id.startsWith("crew-eyes-color-")) visibleEyes.add(id);
        if (id.startsWith("crew-skin-color-")) visibleSkin.add(id);
      }
      if (info.bottom) break;
      await scroll(125);
      if (step === 29) throw Error("Scroll never reached bottom: " + width);
    }
    await click("crew-hair-color-31");
    if (width === 1280) {
      for (let i = 0; i < 32; i++) await click("crew-hair-color-" + i);
      for (let i = 0; i < 8; i++) await click("crew-eyes-color-" + i);
      await click("crew-skin-color-7");
    }
    await capture("crew-ui-" + width + "-bottom");
    const end = await page.evaluate(() => ({
      scale: window.crewControlsReview.ui.scale,
      appearance: window.crewControlsReview.appearance,
      callbackCount: window.crewControlsReview.changes.length,
      downDisabled: window.crewControlsReview.ui.hits.find(
        (h) => h.id === "scroll-down",
      )?.disabled,
      lastHairHit: window.crewControlsReview.ui.hits.find(
        (h) => h.id === "crew-hair-color-31",
      )?.rect,
    }));
    if (!end.downDisabled || end.appearance.hair !== "#f1ce45")
      throw Error("Last swatch not selected at true bottom");
    if (
      visibleHair.size !== 32 ||
      visibleEyes.size !== 8 ||
      visibleSkin.size !== 8
    )
      throw Error(
        "Palette choices unreachable: " +
          JSON.stringify({
            width,
            hair: visibleHair.size,
            eyes: visibleEyes.size,
            skin: visibleSkin.size,
          }),
      );
    report.viewports.push({
      width,
      height,
      ...top,
      ...end,
      reachableHair: visibleHair.size,
      reachableEyes: visibleEyes.size,
      reachableSkin: visibleSkin.size,
    });
  }
  report.passed = true;
  return report;
};
