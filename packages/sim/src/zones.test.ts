import { expect, test } from "vitest";
import { newSystemMap, newAsteroidField } from "@sidereal/content/system-map";
import { newMapZone, type ZoneAnchor } from "@sidereal/content/zones";
import { compileZones, zoneMembership, sweepZones } from "./zones";
import {
  compileZonePath,
  curveZoneEdge,
  cubicAt,
  splitZoneEdge,
  setZoneHandle,
} from "./zone-path";
import { generateField } from "./system-map";
import { spaceRegion, resolveSpaceBackground } from "./space-background";
const square = (): ZoneAnchor[] => [
  { x: -100, y: -100 },
  { x: 100, y: -100 },
  { x: 100, y: 100 },
  { x: -100, y: 100 },
];
const fixture = () => {
  const d = newSystemMap("system");
  d.radius = 10000;
  d.zones = [
    { ...newMapZone("parent"), width: 1000, length: 1000 },
    {
      ...newMapZone("child", 450, 0),
      parentId: "parent",
      width: 200,
      length: 200,
    },
  ];
  return d;
};
test("root, generic zones and legacy fields normalize without leaking population", () => {
  const d = fixture();
  d.fields = [newAsteroidField("rocks")];
  const zones = compileZones(d);
  expect(zones.map((z) => z.id)).toEqual([
    "system",
    "parent",
    "rocks",
    "child",
  ]);
  expect(JSON.stringify(zones)).not.toMatch(/density|resources|seed/);
  expect(zoneMembership(zones, { x: 480, y: 0, height: 0 })).toEqual([
    "system",
    "parent",
    "rocks",
    "child",
  ]);
  expect(zoneMembership(zones, { x: 520, y: 0, height: 0 })).toEqual([
    "system",
  ]);
});
test("parents clip children and presentation strips resource data", () => {
  const d = fixture();
  const region = spaceRegion(d);
  expect(region.zones).toHaveLength(3);
  expect(zoneMembership(region.zones!, { x: 520, y: 0, height: 0 })).toEqual([
    "system",
  ]);
  expect(
    resolveSpaceBackground(region, { x: 520, y: 0, height: 0 }).reduce(
      (sum, x) => sum + x.weight,
      0,
    ),
  ).toBeCloseTo(1);
});
test("reject cycles, orphan parents, duplicate IDs and invalid color", () => {
  for (const mutate of [
    (d: ReturnType<typeof fixture>) => {
      d.zones![0].parentId = "child";
    },
    (d: ReturnType<typeof fixture>) => {
      d.zones![1].parentId = "missing";
    },
    (d: ReturnType<typeof fixture>) => {
      d.zones![1].id = "system";
    },
    (d: ReturnType<typeof fixture>) => {
      d.zones![1].color = "red";
    },
  ]) {
    const d = fixture();
    mutate(d);
    expect(() => compileZones(d)).toThrow();
  }
});
test("straight-to-cubic conversion and de Casteljau splitting preserve shape", () => {
  const points = square();
  curveZoneEdge(points, 0);
  expect(cubicAt(points[0], points[1], 0.25).x).toBeCloseTo(-50, 10);
  points[0].out = { x: 80, y: -130 };
  points[1].in = { x: -30, y: -60 };
  const a = structuredClone(points[0]),
    b = structuredClone(points[1]);
  splitZoneEdge(points, 0, 0.3);
  for (let i = 0; i <= 100; i++) {
    const t = i / 100,
      p =
        t <= 0.3
          ? cubicAt(points[0], points[1], t / 0.3)
          : cubicAt(points[1], points[2], (t - 0.3) / 0.7),
      q = cubicAt(a, b, t);
    expect(p.x).toBeCloseTo(q.x, 8);
    expect(p.y).toBeCloseTo(q.y, 8);
  }
  expect(compileZonePath(points).length).toBeGreaterThan(5);
});
test("handle coupling preserves opposite length or mirrors, Alt breaks link", () => {
  const a: ZoneAnchor = { x: 0, y: 0, in: { x: -20, y: 0 }, mode: "aligned" };
  setZoneHandle(a, "out", { x: 0, y: 40 });
  expect(a.in).toEqual({ x: -0, y: -20 });
  a.mode = "mirrored";
  setZoneHandle(a, "out", { x: 10, y: 12 });
  expect(a.in).toEqual({ x: -10, y: -12 });
  setZoneHandle(a, "out", { x: 1, y: 2 }, true);
  expect(a.in).toEqual({ x: -10, y: -12 });
  expect(a.mode).toBe("corner");
});
test("curves reject nonfinite handles and self intersections", () => {
  const d = fixture();
  d.zones![0].shape = "polygon";
  d.zones![0].vertices = [
    { x: 0, y: 0 },
    { x: 100, y: 100 },
    { x: 0, y: 100 },
    { x: 100, y: 0 },
  ];
  expect(() => compileZones(d)).toThrow(/intersect/);
  d.zones![0].vertices = square();
  d.zones![0].vertices[0].out = { x: Infinity, y: 0 };
  expect(() => compileZones(d)).toThrow(/handle/);
});
test("outside-to-outside sweep reports thin zone entry and exit in order", () => {
  const d = fixture();
  d.zones = [{ ...newMapZone("thin"), width: 1, length: 100 }];
  const result = sweepZones(
    compileZones(d),
    { x: -100, y: 0, height: 0 },
    { x: 100, y: 0, height: 0 },
  );
  expect(result.changes.map((c) => [c.zoneId, c.entered])).toEqual([
    ["thin", true],
    ["thin", false],
  ]);
  expect(result.changes[0].fraction).toBeCloseTo(0.4975);
  expect(result.active).toEqual(["system"]);
});
test("nested simultaneous crossings enter parent-first and exit child-first", () => {
  const d = fixture();
  d.zones![1] = { ...d.zones![0], id: "child", parentId: "parent" };
  const r = sweepZones(
    compileZones(d),
    { x: -1000, y: 0, height: 0 },
    { x: 1000, y: 0, height: 0 },
  );
  expect(r.changes.map((c) => [c.zoneId, c.entered])).toEqual([
    ["parent", true],
    ["child", true],
    ["child", false],
    ["parent", false],
  ]);
});
test("ellipsoid tangencies do not invent transit events", () => {
  const d = fixture();
  d.zones = [
    { ...newMapZone("round"), shape: "ellipsoid", width: 100, length: 100 },
  ];
  const r = sweepZones(
    compileZones(d),
    { x: -100, y: 50, height: 0 },
    { x: 100, y: 50, height: 0 },
  );
  expect(r.changes).toEqual([]);
});
test("curved asteroid paths use deterministic compiled population", () => {
  const f = newAsteroidField("curve");
  f.shape = "polygon";
  f.vertices = square();
  f.density = 1000;
  curveZoneEdge(f.vertices, 0);
  f.vertices[0].out!.y = -100;
  const a = generateField(f);
  expect(a.length).toBeGreaterThan(0);
  expect(a).toEqual(generateField(f));
});

