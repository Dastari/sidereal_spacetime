import { expect, test } from "vitest";
import {
  emptyLayout,
  stampTile,
  type LayoutDocument,
  type Point,
} from "@sidereal/content/ship-layout";
import {
  planNativeBoundaries,
  NATIVE_BOUNDARY_KIT,
  NATIVE_BOUNDARY_LIMITS,
  type NativeBoundaryObstacle,
} from "./construction-boundaries";

const options = { floorTopUnits: 6 };
function square(columns = 2, rows = 2) {
  const d = emptyLayout("native-test", "deck");
  for (let x = 0; x < columns; x++)
    for (let y = 0; y < rows; y++)
      d.tiles.push(
        stampTile(`floor-${x}-${y}`, "deck", "rectangle", [x * 64, y * 64]),
      );
  return d;
}
function doorway(reverse = false): LayoutDocument {
  const d = square();
  d.partitions.push({
    id: "partition",
    deckId: "deck",
    a: [64, 0],
    b: [64, 128],
    seal: "design-sealed",
  });
  d.openings.push({
    id: "door",
    deckId: "deck",
    partitionId: "partition",
    a: [64, reverse ? 52 : 12],
    b: [64, reverse ? 12 : 52],
    kind: "door",
    clearance: 16,
    sill: 0,
  });
  return d;
}
function obstacle(
  id: string,
  polygonUnits: Point[],
  deckId = "deck",
): NativeBoundaryObstacle {
  return {
    id,
    deckId,
    definitionId: "explicit-test-obstruction",
    polygonUnits,
    bottomUnits: 6,
    topUnits: 80,
  };
}

test("closed loop uses8native2m walls and exactly one closure per endpoint", () => {
  const p = planNativeBoundaries(square(), "deck", options);
  expect(p.placements.filter((p) => p.partId === "wall-2m")).toHaveLength(8);
  expect(
    p.placements.filter((p) => p.partId === "closure-corner"),
  ).toHaveLength(4);
  expect(p.placements.filter((p) => p.partId === "join-straight")).toHaveLength(
    4,
  );
  expect(new Set(p.placements.map((p) => p.key)).size).toBe(16);
  expect(p.acceptance).toEqual({
    geometryFit: true,
    pressureApproved: false,
    damageApproved: false,
    ownerArtApproved: false,
  });
  expect(p.kit.sha256).toBe(NATIVE_BOUNDARY_KIT.sha256);
});

test("coalesces harmless floor tile splits before selecting native module lengths", () => {
  const d = emptyLayout("strips", "deck");
  for (let x = 0; x < 4; x++)
    d.tiles.push({
      ...stampTile(`t${x}`, "deck", "rectangle", [0, 0]),
      vertices: [
        [x * 32, 0],
        [(x + 1) * 32, 0],
        [(x + 1) * 32, 64],
        [x * 32, 64],
      ],
    });
  const p = planNativeBoundaries(d, "deck", options);
  expect(p.placements.filter((p) => p.partId.startsWith("wall"))).toHaveLength(
    6,
  );
  expect(p.placements.filter((p) => p.partId === "wall-1m")).toHaveLength(0);
  expect(p.placements.some((p) => p.originUnits[0] === 32)).toBe(false);
});

test("splits perimeter at a partition T endpoint and keeps one native T node", () => {
  const d = square();
  d.partitions.push({
    id: "p",
    deckId: "deck",
    a: [64, 0],
    b: [64, 128],
    seal: "design-sealed",
  });
  const p = planNativeBoundaries(d, "deck", options);
  expect(p.placements.filter((p) => p.partId === "closure-t")).toHaveLength(2);
  for (const y of [0, 128])
    expect(
      p.placements.filter(
        (p) =>
          p.originUnits[0] === 64 &&
          p.originUnits[1] === y &&
          p.partId.startsWith("closure"),
      ),
    ).toHaveLength(1);
});

test("supports1m residual spans and free partition end closures", () => {
  const d = square();
  d.partitions.push({
    id: "p",
    deckId: "deck",
    a: [64, 0],
    b: [64, 64],
    seal: "design-sealed",
  });
  const p = planNativeBoundaries(d, "deck", options);
  expect(p.placements.filter((p) => p.partId === "closure-end")).toHaveLength(
    1,
  );
  const s = emptyLayout("one", "deck");
  s.tiles = [
    {
      ...stampTile("t", "deck", "rectangle", [0, 0]),
      vertices: [
        [0, 0],
        [96, 0],
        [96, 64],
        [0, 64],
      ],
    },
  ];
  expect(
    planNativeBoundaries(s, "deck", options).placements.filter(
      (p) => p.partId === "wall-1m",
    ),
  ).toHaveLength(2);
});

