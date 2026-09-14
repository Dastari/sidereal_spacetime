import { expect, it } from "vitest";
import corner from "@sidereal/content/ship-tileset-corner-spec.v1.json";
import internal from "@sidereal/content/ship-tileset-internal-spec.v1.json";
import union from "@sidereal/content/ship-tileset-union-junction-spec.v1.json";
import { compileLayout, type LayoutWall } from "./layout-compiler";
import {
  emptyLayout,
  stampTile,
  withRequiredShapeDependency,
} from "@sidereal/content/ship-layout";
import type { Point } from "@sidereal/content/ship-layout";
import { planInsetNativeBoundary } from "./layout-inset-native-plan";
const wall = (
  a: Point,
  b: Point,
  source: LayoutWall["source"] = "perimeter",
): LayoutWall => ({
  key: JSON.stringify([a, b]),
  deckId: "d",
  a,
  b,
  source,
  anchorId: "a",
  treatment: {
    schema: "sidereal.boundary-treatment-resolution.v1",
    intent: "auto",
    overrideId: null,
    heightUnits: 96,
    floorThicknessUnits: 6,
    qualification: "pending",
    ...(source === "partition" ? { reservationSide: "center" as const } : {}),
  },
});
const run = (walls: LayoutWall[], floor: Point[]) =>
  planInsetNativeBoundary({
    walls,
    deckId: "d",
    elevationUnits: 0,
    floorThicknessUnits: 6,
    floorPolygons: [floor],
  });
const boundary = (floor: Point[]) =>
  floor.map((a, i) => wall(a, floor[(i + 1) % floor.length]));
const shapes = [...corner.profiles, ...internal.shapes, ...union.shapes];
const rotate = ([x, y]: Point, q: number): Point =>
  (
    [
      [x, y],
      [-y, x],
      [-x, -y],
      [y, -x],
    ] as Point[]
  )[q];
function polygon(id: string, origin: number[], q: number): Point[] {
  return shapes
    .find((s) => s.id === id)!
    .reservationPolygonM.map((v) => {
      const p = rotate(v as Point, q);
      return [p[0] + origin[0], p[1] + origin[1]];
    });
}
function covers(p: Point, poly: Point[]) {
  let yes = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i],
      b = poly[j];
    if (
      a[1] > p[1] !== b[1] > p[1] &&
      p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]
    )
      yes = !yes;
  }
  return yes;
}
function expectSameCoverage(actual: Point[][], expected: Point[][]) {
  const all = [...actual, ...expected];
  const xs = [...new Set(all.flatMap((p) => p.map((v) => v[0])))].sort(
      (a, b) => a - b,
    ),
    ys = [...new Set(all.flatMap((p) => p.map((v) => v[1])))].sort(
      (a, b) => a - b,
    );
  for (let x = 1; x < xs.length; x++)
    for (let y = 1; y < ys.length; y++) {
      const p: Point = [(xs[x - 1] + xs[x]) / 2, (ys[y - 1] + ys[y]) / 2];
      expect(
        actual.some((poly) => covers(p, poly)),
        "coverage at " + p,
      ).toBe(expected.some((poly) => covers(p, poly)));
    }
}
for (const fixture of union.fixtures)
  for (let q = 0; q < 4; q++)
    it(fixture.id + " rotation " + q, () => {
      const transform = ([x, y]: number[]): Point => {
        const p: Point = [x * 32, y * 32];
        return (
          [
            [p[0], p[1]],
            [-p[1], p[0]],
            [-p[0], -p[1]],
            [p[1], -p[0]],
          ] as Point[]
        )[q];
      };
      const floor = fixture.footprintM.map(transform),
        walls = boundary(floor);
      for (const polygon of fixture.internalReservationsM) {
        const ys = polygon.map((p) => p[1]);
        walls.push(
          wall(
            transform([1, Math.min(...ys)]),
            transform([1, Math.max(...ys)]),
            "partition",
          ),
        );
      }
      const result = run(walls, floor);
      expect(result.issues).toEqual([]);
      const actual = result.placements.map((p) =>
        polygon(
          p.profileId,
          p.originUnits.map((v) => v / 32),
          p.quarterTurns,
        ),
      );
      const expected = fixture.pieces.map((p) =>
        polygon(p.profileId, p.originM, p.quarterTurns).map((v) =>
          rotate(v, q),
        ),
      );
      expectSameCoverage(actual, expected);
      expect(result.physicalQualification).toBe("unqualified");
    });