test("primary-star metadata cannot overwrite root identity or its parent", () => {
  const d = newSystemMap("system", [
    {
      id: "star",
      name: "Star",
      kind: "star",
      radius: 5,
      x: 10,
      y: 20,
      height: 0,
      parentId: null,
    },
  ]);
  const zones = compileZones(d);
  expect(zones[0].id).toBe("system");
  expect(zones[0].parentId).toBeUndefined();
  expect(zones[0].x).toBe(10);
});
test("empty parent cannot create an unbounded orphan", () => {
  const d = fixture();
  d.zones![0].parentId = "";
  expect(() => compileZones(d)).toThrow(/parent/);
});
test("distinct very thin crossings are not merged by an arbitrary fraction tolerance", () => {
  const d = fixture();
  d.zones = [
    {
      ...newMapZone("sliver"),
      shape: "polygon",
      vertices: [
        { x: 0, y: -1e6 },
        { x: 1e-6, y: -1e6 },
        { x: 1e-6, y: 1e6 },
        { x: 0, y: 1e6 },
      ],
    },
  ];
  const r = sweepZones(
    compileZones(d),
    { x: -8000, y: 0, height: 0 },
    { x: 8000, y: 0, height: 0 },
  );
  expect(r.changes.map((x) => x.entered)).toEqual([true, false]);
});