test("door frame replaces complete2m span rather than opening-gap wall remnants", () => {
  const p = planNativeBoundaries(doorway(), "deck", options);
  const frame = p.placements.find((p) => p.partId === "door-frame-2m")!,
    leaf = p.placements.find((p) => p.partId === "door-leaf")!;
  expect(frame.originUnits).toEqual([64, 0, 0]);
  expect(frame.quarterTurns).toBe(1);
  expect(frame.openingId).toBe("door");
  expect(leaf.originUnits).toEqual(frame.originUnits);
  expect(leaf.quarterTurns).toBe(1);
  expect(p.doors[0].frameEndUnits).toEqual([64, 64]);
  expect(
    p.placements.filter(
      (p) =>
        p.partId.startsWith("wall") &&
        p.originUnits[0] === 64 &&
        p.originUnits[1] === 0 &&
        p.quarterTurns === 1,
    ),
  ).toHaveLength(0);
  expect(
    p.placements.some(
      (p) => p.originUnits[1] === 12 || p.originUnits[1] === 52,
    ),
  ).toBe(false);
});

test("authored opening direction selects swing side, never a guessed room label", () => {
  const a = planNativeBoundaries(doorway(), "deck", options),
    b = planNativeBoundaries(doorway(true), "deck", options);
  expect(a.doors[0].quarterTurns).toBe(1);
  expect(b.doors[0].quarterTurns).toBe(3);
  expect(Math.min(...a.doors[0].swingPolygonUnits.map((p) => p[0]))).toBe(64);
  expect(Math.max(...b.doors[0].swingPolygonUnits.map((p) => p[0]))).toBe(64);
  const o = obstacle("chair", [
    [75, 20],
    [80, 20],
    [80, 25],
    [75, 25],
  ]);
  expect(() =>
    planNativeBoundaries(doorway(), "deck", { ...options, obstacles: [o] }),
  ).toThrow("SWING_OBJECT");
  expect(() =>
    planNativeBoundaries(doorway(true), "deck", { ...options, obstacles: [o] }),
  ).not.toThrow();
});

test("requires the full conservative swing support, not just narrow authored approach clearance", () => {
  const d = doorway();
  for (const t of d.tiles)
    for (const p of t.vertices) if (p[0] === 128) p[0] = 96;
  expect(() => planNativeBoundaries(d, "deck", options)).toThrow(
    "SWING_SUPPORT",
  );
});

test("swing intersects a parallel partition even when the floor fully supports it", () => {
  const d = emptyLayout("narrow", "deck");
  for (let x = 0; x < 4; x++)
    for (let y = 0; y < 2; y++)
      d.tiles.push({
        ...stampTile(`${x}-${y}`, "deck", "rectangle", [0, 0]),
        vertices: [
          [x * 32, y * 64],
          [(x + 1) * 32, y * 64],
          [(x + 1) * 32, (y + 1) * 64],
          [x * 32, (y + 1) * 64],
        ],
      });
  d.partitions = doorway().partitions;
  d.openings = doorway().openings;
  d.partitions.push({
    id: "parallel",
    deckId: "deck",
    a: [96, 0],
    b: [96, 128],
    seal: "design-sealed",
  });
  expect(() => planNativeBoundaries(d, "deck", options)).toThrow("SWING_WALL");
});

test("rejects narrow/misaligned door frames, nonzero sill and unsupported opening kinds", () => {
  const narrow = doorway();
  narrow.openings[0].b[1] = 44;
  expect(() => planNativeBoundaries(narrow, "deck", options)).toThrow(
    "OPENING_WIDTH",
  );
  const frame = doorway();
  frame.openings[0].a[1] = 8;
  frame.openings[0].b[1] = 48;
  expect(() => planNativeBoundaries(frame, "deck", options)).toThrow(
    "FRAME_ANCHOR",
  );
  const partial = doorway();
  partial.openings[0].a[1] = 20;
  partial.openings[0].b[1] = 60;
  expect(() => planNativeBoundaries(partial, "deck", options)).toThrow(
    "PARTIAL_SPAN",
  );
  for (const kind of ["airlock", "passage"] as const) {
    const d = doorway();
    d.openings[0].kind = kind;
    expect(() => planNativeBoundaries(d, "deck", options)).toThrow(
      "OPENING_KIND",
    );
  }
  const sill = doorway();
  sill.openings[0].sill = 1;
  expect(() => planNativeBoundaries(sill, "deck", options)).toThrow(
    "OPENING_KIND",
  );
});

