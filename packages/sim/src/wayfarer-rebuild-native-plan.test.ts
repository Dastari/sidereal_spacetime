import { expect, it } from "vitest";
import type { Point } from "@sidereal/content/ship-layout";
import { type LayoutWall } from "./layout-compiler";
import { planWayfarerOpaqueNative } from "./wayfarer-rebuild-native-plan";
import { area2, inside } from "./layout-geometry";

const floor: Point[] = [
  [0, 0],
  [128, 0],
  [128, 192],
  [0, 192],
];
const wall = (
  a: Point,
  b: Point,
  source: LayoutWall["source"] = "perimeter",
  side: "left" | "right" = "left",
): LayoutWall => ({
  key: JSON.stringify([a, b, source]),
  deckId: "deck",
  a,
  b,
  source,
  anchorId: "test",
  treatment: {
    schema: "sidereal.boundary-treatment-resolution.v1",
    intent: source === "partition" ? "bulkhead" : "auto",
    overrideId: null,
    heightUnits: 96,
    floorThicknessUnits: 6,
    qualification: "pending",
    ...(source === "partition" ? { reservationSide: side } : {}),
  },
});
const walls = () => [
  ...floor.map((p, i) => wall(p, floor[(i + 1) % floor.length])),
  wall([64, 0], [64, 64], "partition", "right"),
  wall([64, 96], [64, 192], "partition", "right"),
  wall([0, 128], [64, 128], "partition"),
];
const plan = (w = walls(), f = [floor]) =>
  planWayfarerOpaqueNative({ walls: w, floorPolygons: f, elevationUnits: 0 });

it("composes intersecting one-sided walls without duplicate collision cells and keeps passage clear", () => {
  const result = plan();
  expect(result.issues).toEqual([]);
  expect(result.ok).toBe(true);
  const polygons = result.placements.map((p) => p.polygonUnits);
  for (let x = 4; x < 128; x += 8)
    for (let y = 4; y < 192; y += 8) {
      const occupied = polygons.filter((p) => inside([x, y], p, false)).length;
      const expected =
        x < 8 ||
        x > 120 ||
        y < 8 ||
        y > 184 ||
        (x > 64 && x < 72 && (y < 64 || y > 96)) ||
        (x < 64 && y > 128 && y < 136);
      expect(occupied, `cell ${x},${y}`).toBe(expected ? 1 : 0);
    }
  expect(polygons.reduce((sum, p) => sum + Math.abs(area2(p)) / 2, 0)).toBe(
    result.occupiedCellCount * 64,
  );
  expect(polygons.some((p) => inside([68, 80], p, false))).toBe(false);
  expect(
    result.placements.every((p) => p.minZM === 0.1875 && p.maxZM === 3.1875),
  ).toBe(true);
  expect(result.physicalQualification).toBe("unqualified");
});

it("is deterministic under source ordering and produces exact rigid quarter-turn geometry", () => {
  expect(plan(walls().reverse())).toEqual(plan());
  const rotate = ([x, y]: Point): Point => [-y + 256, x - 64];
  const transformed = walls().map((w) => ({
    ...w,
    a: rotate(w.a),
    b: rotate(w.b),
  }));
  const result = plan(transformed, [floor.map(rotate)]);
  expect(result.ok).toBe(true);
  const base = plan();
  expect(result.occupiedCellCount).toBe(base.occupiedCellCount);
  for (let x = 4; x < 128; x += 8)
    for (let y = 4; y < 192; y += 8) {
      expect(
        result.placements.some((p) =>
          inside(rotate([x, y]), p.polygonUnits, false),
        ),
      ).toBe(
        base.placements.some((p) => inside([x, y], p.polygonUnits, false)),
      );
    }
});

it("fails closed for unsupported diagonals, heights, off-grid walls and centered partitions", () => {
  const variants = [
    { ...walls()[0], b: [32, 32] as Point },
    { ...walls()[0], a: [1, 0] as Point },
    { ...walls()[0], treatment: { ...walls()[0].treatment!, heightUnits: 72 } },
    {
      ...walls()[4],
      treatment: {
        ...walls()[4].treatment!,
        reservationSide: "center" as const,
      },
    },
  ];
  for (const w of variants) {
    const p = plan([w]);
    expect(p.ok).toBe(false);
    expect(p.placements).toEqual([]);
  }
});

it("rejects unsupported walls even when their midpoint would lie inside the floor union", () => {
  const inset: Point[] = [
    [0, 0],
    [128, 0],
    [128, 192],
    [0, 192],
  ];
  const p = plan([wall([0, 0], [0, 192])], [inset]);
  expect(p.ok).toBe(false); // Directed north: left reservation is outside.
  expect(p.issues[0]).toContain("leaves structural support");
  expect(p.placements).toEqual([]);
});

