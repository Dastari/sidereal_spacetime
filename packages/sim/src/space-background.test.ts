import { expect, test } from "vitest";
import {
  newSystemMap,
  newAsteroidField,
  moveMapBody,
} from "@sidereal/content/system-map";
import { DEFAULT_SPACE_VISTA, spaceVista } from "@sidereal/content/environment";
import {
  resolveSpaceBackground,
  spaceRegion,
  systemCenter,
} from "./space-background";
import { validateSystemMap } from "./system-map";

test("deep space is the default without authored nebula or bodies", () => {
  expect(DEFAULT_SPACE_VISTA).toBe("deep-space");
  expect(spaceVista("missing").id).toBe("deep-space");
  expect(spaceVista("deep-space")).toMatchObject({
    nebulaStrength: 0,
    dust: 0,
    bodies: [],
  });
  expect(resolveSpaceBackground(undefined, { x: 0, y: 0, height: 0 })).toEqual([
    { id: "deep-space", weight: 1 },
  ]);
});
test("off-origin primary centers new systems; legacy explicit centers are retained", () => {
  const d = newSystemMap("s", [
    {
      id: "star",
      name: "Star",
      kind: "star",
      x: 15000000,
      y: -80,
      height: 0,
      radius: 10,
    },
  ]);
  expect(systemCenter(d).x).toBe(15000000);
  expect(d.radius).toBe(10000);
  delete d.primaryStarId;
  d.center.x = 14999900;
  expect(systemCenter(d).x).toBe(14999900);
});
test("nested region blends are normalized, continuous, deterministic and default outside", () => {
  const d = newSystemMap("s");
  d.radius = 1000;
  d.feather = 100;
  d.backgroundId = "helion-reach";
  const f = newAsteroidField("f");
  Object.assign(f, {
    width: 200,
    length: 200,
    depth: 200,
    backgroundId: "orion-veil",
    feather: 20,
    density: 0,
  });
  d.fields = [f];
  const region = spaceRegion(d),
    at = (x: number) => resolveSpaceBackground(region, { x, y: 0, height: 0 });
  expect(at(1100)).toEqual([{ id: "deep-space", weight: 1 }]);
  expect(at(950)).toEqual([
    { id: "deep-space", weight: 0.5 },
    { id: "helion-reach", weight: 0.5 },
  ]);
  expect(at(0)).toEqual([{ id: "orion-veil", weight: 1 }]);
  expect(at(90).find((w) => w.id === "orion-veil")!.weight).toBeCloseTo(0.5);
  for (let x = -1100; x <= 1100; x += 7) {
    const values = at(x);
    expect(values.reduce((s, v) => s + v.weight, 0)).toBeCloseTo(1);
    expect(
      values.every((v) => Number.isFinite(v.weight) && v.weight >= 0),
    ).toBe(true);
  }
  const other = { ...region.fields[0], id: "z", backgroundId: "ash-belt" };
  region.fields.push(other);
  const first = at(0);
  region.fields.reverse();
  expect(at(0)).toEqual(first);
  expect(JSON.stringify(region)).not.toContain("resources");
});
test("concave polygon notches inherit system and feather actual edges", () => {
  const d = newSystemMap("s");
  d.backgroundId = "helion-reach";
  const f = newAsteroidField("f");
  Object.assign(f, {
    shape: "polygon",
    vertices: [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 30 },
      { x: 30, y: 30 },
      { x: 30, y: 100 },
      { x: 0, y: 100 },
    ],
    depth: 100,
    backgroundId: "orion-veil",
    feather: 10,
    density: 0,
  });
  d.fields = [f];
  const at = (x: number, y: number) =>
    resolveSpaceBackground(spaceRegion(d), { x, y, height: 0 });
  expect(at(60, 60)).toEqual([{ id: "helion-reach", weight: 1 }]);
  expect(at(5, 20).find((v) => v.id === "orion-veil")!.weight).toBeCloseTo(0.5);
  expect(at(15, 20)).toEqual([{ id: "orion-veil", weight: 1 }]);
});
test("moving parents retains moon offsets and validation rejects cyclic hierarchy and unknown backgrounds", () => {
  const d = newSystemMap("s", [
    { id: "star", name: "S", kind: "star", x: 0, y: 0, height: 0, radius: 10 },
    {
      id: "p",
      name: "P",
      kind: "planet",
      parentId: "star",
      x: 100,
      y: 0,
      height: 0,
      radius: 2,
    },
    {
      id: "m",
      name: "M",
      kind: "planet",
      parentId: "p",
      x: 110,
      y: 0,
      height: 0,
      radius: 1,
    },
  ]);
  moveMapBody(d, "p", { x: 200, y: 50, height: 1 });
  expect(d.bodies[2]).toMatchObject({ x: 210, y: 50, height: 1 });
  expect(validateSystemMap(d)).toBe(0);
  d.bodies[1].parentId = "m";
  expect(() => validateSystemMap(d)).toThrow(/cycle/);
  d.bodies[1].parentId = "star";
  d.fields = [{ ...newAsteroidField("f"), backgroundId: "invalid" }];
  expect(() => validateSystemMap(d)).toThrow(/background/);
});
