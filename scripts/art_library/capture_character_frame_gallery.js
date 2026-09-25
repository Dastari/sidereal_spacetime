/**
 * Playwright CLI run-code function. Execute from the existing same-origin UI
 * review page. Creates a temporary, independent Canvas2D gallery; never touches
 * CanvasUI state, localStorage, character ownership, network routes or reducers.
 */
async (page) => {
  const target = "output/playwright/character-ui/r002-frame-gallery.png";
  const galleryId = "sidereal-character-frame-gallery-capture";
  let provenance;
  try {
    provenance = await page.evaluate(async ({ galleryId }) => {
      if (document.getElementById(galleryId)) {
        throw new Error("A frame gallery with this capture ID already exists");
      }
      const frameUrl = "/@fs/root/sidereal_spacetime/packages/canvas-ui/src/item-frame.ts";
      const glyphUrl = "/@fs/root/sidereal_spacetime/packages/canvas-ui/src/hud-icons.ts";
      const anatomyUrl = "/@fs/root/sidereal_spacetime/packages/canvas-ui/src/appearance-icons.ts";
      const [{ drawItemFrame, ITEM_RARITY_PALETTES }, { drawHudIcon }, { drawAppearanceIcon }] =
        await Promise.all([import(frameUrl), import(glyphUrl), import(anatomyUrl)]);
      const manifestUrl = "/assets/equipment/icons/manifest.json";
      const response = await fetch(manifestUrl);
      if (!response.ok) throw new Error(`Equipment icon manifest returned ${response.status}`);
      const manifest = await response.json();
      const examples = [
        { rarity: "common", assetId: "compact-pistol", name: "Compact pistol" },
        { rarity: "rare", assetId: "sample-scanner", name: "Survey scanner" },
        { rarity: "epic", assetId: "carbine", name: "Frontier carbine" },
        { rarity: "legendary", assetId: "long-rifle", name: "Survey rifle" },
      ];
      const loaded = await Promise.all(examples.map(async (entry) => {
        const source = manifest.entries?.find((row) => row.assetId === entry.assetId);
        if (!source || source.boundsPixels?.length !== 4) {
          throw new Error(`Missing exact icon bounds: ${entry.assetId}`);
        }
        const image = new Image();
        image.decoding = "async";
        image.src = `/assets/equipment/icons/${encodeURIComponent(entry.assetId)}.png`;
        await image.decode();
        if (!image.naturalWidth || !image.naturalHeight) throw new Error(`Empty icon: ${entry.assetId}`);
        const [sx, sy, ex, ey] = source.boundsPixels;
        if (sx < 0 || sy < 0 || ex <= sx || ey <= sy || ex > image.naturalWidth || ey > image.naturalHeight) {
          throw new Error(`Invalid icon bounds: ${entry.assetId}`);
        }
        return { ...entry, image, source };
      }));
      const canvas = document.createElement("canvas");
      canvas.id = galleryId;
      canvas.width = 1280;
      canvas.height = 948;
      canvas.setAttribute("aria-label", "Temporary item frame design capture");
      // A small invisible DOM attachment lets Playwright download the native PNG
      // without introducing another browser/WebGL context or resizing the game.
      canvas.style.cssText = "position:fixed;left:0;top:0;width:1px;height:1px;opacity:0;pointer-events:none;z-index:2147483647";
      document.body.appendChild(canvas);
      const c = canvas.getContext("2d");
      if (!c) throw new Error("Canvas2D is unavailable");
      const ui = { ctx: c };
      const text = (value, x, y, size = 13, color = "#acc8e0", align = "left") => {
        c.save();
        c.fillStyle = color;
        c.font = `${size >= 20 ? "600" : "400"} ${size}px sans-serif`;
        c.textBaseline = "top";
        c.textAlign = align;
        c.fillText(value, x, y);
        c.restore();
      };
      const icon = (entry, r, disabled = false) => {
        const [sx, sy, ex, ey] = entry.source.boundsPixels;
        const sw = ex - sx, sh = ey - sy;
        const scale = 0.88 * Math.min(r.w / sw, r.h / sh);
        c.save();
        c.beginPath(); c.rect(r.x, r.y, r.w, r.h); c.clip();
        if (disabled) c.globalAlpha = 0.46;
        c.drawImage(entry.image, sx, sy, sw, sh,
          r.x + (r.w - sw * scale) / 2,
          r.y + (r.h - sh * scale) / 2, sw * scale, sh * scale);
        c.restore();
      };
      c.fillStyle = "#04101f";
      c.fillRect(0, 0, canvas.width, canvas.height);
      const background = c.createLinearGradient(0, 0, 0, 520);
      background.addColorStop(0, "#0a1b30"); background.addColorStop(1, "#04101f");
      c.fillStyle = background; c.fillRect(0, 0, canvas.width, 520);
      text("Item frame design gallery · presentation examples", 32, 24, 26, "#b9efff");
      text("Production Canvas2D frames with published equipment renders. Rarity examples do not represent live ownership or loot.", 32, 64, 14);
      c.fillStyle = "#285273"; c.fillRect(32, 91, 1216, 1);

      const states = [
        { label: "Selected", options: { selected: true } },
        { label: "Focus", options: { focused: true } },
        { label: "Disabled", options: { disabled: true } },
        { label: "Empty", options: { empty: true } },
      ];
      loaded.forEach((entry, index) => {
        const x = 32 + index * 310;
        const p = ITEM_RARITY_PALETTES[entry.rarity];
        text(p.label, x, 110, 22, p.edge);
        text(entry.name, x, 140, 14, "#d0dfed");
        const main = { x: x + 62, y: 166, w: 154, h: 131 };
        drawItemFrame(ui, main, { rarity: entry.rarity });
        icon(entry, { x: main.x + 8, y: main.y + 8, w: main.w - 16, h: main.h - 16 });
        text("Normal", main.x + main.w / 2, 302, 11, "#8faec9", "center");
        states.forEach((state, n) => {
          const box = { x: x + n * 70, y: 332, w: 60, h: 60 };
          drawItemFrame(ui, box, { rarity: entry.rarity, ...state.options });
          if (!state.options.empty) icon(entry,
            { x: box.x + 7, y: box.y + 7, w: box.w - 14, h: box.h - 14 }, state.options.disabled);
          text(state.label, box.x + box.w / 2, 399, 11, "#9fbbd3", "center");
        });
        text("40 px action slots", x, 428, 12, "#78cae8");
        [{}, { selected: true }, { focused: true }, { disabled: true }, { empty: true }].forEach((state, n) => {
          const box = { x: x + n * 51, y: 451, w: 40, h: 40 };
          drawItemFrame(ui, box, { rarity: entry.rarity, ...state });
          if (!state.empty) icon(entry,
            { x: box.x + 6, y: box.y + 6, w: box.w - 12, h: box.h - 12 }, state.disabled);
        });
      });

      c.fillStyle = "#285273"; c.fillRect(32, 514, 1216, 1);
      text("Appearance slot silhouettes", 32, 534, 22, "#b9efff");
      text("Original vector anatomy icons at the exact 36 px image height; cosmetic examples only.", 32, 565, 13);
      const anatomy = ["Helmet", "Visor", "Shoulders", "Chest armor", "Gloves", "Belt", "Legs", "Boots"];
      anatomy.forEach((kind, i) => {
        const middle = 80 + i * 154;
        const rarity = i === 0 ? "epic" : i === 3 || i === 7 ? "uncommon" : i === 5 ? "common" : "rare";
        const wide = { x: middle - 45, y: 598, w: 90, h: 73 };
        drawItemFrame(ui, wide, { rarity });
        text(kind, wide.x + 7, wide.y + 6, 9, "#91daff");
        drawAppearanceIcon(ui, { x: wide.x + 8, y: wide.y + 21, w: 74, h: 36 }, kind);
        text("Appearance", wide.x + 7, wide.y + 60, 8, "#9ab8d1");
        const narrow = { x: middle - 32.5, y: 690, w: 65, h: 73 };
        drawItemFrame(ui, narrow, { rarity });
        // Narrow card text is deliberately kept short; the silhouette carries
        // anatomy recognition, using the same dimensions as the game component.
        text(kind === "Chest armor" ? "Chest" : kind, narrow.x + 6, narrow.y + 6, 8, "#91daff");
        drawAppearanceIcon(ui, { x: narrow.x + 8, y: narrow.y + 21, w: 49, h: 36 }, kind);
        text("Appearance", narrow.x + 5, narrow.y + 60, 7, "#9ab8d1");
      });
      text("90 px cards above · 65 px cards below", 32, 779, 12);

      c.fillStyle = "#285273"; c.fillRect(32, 804, 1216, 1);
      text("Stat and action glyphs", 32, 819, 17, "#b9efff");
      const glyphs = ["heart", "shield", "bolt", "stamina", "scan", "repair", "dash", "crosshair", "medkit", "cargo", "flame", "radiation", "emp", "corrosion", "kinetic", "gear"];
      glyphs.forEach((kind, i) => {
        const x = 37 + i * 76;
        const color = ["#ff5c7e", "#27cfff", "#ffe66a", "#47e7b1"][i % 4];
        drawHudIcon(ui, { x: x + 10, y: 849, w: 28, h: 28 }, kind, { color, glow: true });
        text(kind, x + 24, 884, 10, "#a6c0d6", "center");
      });
      text("Canvas2D component evidence · no reference crops, invented equipment ownership or gameplay-state changes", 32, 921, 12, "#789bb8");
      return {
        title: "Item frame design gallery · presentation examples",
        canvasPixels: [canvas.width, canvas.height],
        moduleUrls: [frameUrl, glyphUrl, anatomyUrl],
        iconManifest: manifestUrl,
        examples: loaded.map(({ rarity, assetId, name, source }) => ({
          rarity, assetId, name, sourceUrl: `/assets/equipment/icons/${assetId}.png`,
          boundsPixels: source.boundsPixels, manifestSha256: source.sha256,
        })),
        frameStates: ["normal", "selected", "focused", "disabled", "empty"],
        hotbarLogicalPixels: 40,
        appearanceCardPixels: [[90, 73], [65, 73]],
        appearanceImageHeight: 36,
        provenance: "Actual production drawItemFrame, drawHudIcon and drawAppearanceIcon functions on an independent Canvas2D canvas; published equipment PNGs fitted using their manifest bounds. Presentation-only gallery, not a live inventory screenshot.",
      };
    }, { galleryId });

    // Playwright's download API saves the native PNG at 1280 × 948 regardless
    // of the current game viewport. No Node fs access is required in run-code.
    const downloadEvent = page.waitForEvent("download", { timeout: 15000 });
    await page.evaluate(({ galleryId }) => {
      const canvas = document.getElementById(galleryId);
      if (!(canvas instanceof HTMLCanvasElement)) throw new Error("Frame gallery disappeared");
      const link = document.createElement("a");
      link.download = "r002-frame-gallery.png";
      link.href = canvas.toDataURL("image/png");
      link.click();
    }, { galleryId });
    const download = await downloadEvent;
    await download.saveAs(target);
    return { output: target, ...provenance };
  } finally {
    await page.evaluate(({ galleryId }) => document.getElementById(galleryId)?.remove(), { galleryId });
  }
}