it("internal centered T and cross own their junction once", () => {
  const floor: Point[] = [
    [0, 0],
    [128, 0],
    [128, 128],
    [0, 128],
  ];
  for (const rays of [
    [
      [32, 64],
      [96, 64],
      [64, 96],
    ],
    [
      [32, 64],
      [96, 64],
      [64, 96],
      [64, 32],
    ],
  ]) {
    const walls = [
      ...boundary(floor),
      ...rays.map((p) => wall([64, 64], p as Point, "partition")),
    ];
    const result = run(walls, floor);
    expect(result.issues).toEqual([]);
    expect(
      result.placements.filter((p) => p.profileId === "internal-core"),
    ).toHaveLength(1);
  }
});
it("fails closed for unsupported branch, height, side, residual and treatment", () => {
  const floor: Point[] = [
    [0, 0],
    [64, 0],
    [64, 64],
    [0, 64],
  ];
  const variants = [
    wall([32, 0], [32, -32], "partition"),
    wall([32, 32], [44, 32], "partition"),
    wall([32, 32], [64, 32], "partition"),
    wall([32, 32], [64, 32], "partition"),
    wall([32, 32], [64, 32], "partition"),
  ];
  variants[2].treatment!.heightUnits = 48;
  variants[3].treatment!.reservationSide = "left";
  variants[4].treatment!.intent = "window";
  for (const extra of variants) {
    const result = run([...boundary(floor), extra], floor);
    expect(result.issues.length).toBeGreaterThan(0);
    expect(result.placements).toEqual([]);
  }
});

it("preserves native ownership under mirrored floor winding and reordered inputs", () => {
  const f = union.fixtures[0];
  const floor = f.footprintM
    .map(([x, y]): Point => [-x * 32, y * 32])
    .reverse();
  const walls = boundary(floor);
  const a = run(walls, floor),
    b = run(walls.slice().reverse(), floor);
  expect(a.issues).toEqual([]);
  expect(b).toEqual(a);
});
it("rejects native reservations outside backing and overlapping parallel partitions", () => {
  const floor: Point[] = [
    [0, 0],
    [64, 0],
    [64, 64],
    [0, 64],
  ];
  const outside = run([wall([0, 16], [0, 48], "partition")], floor);
  expect(outside.issues.some((i) => i.key === "support")).toBe(true);
  const overlap = run(
    [
      wall([16, 24], [48, 24], "partition"),
      wall([16, 28], [48, 28], "partition"),
    ],
    floor,
  );
  expect(overlap.issues.some((i) => i.key === "overlap")).toBe(true);
  expect(overlap.placements).toEqual([]);
});

