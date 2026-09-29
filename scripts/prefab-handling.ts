/**
 * Print the handling and budget table of the developer prefabs (proposed balance, not approved).
 * `npx tsx scripts/prefab-handling.ts [--catalog N] [--class S] [--id wren]`
 */
import { PREFAB_SHIPS } from "../packages/content/src/prefabs";
import { prefabStats } from "../packages/content/src/ship-prefab";
import { prefabComponentCatalogAt } from "../packages/content/src/ship-prefab-catalog";
import {
  SHIP_COMPONENT_CATALOG_REVISION,
  type ShipComponentCatalogRevision,
} from "../packages/content/src/ship-components-source";
import { prefabHandling } from "../packages/sim/src/prefab-handling";

const arg = (k: string) => {
  const i = process.argv.indexOf(k);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const rev = Number(
  arg("--catalog") ?? SHIP_COMPONENT_CATALOG_REVISION,
) as ShipComponentCatalogRevision;
const only = arg("--class");
const id = arg("--id");
const catalog = prefabComponentCatalogAt(rev);
const f = (v: number, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : "inf");
const deg = (r: number) => (r * 180) / Math.PI;
const head = [
  "Prefab",
  "Class",
  "Mass",
  "Fwd m/s²",
  "Rev m/s²",
  "Lat m/s²",
  "Yaw accel rad/s²",
  "0→28.5 m/s (s)",
  "Stop from 30 m/s (s, m)",
  "90° turn from rest (s)",
  "Peak yaw °/s",
  "Turn at speed °/s",
  "Power gen/draw kW",
  "Heat gen/rej kW",
];
console.log(`catalog revision ${rev}`);
console.log(`| ${head.join(" | ")} |`);
console.log(`|${head.map(() => "---").join("|")}|`);
for (const doc of PREFAB_SHIPS) {
  if (only && doc.sizeClass !== only) continue;
  if (id && !doc.id.includes(id)) continue;
  const h = prefabHandling(doc, catalog);
  const st = prefabStats(doc, catalog);
  const e = h.envelope;
  const row = [
    `${doc.id} r${doc.revision}`,
    doc.sizeClass,
    `${f(h.massKg / 1000, 1)} t`,
    f(e.forward),
    f(e.reverse),
    f(Math.min(e.left, e.right)),
    f(Math.min(e.angularPositive, e.angularNegative), 3),
    f(h.zeroToCruiseS, 1),
    `${f(h.stopS, 1)} (${f(h.stopDistanceM, 0)})`,
    f(h.turn90S, 1),
    f(deg(h.yawRateRadS), 0),
    f(deg(h.cruiseTurnRadS), 1),
    `${f(st.powerGenerationW / 1000, 0)}/${f(st.powerDrawW / 1000, 0)}`,
    `${f(st.heatGenerationW / 1000, 0)}/${f(st.heatDissipationW / 1000, 0)}`,
  ];
  console.log(`| ${row.join(" | ")} |`);
}
