import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { DOORWAY250_VISUALS } from "@sidereal/content/construction-doorway-visuals";
import { createDoorway250ReviewLayout } from "@sidereal/content/doorway250-review-layout";
import { constructionHash } from "./construction-transactions";
import { compileLayout } from "./layout-compiler";
import { transformPoint, type Point } from "@sidereal/content/ship-layout";
import {
  doorway250LeafObstacle,
  doorway250SweepOccupied,
} from "./construction-doorway-motion";
const leaf = DOORWAY250_VISUALS.parts.find((part) => part.part === "leaf")!;
const frame = {
  id: "test-door",
  origin: [0, 0] as Point,
  quarterTurns: 0,
  leafSha256: leaf.sha256,
};
function sourcePoints() {
  const points: Point[] = [];
  for (const part of DOORWAY250_VISUALS.parts.filter(
    (part) => part.part === "leaf" || part.part === "gasket",
  )) {
    const bytes = readFileSync(
      "assets/runtime" + part.url.replace(/^\/assets/, ""),
    );
    expect(constructionHash(bytes)).toBe(part.sha256);
    const jsonSize = bytes.readUInt32LE(12),
      json = JSON.parse(bytes.subarray(20, 20 + jsonSize).toString()),
      binary = bytes.subarray(28 + jsonSize);
    const read = (index: number): number[][] => {
      const accessor = json.accessors[index],
        view = json.bufferViews[accessor.bufferView];
      expect(accessor.componentType).toBe(5126);
      expect(accessor.type).toBe("VEC3");
      const offset = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0),
        stride = view.byteStride ?? 12;
      return Array.from({ length: accessor.count }, (_, i) =>
        [0, 4, 8].map((n) => binary.readFloatLE(offset + i * stride + n)),
      );
    };
    for (const mesh of json.meshes)
      for (const primitive of mesh.primitives) {
        const vertices = read(primitive.attributes.POSITION);
        points.push(...vertices.map((p) => [p[0], -p[2]] as Point));
        for (const target of primitive.targets ?? []) {
          const deltas = read(target.POSITION);
          points.push(
            ...vertices.map(
              (p, i) => [p[0] + deltas[i][0], -p[2] - deltas[i][2]] as Point,
            ),
          );
        }
      }
  }
  return points;
}
it("native inward leaf and every gasket morph endpoint remain inside the separate conservative collider at closed, intermediate and open poses", () => {
  const points = sourcePoints();
  for (const fraction of [0, 0.37, 1])
    for (const quarterTurns of [0, 1, 2, 3]) {
      const current = { ...frame, origin: [7, 9] as Point, quarterTurns },
        polygon = doorway250LeafObstacle(current, fraction).vertices;
      const angle = (fraction * Math.PI) / 2,
        c = Math.cos(angle),
        s = Math.sin(angle);
      for (const [x, y] of points) {
        const posed: Point = [
          0.3125 + c * (x - 0.3125) - s * (y - 0.0625),
          0.0625 + s * (x - 0.3125) + c * (y - 0.0625),
        ];
        const local = transformPoint(posed, quarterTurns),
          point: Point = [7 + local[0], 9 + local[1]];
        polygon.forEach((a, i) => {
          const b = polygon[(i + 1) % polygon.length];
          expect(
            (b[0] - a[0]) * (point[1] - a[1]) -
              (b[1] - a[1]) * (point[0] - a[0]),
          ).toBeGreaterThanOrEqual(-1e-10);
        });
      }
    }
  const open = doorway250LeafObstacle(frame, 1);
  expect(Math.max(...open.vertices.map((p) => p[0]))).toBeCloseTo(0.375, 8);
  expect(Math.min(...open.vertices.map((p) => p[1]))).toBeCloseTo(0.0625, 8);
});
it("continuous native sweep covers between-pose extrema and rotated bodies without accepting invalid native pins", () => {
  for (let i = 0; i <= 100; i++)
    for (const point of doorway250LeafObstacle(frame, i / 100).vertices)
      expect(
        doorway250SweepOccupied(frame, [{ position: point, radius: 0.001 }]),
      ).toBe(true);
  expect(
    doorway250SweepOccupied(frame, [{ position: [1, 1], radius: 0.3 }]),
  ).toBe(true);
  expect(
    doorway250SweepOccupied(frame, [{ position: [1, -1], radius: 0.3 }]),
  ).toBe(false);
  expect(
    doorway250SweepOccupied({ ...frame, origin: [7, 9], quarterTurns: 1 }, [
      { position: [6, 10], radius: 0.3 },
    ]),
  ).toBe(true);
  expect(() =>
    doorway250LeafObstacle({ ...frame, leafSha256: "legacy" }, 0),
  ).toThrow(/pinned/);
  expect(() => doorway250LeafObstacle(frame, NaN)).toThrow(/fraction/);
  expect(() =>
    doorway250SweepOccupied(frame, [{ position: [0, 0], radius: NaN }]),
  ).toThrow(/occupant/);
});
it("the bounded review layout compiles with existing slot, room and centered reservation rules", () => {
  const document = createDoorway250ReviewLayout(),
    result = compileLayout(document);
  expect(result.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  expect(result.valid).toBe(true);
  expect(result.area).toBe(24);
  expect(document.openings).toMatchObject([
    { a: [76, 64], b: [116, 64], clearance: 32, kind: "door", setback: 12 },
  ]);
  expect(document.rooms.map((room) => room.name)).toEqual([
    "South bay",
    "North bay",
  ]);
});