it("joins actual compiler floor-module seams while retaining distinct override provenance", () => {
  const doc = emptyLayout("seam-review", "main");
  doc.decks[0].ceiling = 102;
  doc.tiles = [
    [0, 0],
    [32, 0],
    [0, 32],
  ].map((origin, i) => {
    const t = stampTile("floor-" + i, "main", "rectangle", [0, 0]);
    t.vertices = (
      [
        [0, 0],
        [32, 0],
        [32, 32],
        [0, 32],
      ] as Point[]
    ).map(([x, y]): Point => [x + origin[0], y + origin[1]]);
    return t;
  });
  doc.structure = {
    schema: "sidereal.layout-structure.v2",
    wallConvention: "inset250-v1",
    grid: 16,
    hull: {
      id: "test",
      name: "test",
      revision: "1",
      width: 64,
      length: 64,
      height: 112,
      origin: [0, 0, 0],
    },
    tileStyles: {},
    wallFaces: {},
    armor: [],
    navigationReservations: [],
    deckProfiles: [
      {
        deckId: "main",
        floorThickness: 6,
        clearHeight: 96,
        roofThickness: 4,
        serviceVoid: 6,
        pitch: 112,
      },
    ],
    boundaryTreatments: [],
  };
  const base = compileLayout(doc);
  expect(base.valid).toBe(true);
  doc.structure.boundaryTreatments = base.walls.map((w, i) => ({
    id: "separate-" + i,
    deckId: w.deckId,
    source: w.source,
    sourceAnchorId: w.anchorId,
    a: w.a,
    b: w.b,
    treatment: "auto",
    heightUnits: 24,
  }));
  const compiled = compileLayout(doc);
  expect(compiled.valid).toBe(true);
  const invoke = () => {
    const c = compileLayout(doc);
    return planInsetNativeBoundary({
      walls: c.walls,
      deckId: "main",
      elevationUnits: 0,
      floorThicknessUnits: 6,
      floorPolygons: c.tiles.map((t) => t.vertices),
    });
  };
  const result = invoke();
  expect(result.issues).toEqual([]);
  const expected = union.fixtures[0].pieces.map((p) =>
    polygon(p.profileId, p.originM, p.quarterTurns),
  );
  expectSameCoverage(
    result.placements.map((p) =>
      polygon(
        p.profileId,
        p.originUnits.map((v) => v / 32),
        p.quarterTurns,
      ),
    ),
    expected,
  );
  const south = doc.structure.boundaryTreatments.filter(
    (t) => t.a[1] === 0 && t.b[1] === 0,
  );
  expect(south).toHaveLength(2);
  for (const treatment of south)
    expect(result.placements.some((p) => p.key.includes(treatment.id))).toBe(
      true,
    );
  south[0].heightUnits = 48;
  const mismatch = invoke();
  expect(mismatch.issues.length).toBeGreaterThan(0);
  expect(mismatch.placements).toEqual([]);
});

const diagonalRun = (walls: LayoutWall[], floorPolygons: Point[][]) =>
  planInsetNativeBoundary({
    walls,
    deckId: "d",
    elevationUnits: 0,
    floorThicknessUnits: 6,
    floorPolygons,
    allowDiagonalVisuals: true,
  });

it("keeps diagonal native composition opt-in and unqualified", () => {
  const floor = corner.fixtures.find((f) => f.id === "triangle-45")!
    .footprintUnits as Point[];
  expect(run(boundary(floor), floor).placements).toEqual([]);
  expect(run(boundary(floor), floor).issues.length).toBeGreaterThan(0);
  const visual = diagonalRun(boundary(floor), [floor]);
  expect(visual.issues).toEqual([]);
  expect(visual.physicalQualification).toBe("unqualified");
  expect(
    visual.placements.some(
      (p) =>
        p.yawRadians !== undefined &&
        Math.abs(
          p.yawRadians / (Math.PI / 2) -
            Math.round(p.yawRadians / (Math.PI / 2)),
        ) > 0.01,
    ),
  ).toBe(true);
});

for (const fixture of corner.fixtures)
  for (let q = 0; q < 4; q++)
    for (const reflected of [false, true])
      it(`composes exact delivered ${fixture.id}, turn ${q}, reflection ${reflected}`, () => {
        let floor = fixture.footprintUnits.map((p) => {
          const v = rotate([reflected ? -p[0] : p[0], p[1]], q);
          return [v[0] + 128, v[1] - 64] as Point;
        });
        if (reflected) floor = floor.reverse();
        for (const height of [24, 48, 72, 96]) {
          const walls = boundary(floor).map((w) => ({
            ...w,
            treatment: { ...w.treatment!, heightUnits: height },
          }));
          const result = diagonalRun(walls, [floor]);
          expect(result.issues).toEqual([]);
          expect(result.placements.length).toBeGreaterThan(0);
          expect(
            result.placements.every((p) => p.quarterHeight === height / 24),
          ).toBe(true);
          expect(
            result.placements.every((p) =>
              shapes.some((s) => s.id === p.profileId),
            ),
          ).toBe(true);
        }
      });

it("merges split diagonal perimeter edges without dropping override provenance", () => {
  const floor: Point[] = [
    [0, 0],
    [64, 0],
    [0, 64],
  ];
  const split = [
    wall([0, 0], [64, 0]),
    wall([64, 0], [32, 32]),
    wall([32, 32], [0, 64]),
    wall([0, 64], [0, 0]),
  ];
  split[1].treatment!.overrideId = "first-diagonal";
  split[2].treatment!.overrideId = "second-diagonal";
  const result = diagonalRun(split, [floor]);
  expect(result.issues).toEqual([]);
  for (const id of ["first-diagonal", "second-diagonal"])
    expect(result.placements.some((p) => p.key.includes(id))).toBe(true);
});

