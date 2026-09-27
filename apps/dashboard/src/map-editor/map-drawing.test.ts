import { expect, test } from "vitest";
import {
  appendAnchor,
  drawnBoundary,
  penAnchor,
  drawingPath,
} from "./map-drawing";
import { compileZonePath } from "@sidereal/sim/zone-path";
import { newSystemMap } from "@sidereal/content/system-map";
import { newMapZone } from "@sidereal/content/zones";
import { validateSystemMap } from "@sidereal/sim/system-map";
test("pen handles and fractional coordinates survive recentering and save validation", () => {
  const points = [
    { x: 100.25, y: 100.25 },
    penAnchor({ x: 200.25, y: 100.25 }, { x: 220.25, y: 120.25 }, true),
    { x: 200.25, y: 200.25 },
    { x: 100.25, y: 200.25 },
  ];
  const shape = drawnBoundary(points);
  expect(shape.vertices[1].out).toEqual({ x: 20, y: 20 });
  expect(shape.vertices[1].in).toEqual({ x: -20, y: -20 });
  expect(shape.vertices[0].x + shape.x).toBe(100.25);
  const doc = newSystemMap("system");
  doc.zones = [{ ...newMapZone("zone"), ...shape, shape: "polygon" }];
  expect(() => validateSystemMap(doc)).not.toThrow();
  expect(compileZonePath(shape.vertices).length).toBeGreaterThan(4);
  expect(drawingPath(points, (p) => p)).toContain(" C ");
});
test("repeated first or last point does not add a collapsed edge", () => {
  const points = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
  ];
  expect(appendAnchor(points, { x: 0, y: 0 }, 0.01)).toBe(points);
  expect(appendAnchor(points, { x: 100.001, y: 100 }, 0.01)).toBe(points);
  expect(() => drawnBoundary(points.slice(0, 2))).toThrow();
});
test("pen budget rejects the 65th anchor and invalid finished geometry stays rejectable", () => {
  const points = Array.from({ length: 64 }, (_, i) => ({
    x: 100 * Math.cos((i / 64) * Math.PI * 2),
    y: 100 * Math.sin((i / 64) * Math.PI * 2),
  }));
  expect(() => appendAnchor(points, { x: 500, y: 500 }, 0.01)).toThrow("64");
  const doc = newSystemMap("system");
  doc.zones = [
    {
      ...newMapZone("zone"),
      ...drawnBoundary([
        { x: 0, y: 0 },
        { x: 100, y: 100 },
        { x: 0, y: 100 },
        { x: 100, y: 0 },
      ]),
      shape: "polygon",
    },
  ];
  expect(() => validateSystemMap(doc)).toThrow();
});
