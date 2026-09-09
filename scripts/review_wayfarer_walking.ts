/** Offline authority-compiler and reachability evidence; no server mutation. */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { WAYFARER_CONVERSION_PIN as PIN } from "../packages/content/src/wayfarer-conversion-candidate";
import {
  createWayfarerConversionCandidate,
  type WayfarerPinnedInputs,
} from "../packages/sim/src/wayfarer-conversion-candidate";
import { qualifiedWayfarerWalkingBindings } from "../packages/sim/src/wayfarer-walking-bindings";
import {
  compileDeckCollision,
  resolveDeckCollision,
  canOccupyDeck,
  sweepDeckCircle,
} from "../packages/sim/src/construction-collision";
import { planConstructionInstance } from "../packages/sim/src/construction-instance";
import type { Point } from "../packages/content/src/ship-layout";
const root = resolve(import.meta.dirname, "..");
const c = createWayfarerConversionCandidate(
  Object.fromEntries(
    Object.keys(PIN.sources).map((p) => [
      p,
      readFileSync(resolve(root, p), "utf8"),
    ]),
  ) as WayfarerPinnedInputs,
);
const bindings = qualifiedWayfarerWalkingBindings(c.snapshot, 0.3, 1.8);
let n = 0;
const allocate = () =>
  `00000000-0000-4000-8000-${(++n).toString(16).padStart(12, "0")}`;
const request = {
  blueprintRevisionId: "private-offline-review",
  expectedBlueprintSha256: c.snapshot.sha256,
  sourceDeckId: PIN.deckId,
  bodyRadiusM: 0.3,
  bodyHeightM: 1.8,
  perimeterHalfWidthM: 0.05,
  partitionHalfWidthM: 0.05,
  objectCollisionBindings: bindings,
};
const a = planConstructionInstance(c.snapshot, request, allocate),
  b = planConstructionInstance(c.snapshot, request, allocate);
const frame = resolveDeckCollision(
  compileDeckCollision(c.document.layout, PIN.deckId, {
    shipId: "offline-review",
    perimeterHalfWidthM: 0.05,
    partitionHalfWidthM: 0.05,
    obstacles: bindings.flatMap((b) =>
      b.obstacles.map((o, i) => ({
        id: b.sourceObjectId + "-" + i,
        definitionId: b.definitionId,
        vertices: o.vertices,
      })),
    ),
  }),
  [],
);
const loc = (p: Point) => ({
  shipId: "offline-review",
  deckId: PIN.deckId,
  position: p,
});
const points: Point[] = [];
for (let x = -4.5; x <= 4.5; x += 0.25)
  for (let y = -8.5; y <= 12.5; y += 0.25)
    if (canOccupyDeck(frame, loc([x, y]), 0.3)) points.push([x, y]);
const available = new Set(points.map((p) => p.join(","))),
  queue: Point[] = [a.spawn.positionM],
  seen = new Set([a.spawn.positionM.join(",")]),
  parent = new Map<string, string>();
for (let i = 0; i < queue.length; i++)
  for (const d of [
    [0.25, 0],
    [-0.25, 0],
    [0, 0.25],
    [0, -0.25],
  ] as Point[]) {
    const p = queue[i],
      next: Point = [p[0] + d[0], p[1] + d[1]],
      key = next.join(",");
    if (seen.has(key) || !available.has(key)) continue;
    const moved = sweepDeckCircle(frame, loc(p), d, 0.3);
    if (
      Math.hypot(moved.position[0] - next[0], moved.position[1] - next[1]) >
      1e-5
    )
      continue;
    seen.add(key);
    parent.set(key, p.join(","));
    queue.push(next);
  }
const probes = (
  [
    ["main-corridor", [0, 0]],
    ["aft-corridor", [0, -6]],
    ["forward-corridor", [0, 7]],
    ["bridge-control", [0, 10.25]],
    ["bridge-sill", [0, 8.8125]],
    ["port-aft-room", [-2.5, -5]],
    ["starboard-forward-room", [2.5, 5]],
  ] as [string, Point][]
).map(([name, p]) => ({
  name,
  point: p,
  canStand: canOccupyDeck(frame, loc(p), 0.3),
  onReachableQuarterMetreGrid: seen.has(p.join(",")),
}));
const route = (target: string) => {
  if (!seen.has(target)) return [];
  const path: string[] = [target];
  while (parent.has(path[0])) path.unshift(parent.get(path[0])!);
  return path.map((k) => k.split(",").map(Number));
};
const report = {
  routes: { toCorridor: route("0,0"), toForward: route("0,7") },
  scope:
    "Offline pure authoritative compiler; no live or isolated database spawn asserted",
  documentSha256: c.snapshot.sha256,
  sourceObjects: bindings.length,
  firstSpawn: a.spawn,
  secondSpawn: b.spawn,
  independentAllocatedIds: !a.allocatedIds.some((id) =>
    b.allocatedIds.includes(id),
  ),
  allocatedIdsPerInstance: a.allocatedIds.length,
  standingGridPoints: points.length,
  reachableGridPoints: seen.size,
  probes,
  limitations: [
    "Whole-object convex covers can reject legitimate openings",
    "Doorway sill cannot be stepped over by current flat-deck authority",
    "No pressure, structural loading, flight, cargo/entity lifecycle or live refit qualification",
  ],
};
mkdirSync(resolve(root, ".runtime", PIN.id), { recursive: true });
writeFileSync(
  resolve(root, ".runtime", PIN.id, "walking-review.json"),
  JSON.stringify(report, null, 2) + "\n",
);
console.log(JSON.stringify(report));
