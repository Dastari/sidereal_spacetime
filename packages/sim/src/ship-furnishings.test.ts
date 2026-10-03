import { expect, test } from "vitest";
import { PREFAB_SHIPS } from "@sidereal/content/prefabs";
import { defaultPrefabComponentCatalog } from "@sidereal/content/ship-prefab-catalog";
import { WAYFARER_GAMEPLAY_OBJECTS } from "@sidereal/content/wayfarer-authored-gameplay";
import {
  applyFurnishingMatrix,
  effectiveWayfarerObjects,
  readFurnishingOverrides,
} from "@sidereal/content/wayfarer-furnishings";
import {
  planFurnishingEdit,
  footprintFloorCoverage,
  deckRouteGroups,
  validateFurnishingPlacement,
} from "./ship-furnishings";
import { prefabShipObjects, prefabDeckObstacles } from "./prefab-deck-objects";
import { prefabCargoSockets } from "./prefab-cargo-sockets";
import { prefabBedSeats } from "./prefab-seats";
import { prefabBeamModel } from "./prefab-beam";
import type { DeckCollisionFrame } from "./construction-collision";
const doc = PREFAB_SHIPS.find((p) => p.id === "fed.m.wayfarer")!,
  catalog = defaultPrefabComponentCatalog();
const edit = (sourceObjectId: string, patch = {}) => ({
  sourceObjectId,
  action: "move",
  dx: 0.31,
  dy: 0.49,
  yaw: 0.32,
  snap: true,
  ...patch,
});

test("snapped and free commands differ, toggling snap preserves accepted geometry", () => {
  const snapped = planFurnishingEdit(doc, {}, edit("Lounge_coffee_table"));
  expect(snapped.Lounge_coffee_table.dx).toBe(0.25);
  expect(snapped.Lounge_coffee_table.dy).toBe(0.5);
  expect(snapped.Lounge_coffee_table.yaw).toBeCloseTo(Math.PI / 12, 6);
  const free = planFurnishingEdit(
    doc,
    {},
    edit("Lounge_coffee_table", { snap: false }),
  );
  expect(free.Lounge_coffee_table).toMatchObject({
    dx: 0.31,
    dy: 0.49,
    yaw: 0.32,
    snap: false,
  });
  const toggle = planFurnishingEdit(
    doc,
    free,
    edit("Lounge_coffee_table", { action: "snap", snap: true }),
  );
  expect(effectiveWayfarerObjects(toggle)).toEqual(
    effectiveWayfarerObjects(free),
  );
  for (const id of [
    "Cockpit_pilot_chair",
    "Cockpit_command_station",
    "PART_lounge_front",
    "Utility_utility_twin",
  ])
    expect(() => planFurnishingEdit(doc, {}, edit(id))).toThrow(/Fixed/);
  expect(() =>
    readFurnishingOverrides(
      '{"Cockpit_command_station":{"dx":1,"dy":0,"yaw":0,"snap":false,"deleted":false}}',
    ),
  ).toThrow();
});

test("one rotated placement agrees across render matrix, physical polygon, cargo and bed identities", () => {
  const id = "Quarters_A_bed_single",
    overrides = planFurnishingEdit(
      doc,
      {},
      edit(id, { dx: 0.4, dy: -0.8, yaw: Math.PI / 2, snap: false }),
    );
  const original = WAYFARER_GAMEPLAY_OBJECTS.find((o) => o.object === id)!,
    effective = effectiveWayfarerObjects(overrides).find(
      (o) => o.object === id,
    )!;
  const cx = (original.min[0] + original.max[0]) / 2,
    cy = (original.min[1] + original.max[1]) / 2;
  const matrix = applyFurnishingMatrix(
    id,
    [
      [2, 0, 0, cx],
      [0, 3, 0, cy],
      [0, 0, 1, 0],
      [0, 0, 0, 1],
    ],
    overrides,
  )!;
  const footprint = original.footprint.map(([x, y]) => {
    const a = (x - cx) / 2,
      b = (y - cy) / 3;
    return [
      matrix[0][0] * a + matrix[0][1] * b + matrix[0][3],
      matrix[1][0] * a + matrix[1][1] * b + matrix[1][3],
    ];
  });
  for (let i = 0; i < 4; i++) {
    expect(footprint[i][0]).toBeCloseTo(effective.footprint[i][0], 5);
    expect(footprint[i][1]).toBeCloseTo(effective.footprint[i][1], 5);
  }
  const collider = prefabDeckObstacles(doc, catalog, overrides).find(
    (o) => o.id === `prefab-socket:${id}`,
  )!;
  expect(collider.vertices).toEqual(
    effective.footprint.map(([x, y]) => [-y + 0, x + 0]),
  );
  const bed = prefabBedSeats(doc, catalog, overrides).find(
    (b) => b.placementId === `prefab:socket:${id}`,
  )!;
  const oldBed = prefabBedSeats(doc, catalog).find(
    (b) => b.placementId === bed.placementId,
  )!;
  expect(bed.placementId).toBe(oldBed.placementId);
  expect(bed.facing).toBeCloseTo(Math.PI);
  expect(bed.supportHeight).toBe(oldBed.supportHeight);
  const beam = prefabBeamModel(doc, catalog, overrides).objects.find(
    (o) => o.id === `socket:${id}`,
  )!;
  expect(beam.polygon).toEqual(
    effective.footprint.map(([x, y]) => [-y + 0, x + 0]),
  );
  const storage = "Cargo_crate_small_white",
    moved = planFurnishingEdit(
      doc,
      {},
      edit(storage, { dx: 0.5, dy: 0.25, yaw: 0 }),
    );
  const socket = prefabCargoSockets(doc, 0, catalog, moved).find(
      (s) => s.key === storage,
    )!,
    old = prefabCargoSockets(doc, 0, catalog).find((s) => s.key === storage)!;
  expect(socket.centreM[0]).toBeCloseTo(old.centreM[0] - 0.25);
  expect(socket.centreM[1]).toBeCloseTo(old.centreM[1] + 0.5);
  expect(original.object).toBe(id);
});

