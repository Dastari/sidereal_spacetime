/**
 * Dump the real TypeScript dresser output for the developer prefab ships as JSON, for the
 * headless Blender review renderer (scripts/art_library/render_prefabs.py). Presentation
 * evidence only: it reads content, never writes assets or authority state.
 *
 *   npx tsx scripts/prefab-dress-dump.ts --out DIR [--only id,id]
 *
 * Per prefab `<id>.json`: the dressed ship (kit placements, generated boxes, decals, objects,
 * lights, labels), the theme slot table, component placements resolved to GLB paths with
 * anchor/anchorZ in metres, the prefab origin and `prefabStats`. Deterministic (no timestamps).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { G, TEXEL } from "../packages/content/src/construction-grammar";
import { PREFAB_SHIPS, STARTER_CANDIDATES } from "../packages/content/src/prefabs/index";
import { SHIP_KIT_SLOTS } from "../packages/content/src/ship-kit";
import { prefabOrigin, prefabStats, validateShipPrefab } from "../packages/content/src/ship-prefab";
import { defaultPrefabComponentCatalog } from "../packages/content/src/ship-prefab-catalog";
import { SHIP_THEMES } from "../packages/content/src/ship-themes";
import { SHIP_DRESSER_VERSION, dressFingerprint, dressShip, type ComponentPlacement } from "../packages/sim/src/ship-dresser";

const args = process.argv.slice(2);
const opt = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const root = resolve(import.meta.dirname, "..");
const out = resolve(opt("--out") ?? "output/prefab-dress");
const only = opt("--only")?.split(",").filter(Boolean);
mkdirSync(out, { recursive: true });

const COMPONENT_MANIFEST = "assets/art-library/ship-components/r001/manifest.json";
const compManifest = JSON.parse(readFileSync(join(root, COMPONENT_MANIFEST), "utf8")) as {
  revision: string;
  components: { id: string; glb: string; frame: string; boundsM: [[number, number, number], [number, number, number]] }[];
};
const compById = new Map(compManifest.components.map((c) => [c.id, c]));
const catalog = defaultPrefabComponentCatalog();

/** Socket class used for the authored-frame rotation (mirrors render/prefab-ship/ship-view.ts socketOf). */
function socketOf(c: ComponentPlacement): string {
  const m = c.placement.mount;
  if (m.attach === "face") return c.placement.rear ? "rear" : "face";
  return m.attach;
}
const frameOfSocket = (s: string | undefined) => (s === "top" || s === "bottom" ? "top" : s === "interior" ? "interior" : "face");
const r6 = (v: number) => Math.round(v * 1e6) / 1e6;

const index: unknown[] = [];
for (const doc of PREFAB_SHIPS) {
  if (only && !only.includes(doc.id)) continue;
  const dressed = dressShip(doc, { catalog });
  const stats = prefabStats(doc, catalog);
  const issues = validateShipPrefab(doc, catalog);
  const theme = SHIP_THEMES[doc.theme];
  const components = dressed.components.map((c) => {
    const p = c.placement;
    const art = compById.get(c.component);
    const glb = art && existsSync(join(root, art.glb)) ? art.glb : null;
    return {
      mount: c.mount,
      component: c.component,
      category: p.spec?.category ?? null,
      sizeClass: p.spec?.sizeClass ?? null,
      attach: p.mount.attach,
      normal: p.mount.normal ?? null,
      socket: socketOf(c),
      authoredFrame: frameOfSocket(p.spec?.attach[0]),
      glb,
      glbBoundsM: art?.boundsM ?? null,
      quarterTurns: p.quarterTurns,
      anchor: [r6(p.anchor[0]), r6(p.anchor[1])],
      anchorZ: r6(p.anchorZ * TEXEL),
      rect: p.rect,
      zM: [r6(p.z[0] * TEXEL), r6(p.z[1] * TEXEL)],
      rear: p.rear,
      mainEngine: p.spec?.category === "propulsion" && p.rear && p.mount.attach === "face",
      host: p.host,
      view: c.view,
    };
  });
  const { components: _omit, ...rest } = dressed;
  const dump = {
    schema: "sidereal.prefab-dress-dump.v1",
    dresser: SHIP_DRESSER_VERSION,
    fingerprint: dressFingerprint(dressed),
    id: doc.id,
    name: doc.name,
    role: doc.role,
    faction: doc.faction,
    sizeClass: doc.sizeClass,
    starter: STARTER_CANDIDATES.includes(doc.id),
    origin: prefabOrigin(doc),
    texelM: TEXEL,
    slots: SHIP_KIT_SLOTS,
    grammar: { deck: G.deck },
    kitDir: "assets/runtime/ship-kit/r001",
    theme: { id: theme.id, label: theme.label, slots: theme.slots, wear: theme.wear, wearColour: theme.wearColour, inkOnDark: theme.inkOnDark, inkOnLight: theme.inkOnLight, plume: theme.plume },
    stats,
    issues: issues.map((i) => ({ severity: i.severity, code: i.code, message: i.message })),
    dressed: rest,
    components,
  };
  writeFileSync(join(out, `${doc.id}.json`), JSON.stringify(dump));
  index.push({ id: doc.id, name: doc.name, sizeClass: doc.sizeClass, theme: doc.theme, starter: dump.starter, bounds: dressed.bounds });
  console.log(`${doc.id}: ${dressed.kit.length} kit, ${dressed.generated.reduce((n, g) => n + g.boxes.length, 0)} boxes, ${components.length} components (${components.filter((c) => !c.glb).length} without GLB), ${issues.filter((i) => i.severity === "error").length} errors`);
}
writeFileSync(join(out, "index.json"), JSON.stringify({ starters: STARTER_CANDIDATES, ships: index }, null, 1));
