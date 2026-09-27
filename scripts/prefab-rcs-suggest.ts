/**
 * Developer aid: suggest valid side-face positions for bow and stern RCS clusters on prefabs
 * that lack manoeuvring thrust. Prints `face(...)` lines to paste into the design files.
 *   npx tsx scripts/prefab-rcs-suggest.ts
 */
import { PREFAB_SHIPS } from "../packages/content/src/prefabs/index";
import { axisFaces } from "../packages/content/src/construction-grammar";
import { validateMount, volumeGeometry, prefabBounds, type PrefabMount } from "../packages/content/src/ship-prefab";
import { defaultPrefabComponentCatalog } from "../packages/content/src/ship-prefab-catalog";

const catalog = defaultPrefabComponentCatalog();
for (const doc of PREFAB_SHIPS) {
  if (doc.mounts.some((m) => m.component.startsWith("rcs."))) continue;
  const geoms = doc.volumes.map(volumeGeometry);
  const [x0, , x1] = prefabBounds(geoms);
  const candidates: { at: [number, number]; normal: "port" | "starboard" }[] = [];
  for (const g of geoms)
    for (const f of g.outline ? axisFaces(g.outline.outer) : [])
      if (f.normal === "port" || f.normal === "starboard")
        for (let x = Math.min(f.a[0], f.b[0]) + 0.5; x <= Math.max(f.a[0], f.b[0]) - 0.5; x += 0.5) candidates.push({ at: [x, f.a[1]], normal: f.normal });
  const picks: PrefabMount[] = [];
  for (const [label, tx] of [["bow", x1], ["stern", x0]] as const)
    for (const normal of ["port", "starboard"] as const) {
      const pool = candidates.filter((c) => c.normal === normal).sort((a, b) => Math.abs(a.at[0] - tx) - Math.abs(b.at[0] - tx));
      for (const c of pool) {
        const m: PrefabMount = { id: `rcs-${label}-${normal === "port" ? "p" : "s"}`, component: "rcs.sm", attach: "face", normal, at: c.at };
        const trial = { ...doc, mounts: [...doc.mounts, ...picks, m] };
        if (!validateMount(trial, m, catalog).some((i) => i.severity === "error")) {
          picks.push(m);
          break;
        }
      }
    }
  console.log(doc.id);
  for (const m of picks) console.log(`    face("${m.id}", "rcs.sm", "${m.normal}", [${m.at[0]}, ${m.at[1]}]),`);
}