test("rejects frame overlap despite distinct nonoverlapping apertures", () => {
  const d = doorway();
  d.openings.push({
    ...d.openings[0],
    id: "door-b",
    a: [64, 60],
    b: [64, 100],
  });
  expect(() => planNativeBoundaries(d, "deck", options)).toThrow(
    "FRAME_OVERLAP",
  );
});

test("rejects a T-junction inside a frame and unsupported four-way crossings", () => {
  const d = doorway();
  d.tiles = [];
  for (const x of [0, 64])
    for (const [y0, y1] of [
      [0, 40],
      [40, 128],
    ])
      d.tiles.push({
        ...stampTile(`${x}-${y0}`, "deck", "rectangle", [0, 0]),
        vertices: [
          [x, y0],
          [x + 64, y0],
          [x + 64, y1],
          [x, y1],
        ],
      });
  d.partitions.push({
    id: "branch",
    deckId: "deck",
    a: [0, 40],
    b: [64, 40],
    seal: "design-sealed",
  });
  d.openings[0].a[1] = 44;
  d.openings[0].b[1] = 84;
  expect(() => planNativeBoundaries(d, "deck", options)).toThrow(
    "FRAME_JUNCTION",
  );
  const x = square();
  x.partitions = [
    {
      id: "v",
      deckId: "deck",
      a: [64, 0],
      b: [64, 128],
      seal: "design-sealed",
    },
    {
      id: "h",
      deckId: "deck",
      a: [0, 64],
      b: [128, 64],
      seal: "design-sealed",
    },
  ];
  expect(() => planNativeBoundaries(x, "deck", options)).toThrow("X_JUNCTION");
});

test("exact semantic keys and placements are independent of source input order and perimeter tile seams", () => {
  const d = doorway(),
    before = structuredClone(d),
    a = planNativeBoundaries(d, "deck", options);
  d.tiles.reverse();
  d.partitions[0].a = [64, 128];
  d.partitions[0].b = [64, 0];
  const b = planNativeBoundaries(d, "deck", options);
  expect(a.placements).toEqual(b.placements);
  expect(a.doors).toEqual(b.doors);
  expect(before.tiles).toEqual([...d.tiles].reverse());
  expect(new Set(a.placements.map((p) => p.key)).size).toBe(
    a.placements.length,
  );
});

test("deck identity/elevation is explicit; obstacles above or on another deck do not block a swing", () => {
  const d = doorway();
  d.decks[0].elevation = 128;
  d.decks.push({ ...d.decks[0], id: "upper", elevation: 256, order: 1 });
  const o = obstacle(
    "other",
    [
      [75, 20],
      [80, 20],
      [80, 25],
      [75, 25],
    ],
    "upper",
  );
  const p = planNativeBoundaries(d, "deck", { ...options, obstacles: [o] });
  expect(p.placements.every((p) => p.originUnits[2] === 128)).toBe(true);
  expect(() => planNativeBoundaries(d, "missing", options)).toThrow("DECK");
  expect(() =>
    planNativeBoundaries(d, "deck", {
      ...options,
      obstacles: [{ ...o, deckId: "deck", bottomUnits: 80, topUnits: 96 }],
    }),
  ).not.toThrow();
});

test("rejects unsupported boundary shapes, partial spans, deck datums and open dividers", () => {
  const d = emptyLayout("triangle", "deck");
  d.tiles.push(stampTile("t", "deck", "triangle", [0, 0]));
  expect(() => planNativeBoundaries(d, "deck", options)).toThrow("DIAGONAL");
  const short = square(1, 1);
  short.tiles[0].vertices[1][0] = 63;
  short.tiles[0].vertices[2][0] = 63;
  expect(() => planNativeBoundaries(short, "deck", options)).toThrow(
    "PARTIAL_SPAN",
  );
  const high = square();
  high.decks[0].ceiling = 102;
  expect(() => planNativeBoundaries(high, "deck", options)).toThrow(
    "CEILING_DATUM",
  );
  expect(() =>
    planNativeBoundaries(square(), "deck", { floorTopUnits: 0 }),
  ).toThrow("FLOOR_DATUM");
  const divider = doorway();
  divider.partitions[0].seal = "open-divider";
  expect(() => planNativeBoundaries(divider, "deck", options)).toThrow(
    "DIVIDER",
  );
});

