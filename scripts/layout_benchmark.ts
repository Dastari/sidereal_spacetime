/** Local pure-compiler measurements; does not start or publish any service. */
import { writeFileSync, mkdirSync } from "node:fs";
import { cpus, platform, arch } from "node:os";
import {
  emptyLayout,
  stampTile,
  layoutFixture,
} from "../packages/content/src/ship-layout";
import { compileLayout } from "../packages/sim/src/layout-compiler";
function station(n: number) {
  const d = emptyLayout(`station-${n}`, "deck", "station-module");
  for (let i = 0; i < n; i++)
    d.tiles.push(
      stampTile(`tile-${i}`, "deck", "rectangle", [
        (i % 32) * 64,
        Math.floor(i / 32) * 64,
      ]),
    );
  return d;
}
const collinear = emptyLayout("collinear-2048", "deck");
collinear.tiles.push({
  ...stampTile("spine", "deck", "rectangle", [0, 0]),
  vertices: [
    [0, 0],
    [8188, 0],
    [8188, 32],
    [0, 32],
  ],
});
for (let i = 0; i < 2047; i++)
  collinear.tiles.push({
    ...stampTile(`slice-${i}`, "deck", "rectangle", [0, 0]),
    vertices: [
      [i * 4, 32],
      [(i + 1) * 4, 32],
      [(i + 1) * 4, 64],
      [i * 4, 64],
    ],
  });
const mixed = station(1024);
mixed.id = "mixed-1024-64-fittings-64-branches";
mixed.nodes.push({
  id: "source",
  deckId: "deck",
  point: [16, 16],
  channel: "power",
  kind: "junction",
  direction: "out",
  medium: "power",
});
for (let i = 0; i < 64; i++) {
  const x = (i % 32) * 64 + 32,
    y = Math.floor(i / 32) * 64 + 32;
  mixed.fittings.push({
    id: `fitting-${i}`,
    deckId: "deck",
    definitionId: "unassigned",
    revision: "draft",
    position: [x, y],
    footprint: [16, 16],
    clearance: 0,
    quarterTurns: 0,
    reflected: false,
    kind: i % 2 ? "equipment" : "container",
    container: i % 2 ? null : { columns: 4, rows: 3, contents: [] },
  });
  mixed.nodes.push({
    id: `sink-${i}`,
    deckId: "deck",
    point: [x, y],
    channel: "power",
    kind: "endpoint",
    direction: "in",
    medium: "power",
  });
  mixed.routes.push({
    id: `branch-${i}`,
    deckId: "deck",
    channel: "power",
    from: "source",
    to: `sink-${i}`,
    path: [
      [16, 16],
      [x, 16],
      [x, y],
    ],
    capacity: null,
  });
}
const fixtures = [
  layoutFixture(),
  station(256),
  station(1024),
  station(2048),
  collinear,
  mixed,
];
mkdirSync("output/playwright/ship-layout", { recursive: true });
writeFileSync(
  "output/playwright/ship-layout/benchmark-fixtures.json",
  JSON.stringify(fixtures),
);
writeFileSync(
  "output/playwright/ship-layout/node-compiler-output.json",
  JSON.stringify(compileLayout(fixtures[0])),
);
const rows = fixtures.map((doc) => {
  const times: number[] = [];
  let result = compileLayout(doc);
  for (let i = 0; i < 22; i++) {
    const start = performance.now();
    result = compileLayout(doc);
    const ms = performance.now() - start;
    if (i > 1) times.push(ms);
  }
  times.sort((a, b) => a - b);
  return {
    fixture: doc.id,
    tiles: doc.tiles.length,
    valid: result.valid,
    edges: result.edges.length,
    walls: result.walls.length,
    p50: times[10],
    p95: times[18],
    max: times.at(-1),
    fingerprint: result.fingerprint,
  };
});
const report = {
  runtime: process.version,
  platform: platform() + " " + arch(),
  cpu: cpus()[0].model,
  logicalCores: cpus().length,
  iterations: 20,
  rows,
};
mkdirSync("output/playwright/ship-layout", { recursive: true });
writeFileSync(
  "output/playwright/ship-layout/compiler-benchmark.json",
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify(report, null, 2));