it("preserves unsupported diagonal profiles, residuals, openings and internal junctions", () => {
  const unsupported: Point[] = [
    [0, 0],
    [96, 0],
    [17, 64],
  ];
  expect(diagonalRun(boundary(unsupported), [unsupported]).placements).toEqual(
    [],
  );
  const floor = corner.fixtures.find((f) => f.id === "triangle-45")!
    .footprintUnits as Point[];
  const open = diagonalRun(boundary(floor).slice(1), [floor]);
  expect(open.placements).toEqual([]);
  expect(open.issues.length).toBeGreaterThan(0);
  const mixed = diagonalRun(
    [...boundary(floor), wall([0, 32], [24, 32], "partition")],
    [floor],
  );
  expect(mixed.placements).toEqual([]);
  expect(
    mixed.issues.some((i) => i.message.includes("internal junctions")),
  ).toBe(true);
});

it("checks complete diagonal reservations against the actual floor union", () => {
  const triangle: Point[] = [
    [0, 0],
    [64, 0],
    [0, 64],
  ];
  // Endpoints remain in nominal bounds, but a thin unsupported strip crosses
  // the middle of a real diagonal native span. Vertex-only checks miss this.
  const floors: Point[][] = [
    [
      [0, 0],
      [64, 0],
      [40, 24],
      [0, 24],
    ],
    [
      [0, 25],
      [39, 25],
      [0, 64],
    ],
  ];
  const rejected = diagonalRun(boundary(triangle), floors);
  expect(rejected.placements).toEqual([]);
  expect(
    rejected.issues.some((i) => i.message.includes("structural floor union")),
  ).toBe(true);
});

it("composes the connected four-clipped-tile octagon from compiler perimeter only", () => {
  const doc = emptyLayout("octagon-review", "main");
  doc.decks[0].ceiling = 102;
  const footprint = corner.fixtures.find((f) => f.id === "corner-clipped")!
    .footprintUnits as Point[];
  doc.tiles = [0, 1, 2, 3].map((q) => ({
    ...stampTile("clipped-" + q, "main", "polygon", [0, 0]),
    vertices: footprint.map((p) => rotate(p, q)),
  }));
  doc.structure = {
    schema: "sidereal.layout-structure.v2",
    wallConvention: "inset250-v1",
    grid: 16,
    hull: {
      id: "test",
      name: "test",
      revision: "1",
      width: 128,
      length: 128,
      height: 112,
      origin: [-64, -64, 0],
    },
    tileStyles: {},
    wallFaces: {},
    armor: [],
    navigationReservations: [],
    deckProfiles: [
      {
        deckId: "main",
        floorThickness: 6,
        clearHeight: 96,
        roofThickness: 4,
        serviceVoid: 6,
        pitch: 112,
      },
    ],
    boundaryTreatments: [],
  };
  const compiled = compileLayout(withRequiredShapeDependency(doc));
  expect(compiled.valid, JSON.stringify(compiled.diagnostics)).toBe(true);
  expect(compiled.components).toBe(1);
  expect(compiled.walls.every((w) => w.source === "perimeter")).toBe(true);
  const options = {
    walls: compiled.walls,
    deckId: "main",
    elevationUnits: 0,
    floorThicknessUnits: 6,
    floorPolygons: compiled.tiles.map((t) => t.vertices),
  };
  expect(planInsetNativeBoundary(options).placements).toEqual([]);
  const plan = planInsetNativeBoundary({
    ...options,
    allowDiagonalVisuals: true,
  });
  expect(plan.issues).toEqual([]);
  expect(plan.placements.filter((p) => p.key.startsWith("node:"))).toHaveLength(
    8,
  );
  expect(plan.placements.filter((p) => p.key.startsWith("span:"))).toHaveLength(
    16,
  );
  expect(plan.placements).toHaveLength(24);
  expect(
    planInsetNativeBoundary({
      ...options,
      walls: [...options.walls].reverse(),
      allowDiagonalVisuals: true,
    }),
  ).toEqual(plan);
});