test("fittings cannot be silently ignored and malformed obstruction definitions fail closed", () => {
  const d = doorway();
  d.fittings.push({
    id: "equipment",
    deckId: "deck",
    definitionId: "test",
    revision: "r1",
    position: [90, 90],
    quarterTurns: 0,
    reflected: false,
    footprint: [8, 8],
    clearance: 0,
    kind: "equipment",
    container: null,
  });
  expect(() => planNativeBoundaries(d, "deck", options)).toThrow(
    "UNBOUND_OBJECT",
  );
  const o = obstacle("equipment", [
    [90, 90],
    [98, 90],
    [98, 98],
    [90, 98],
  ]);
  expect(() =>
    planNativeBoundaries(d, "deck", { ...options, obstacles: [o] }),
  ).not.toThrow();
  expect(() =>
    planNativeBoundaries(d, "deck", { ...options, obstacles: [o, o] }),
  ).toThrow("OBSTACLE");
});

test("bounded large perimeter plans without more than the declared work/placement budget", () => {
  const d = square(32, 8),
    p = planNativeBoundaries(d, "deck", options);
  expect(p.placements).toHaveLength(160);
  const tooMany = square(1, 1);
  tooMany.tiles = Array.from(
    { length: NATIVE_BOUNDARY_LIMITS.tiles + 1 },
    (_, i) => stampTile(`t${i}`, "deck", "rectangle", [i, 0]),
  );
  expect(() => planNativeBoundaries(tooMany, "deck", options)).toThrow(
    "BUDGET",
  );
});

test("adjacent valid door reservations retain independent IDs and share one frame endpoint node", () => {
  const d = doorway();
  d.openings.push({
    ...d.openings[0],
    id: "door-2",
    a: [64, 76],
    b: [64, 116],
  });
  const p = planNativeBoundaries(d, "deck", options);
  expect(p.doors.map((d) => d.openingId)).toEqual(["door", "door-2"]);
  expect(p.placements.filter((p) => p.partId === "door-frame-2m")).toHaveLength(
    2,
  );
  expect(
    p.placements.filter(
      (p) =>
        p.partId === "join-straight" &&
        p.originUnits[0] === 64 &&
        p.originUnits[1] === 64,
    ),
  ).toHaveLength(1);
});

test("union support catches an internal void even when all four swing-box corners have floor", () => {
  const d = doorway();
  d.tiles = [];
  const xs = [0, 64, 81, 113, 128],
    ys = [0, 16, 48, 64, 128];
  for (let i = 1; i < xs.length; i++)
    for (let j = 1; j < ys.length; j++) {
      const x = xs[i - 1],
        y = ys[j - 1];
      if (x === 81 && y === 16) continue;
      d.tiles.push({
        ...stampTile(`${i}-${j}`, "deck", "rectangle", [0, 0]),
        vertices: [
          [x, y],
          [xs[i], y],
          [xs[i], ys[j]],
          [x, ys[j]],
        ],
      });
    }
  d.decks[0].holes = [{ id: "void", seed: [96, 32] }];
  expect(() => planNativeBoundaries(d, "deck", options)).toThrow(
    "SWING_SUPPORT",
  );
});

test("explicit object geometry cannot self-intersect or penetrate nominal closed walls", () => {
  const star: Point[] = [
    [0, 3],
    [2, -3],
    [-3, 1],
    [3, 1],
    [-2, -3],
  ];
  expect(() =>
    planNativeBoundaries(square(), "deck", {
      ...options,
      obstacles: [obstacle("star", star)],
    }),
  ).toThrow("OBSTACLE");
  const crossing = obstacle("crossing", [
    [20, -1],
    [30, -1],
    [30, 1],
    [20, 1],
  ]);
  expect(() =>
    planNativeBoundaries(square(), "deck", {
      ...options,
      obstacles: [crossing],
    }),
  ).toThrow("OBSTACLE_WALL");
});
