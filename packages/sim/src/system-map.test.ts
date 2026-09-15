import { expect, test } from "vitest";
import { newAsteroidField, newSystemMap } from "@sidereal/content/system-map";
import {
  containsFieldPoint,
  fieldCount,
  fieldVolume,
  generateField,
  readSystemMap,
  validateSystemMap,
} from "./system-map";
const fixture = () => {
  const d = newSystemMap("test");
  d.fields = [newAsteroidField("field", 2000, 0)];
  return d;
};
test("ellipsoid density uses cubic kilometres and seeded occurrences are deterministic", () => {
  const d = fixture(),
    f = d.fields[0];
  f.resources = [
    { resource: "iron", chance: 100 },
    { resource: "ice", chance: 0 },
  ];
  expect(validateSystemMap(d)).toBe(26);
  const a = generateField(f);
  expect(a).toEqual(generateField(f));
  expect(a).toHaveLength(26);
  expect(
    a.every(
      (p) =>
        containsFieldPoint(f, p) &&
        p.radius >= 2 &&
        p.radius <= 8 &&
        p.resources.join() === "iron",
    ),
  ).toBe(true);
  expect(generateField({ ...f, seed: 2 })).not.toEqual(a);
});
test("box and concave polygon prism volume and sampling", () => {
  const d = fixture(),
    f = d.fields[0];
  f.shape = "box";
  expect(fieldVolume(f)).toBe(500000000);
  expect(fieldCount(f)).toBe(50);
  f.shape = "polygon";
  f.vertices = [
    { x: 0, y: 0 },
    { x: 1000, y: 0 },
    { x: 1000, y: 200 },
    { x: 200, y: 200 },
    { x: 200, y: 1000 },
    { x: 0, y: 1000 },
  ];
  expect(validateSystemMap(d)).toBe(18);
  const a = generateField(f);
  expect(a.every((p) => containsFieldPoint(f, p))).toBe(true);
  expect(containsFieldPoint(f, { x: f.x + 500, y: 500, height: 0 })).toBe(
    false,
  );
  expect(containsFieldPoint(f, { x: f.x + 100, y: 100, height: 251 })).toBe(
    false,
  );
});
test("invalid/self-intersecting and repeated polygon vertices rejected", () => {
  const d = fixture(),
    f = d.fields[0];
  f.shape = "polygon";
  f.vertices = [
    { x: 0, y: 0 },
    { x: 100, y: 100 },
    { x: 0, y: 100 },
    { x: 100, y: 0 },
  ];
  expect(() => validateSystemMap(d)).toThrow("intersect");
  f.vertices = [
    { x: 0, y: 0 },
    { x: 0, y: 0 },
    { x: 100, y: 0 },
  ];
  expect(() => validateSystemMap(d)).toThrow("repeated");
});
test("probability and work budgets fail explicitly; zero density is empty", () => {
  const d = fixture(),
    f = d.fields[0];
  f.density = 0;
  expect(generateField(f)).toEqual([]);
  f.density = 1e9;
  expect(() => validateSystemMap(d)).toThrow("exceeds");
  f.density = 100;
  f.resources[0].chance = 101;
  expect(() => validateSystemMap(d)).toThrow("chance");
  f.resources[0].chance = 20;
  f.resources.push({ ...f.resources[0] });
  expect(() => validateSystemMap(d)).toThrow("duplicate");
});
test("sphere contains full bodies, volume bounds and asteroid surfaces", () => {
  const d = fixture();
  d.bodies = [
    {
      id: "body",
      kind: "planet",
      name: "Planet",
      x: 9999,
      y: 0,
      height: 0,
      radius: 2,
    },
  ];
  expect(() => validateSystemMap(d)).toThrow("outside");
  d.bodies = [];
  d.fields[0].x = 9999;
  expect(() => validateSystemMap(d)).toThrow("outside");
});
test("rejects invalid numeric/unknown inputs and oversized JSON", () => {
  const d = fixture();
  d.center.x = NaN;
  expect(() => validateSystemMap(d)).toThrow();
  expect(() => readSystemMap("x".repeat(128001))).toThrow("large");
  expect(() => readSystemMap("{")).toThrow("JSON");
  d.center.x = 0;
  d.backgroundId = "missing";
  expect(() => validateSystemMap(d)).toThrow("background");
});

test("polygon admission uses real vertices rather than empty bounding-box corners", () => {
  const d = newSystemMap("triangle"),
    f = newAsteroidField("triangle-field");
  f.shape = "polygon";
  f.vertices = [
    { x: 0, y: 0 },
    { x: 9000, y: 0 },
    { x: 0, y: 9000 },
  ];
  f.density = 0;
  d.fields = [f];
  expect(() => validateSystemMap(d)).not.toThrow();
});
