/** Offline coverage evidence. Presentation cells and synthetic cuts never enter authority. */
import { writeFileSync } from "node:fs";
import { PREFAB_SHIPS } from "@sidereal/content/prefabs";
import {
  SHIP_VISUAL_FIXTURES,
  familyReviewCut,
} from "@sidereal/content/ship-visual-fixture";
import { defaultPrefabComponentCatalog } from "@sidereal/content/ship-prefab-catalog";
import {
  compileShipVisual,
  visualVolumeSha256,
} from "@sidereal/sim/ship-visual-compiler";
import { meshSampledStructure } from "../../packages/render/src/prefab-ship/sampled-structure";
const catalog = defaultPrefabComponentCatalog();
const results = [];
for (const doc of [...PREFAB_SHIPS, ...SHIP_VISUAL_FIXTURES]) {
  const original = JSON.stringify(doc);
  const profile =
    doc.theme === "riftjack" || doc.theme === "industrial"
      ? "riftjack"
      : doc.theme === "aurelian" || doc.theme === "crystalline"
        ? "aurelian"
        : "federation";
  for (const view of ["deck", "flight"] as const) {
    const start = performance.now(),
      c = compileShipVisual(doc, catalog, view, profile),
      m = meshSampledStructure(c.cells);
    if (JSON.stringify(doc) !== original)
      throw Error("Compiler mutated a prefab");
    const bounds = [
      Infinity,
      Infinity,
      Infinity,
      -Infinity,
      -Infinity,
      -Infinity,
    ];
    for (const cell of c.cells.values())
      for (let a = 0; a < 3; a++) {
        const n = [cell.x, cell.y, cell.z][a];
        bounds[a] = Math.min(bounds[a], n / 16);
        bounds[a + 3] = Math.max(bounds[a + 3], (n + 1) / 16);
      }
    results.push({
      id: doc.id,
      profile,
      view,
      layers: c.layers.length,
      cells: c.cells.size,
      triangles: m.reduce((s, g) => s + g.triangles, 0),
      milliseconds: Math.round(performance.now() - start),
      bounds,
      sha256: visualVolumeSha256(c.cells),
    });
  }
}
const proofs = SHIP_VISUAL_FIXTURES.map((doc) => {
  const profile = doc.theme as "federation" | "riftjack" | "aurelian";
  const intact = compileShipVisual(doc, catalog, "deck", profile),
    cut = compileShipVisual(doc, catalog, "deck", profile, familyReviewCut()),
    repair = compileShipVisual(doc, catalog, "deck", profile);
  const intactSha = visualVolumeSha256(intact.cells),
    repairSha = visualVolumeSha256(repair.cells);
  if (intactSha !== repairSha || cut.cells.size >= intact.cells.size)
    throw Error("Synthetic damage/repair proof failed");
  return {
    id: doc.id,
    synthetic: true,
    intactSha,
    repairSha,
    removed: intact.cells.size - cut.cells.size,
    charts: meshSampledStructure(cut.cells).flatMap((g) => g.surfaceCharts),
  };
});
const output =
  JSON.stringify(
    {
      schema: "sidereal.ship-visual-proof.v1",
      authorityChanged: false,
      results,
      proofs,
    },
    null,
    2,
  ) + "\n";
if (process.argv[2]) writeFileSync(process.argv[2], output);
else console.log(output);