test("deleted objects cannot resurface and original sources and other prefabs remain unchanged", () => {
  const bytes = JSON.stringify(doc),
    id = "Lounge_coffee_table",
    deleted = planFurnishingEdit(doc, {}, edit(id, { action: "delete" }));
  expect(
    prefabShipObjects(doc, catalog, deleted).some((o) => o.sourceId === id),
  ).toBe(false);
  expect(
    prefabDeckObstacles(doc, catalog, deleted).some((o) => o.id.endsWith(id)),
  ).toBe(false);
  expect(
    applyFurnishingMatrix(
      id,
      [
        [1, 0, 0, 0],
        [0, 1, 0, 0],
        [0, 0, 1, 0],
        [0, 0, 0, 1],
      ],
      deleted,
    ),
  ).toBeUndefined();
  expect(() => planFurnishingEdit(doc, deleted, edit(id))).toThrow(/deleted/);
  expect(JSON.stringify(doc)).toBe(bytes);
  const wren = PREFAB_SHIPS.find((p) => p.id === "fed.s.wren")!;
  expect(prefabShipObjects(wren, catalog, deleted)).toEqual(
    prefabShipObjects(wren, catalog),
  );
});

const open: DeckCollisionFrame = {
  shipId: "ship",
  deckId: "deck",
  fingerprint: "test",
  elevationM: 0,
  floors: [
    [
      [-3, -3],
      [3, -3],
      [3, 3],
      [-3, 3],
    ],
  ],
  obstacles: [],
  segments: [],
};
test("dynamic crew routes are evaluated through clear floor paths and refuse a new partition barrier", () => {
  const before = deckRouteGroups(open, [
    [-2, 0],
    [2, 0],
  ]);
  expect(before[0]).toBe(before[1]);
  const blocked = {
    ...open,
    segments: [
      {
        id: "new",
        a: [0, -3] as [number, number],
        b: [0, 3] as [number, number],
        halfWidthM: 0.2,
      },
    ],
  };
  expect(
    deckRouteGroups(blocked, [
      [-2, 0],
      [2, 0],
    ])[0],
  ).not.toBe(
    deckRouteGroups(blocked, [
      [-2, 0],
      [2, 0],
    ])[1],
  );
  // Tombstone has no destination polygon; route preservation still evaluates living crew.
  const tombstone = planFurnishingEdit(
    doc,
    {},
    edit("Lounge_coffee_table", { action: "delete" }),
  );
  expect(() =>
    validateFurnishingPlacement(
      "Lounge_coffee_table",
      tombstone,
      open,
      blocked,
      [[-2, 0]],
      [[2, 0]],
    ),
  ).toThrow(/strand/);
});

test("complete floor coverage rejects an unsupported sliver narrower than a sampling interval", () => {
  const polygon: [
    [number, number],
    [number, number],
    [number, number],
    [number, number],
  ] = [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
  ];
  const coverage = footprintFloorCoverage(polygon, [
    [
      [0, 0],
      [0.499, 0],
      [0.499, 1],
      [0, 1],
    ],
    [
      [0.501, 0],
      [1, 0],
      [1, 1],
      [0.501, 1],
    ],
  ]);
  expect(coverage.area).toBe(1);
  expect(coverage.supported).toBeCloseTo(0.998, 10);
  expect(coverage.area - coverage.supported).toBeGreaterThan(0.001);
  expect(
    footprintFloorCoverage(polygon, [
      [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
      ],
    ]),
  ).toEqual({ area: 1, supported: 1 });
});

test("placement validation rejects unsupported sub-sample slivers and living crew overlap", () => {
  const id = "Lounge_coffee_table",
    row = effectiveWayfarerObjects().find((o) => o.object === id)!;
  const xs = row.footprint.map((p) => -p[1]),
    ys = row.footprint.map((p) => p[0]);
  const left = Math.min(...xs) - 1,
    right = Math.max(...xs) + 1,
    bottom = Math.min(...ys) - 1,
    top = Math.max(...ys) + 1;
  const cx = (left + right) / 2,
    cy = (bottom + top) / 2;
  const rect = (a: number, b: number): [number, number][] => [
    [a, bottom],
    [b, bottom],
    [b, top],
    [a, top],
  ];
  const whole = { ...open, floors: [rect(left, right)] },
    slit = {
      ...whole,
      floors: [rect(left, cx - 0.001), rect(cx + 0.001, right)],
    };
  expect(() =>
    validateFurnishingPlacement(id, {}, whole, slit, [], []),
  ).toThrow(/complete supported/);
  expect(() =>
    validateFurnishingPlacement(id, {}, whole, whole, [[cx, cy]], []),
  ).toThrow(/crew/);
});