it("supports floor seams exactly and refuses a diagonal floor cutting through an occupied cell", () => {
  expect(
    plan(walls(), [
      [
        [0, 0],
        [64, 0],
        [64, 192],
        [0, 192],
      ],
      [
        [64, 0],
        [128, 0],
        [128, 192],
        [64, 192],
      ],
    ]).ok,
  ).toBe(true);
  expect(
    plan(
      [wall([0, 0], [128, 0])],
      [
        [
          [0, 0],
          [128, 0],
          [0, 128],
        ],
      ],
    ).ok,
  ).toBe(false);
});

it("keeps base native solver immutable while permitting only the exact bounded rebuild filler", async () => {
  const { planInsetNativeBoundary } =
    await import("./layout-inset-native-plan");
  const w = wall([0, 0], [12, 0], "partition");
  w.treatment!.reservationSide = "center";
  const input = {
    walls: [w],
    deckId: "deck",
    elevationUnits: 0,
    floorThicknessUnits: 6,
    floorPolygons: [
      [
        [-16, -16],
        [32, -16],
        [32, 16],
        [-16, 16],
      ] as Point[],
    ],
  };
  const part = {
    family: "wayfarer-rebuild-r001" as const,
    id: "internal-span-0.125" as const,
    polygon: [
      [0, -0.125],
      [0.125, -0.125],
      [0.125, 0.125],
      [0, 0.125],
    ] as Point[],
    length: 0.125 as const,
  };
  const before = planInsetNativeBoundary(input);
  expect(
    before.issues.some((i) => i.message.includes("No exact native residual")),
  ).toBe(true);
  const result = planInsetNativeBoundary({
    ...input,
    additionalShapes: [part],
  });
  expect(result.issues).toEqual([]);
  expect(
    result.placements.some((p) => p.family === "wayfarer-rebuild-r001"),
  ).toBe(true);
  expect(planInsetNativeBoundary(input)).toEqual(before);
  expect(
    planInsetNativeBoundary({
      ...input,
      additionalShapes: [
        {
          ...part,
          polygon: [
            [0, 0],
            [1, 0],
            [1, 1],
            [0, 1],
          ],
        },
      ],
    }).placements,
  ).toEqual([]);
  expect(
    planInsetNativeBoundary({ ...input, additionalShapes: [part, part] })
      .issues[0].key,
  ).toBe("additional-shapes");
});

it("rebuild candidate reuses real junction families and keeps every passage and cockpit approach open", async () => {
  const { default: source } =
    await import("../../content/src/wayfarer-rebuild-r002.json");
  const { planWayfarerRebuildNative } =
    await import("./wayfarer-rebuild-native-plan");
  const layout =
    source.layout as unknown as import("@sidereal/content/ship-layout").LayoutDocument;
  // This explicit test descriptor proves composition; it is not a published GLB.
  const filler = {
    key: "wayfarer-rebuild-r001/internal-span-0.125-q4" as const,
    family: "wayfarer-rebuild-r001" as const,
    profileId: "internal-span-0.125" as const,
    footprintM: [
      [0, -0.125],
      [0.125, -0.125],
      [0.125, 0.125],
      [0, 0.125],
    ],
    heightM: 3 as const,
    sha256: "0".repeat(64),
  };
  const result = planWayfarerRebuildNative(layout, filler);
  expect(result.issues).toEqual([]);
  expect(result.ok).toBe(true);
  expect(result.placements.length).toBeLessThan(160);
  expect(result.obstacles.length).toBe(result.placements.length);
  expect(result.placements.some((p) => p.profileId === "exterior-t")).toBe(
    true,
  );
  expect(result.placements.some((p) => p.profileId.startsWith("corner-"))).toBe(
    true,
  );
  expect(result.cockpitSubstitutions.flatMap((s) => s.partIds)).toHaveLength(
    10,
  );
  for (const o of layout.openings) {
    const x = (o.a[0] + o.b[0]) / 64,
      y = (o.a[1] + o.b[1]) / 64;
    for (const dx of [-0.2, 0, 0.2])
      expect(
        result.obstacles.some((p) => inside([x + dx, y], p.vertices, false)),
        o.id,
      ).toBe(false);
  }
  expect(result.obstacles.some((p) => inside([0, 9], p.vertices, false))).toBe(
    false,
  );
  expect(result.integrationReady).toBe(false);
  expect(planWayfarerRebuildNative(layout).ok).toBe(false);
  expect(
    planWayfarerRebuildNative(layout, { ...filler, heightM: 2 as 3 }).ok,
  ).toBe(false);
});
