/**
 * Lists the ship component ids the prefab ships use (Wren first), for runtime publication.
 *
 *   npx tsx scripts/ship-components-prefab-usage.ts [--json]
 */
import { PREFAB_SHIPS } from "../packages/content/src/prefabs/index";
import { buildShipComponentCatalog } from "../packages/content/src/ship-components-source";

const catalog = new Map(buildShipComponentCatalog().components.map((c) => [c.id, c]));
const used = new Map<string, string[]>();
for (const ship of PREFAB_SHIPS) {
  for (const m of ship.mounts) used.set(m.component, [...new Set([...(used.get(m.component) ?? []), ship.id])]);
}
const ids = [...used.keys()].sort();
if (process.argv.includes("--json")) console.log(JSON.stringify(ids));
else
  for (const id of ids)
    console.log(`${id.padEnd(30)} ${catalog.get(id)?.art.glb ? "glb" : "NO-GLB"}  ${used.get(id)!.join(", ")}`);
