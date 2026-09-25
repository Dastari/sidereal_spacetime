async (page) =>
  page.evaluate(() => {
    const u = window.__componentUI,
      s = window.__componentScene;
    if (s) s.getEngine()._renderLoop();
    if (u) {
      u.invalidate();
      u.paint();
    }
    return {
      meshes: s?.meshes.length,
      ready: s?.isReady(),
      glb: s?.meshes.filter((m) => m.name.startsWith("GEO-base-")).length,
      hits: u?.hits.map((h) => ({
        id: h.id,
        label: h.label,
        disabled: h.disabled,
      })),
      aria: document.querySelector("canvas")?.getAttribute("aria-description"),
    };
  });
