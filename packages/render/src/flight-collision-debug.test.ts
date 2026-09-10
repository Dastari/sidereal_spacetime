import { expect, test } from "vitest";
import { Matrix } from "@babylonjs/core/Maths/math.vector";
import { LAB_HULL } from "@sidereal/content/space";
import { WAYFARER_STARTER } from "@sidereal/content/wayfarer-starter";
import { stockFlightCollisionDebugFrame } from "./flight-collision-debug";
import { collisionDebugGeometry } from "./debug-collision-geometry";
const world = Matrix.Identity();
test("stock flight draws exactly one offset capsule without interior floor or equipment proxies", () => {
  const source = stockFlightCollisionDebugFrame({
    shipId: "ship",
    source: { kind: "legacy-stock" },
    world,
  })!;
  expect(source.frame.floors).toEqual([]);
  expect(source.frame.obstacles).toEqual([]);
  expect(source.frame.segments).toEqual([
    {
      id: "stock-flight-capsule",
      a: [0, -6],
      b: [0, 8.25],
      halfWidthM: LAB_HULL.radius,
    },
  ]);
  const lines = collisionDebugGeometry(source);
  expect(lines.floors).toEqual([]);
  expect(lines.blockers).toHaveLength(1);
  const points = lines.blockers[0]!;
  expect(Math.min(...points.map((p) => p.x))).toBeCloseTo(-5.4);
  expect(Math.max(...points.map((p) => p.x))).toBeCloseTo(5.4);
  expect(Math.min(...points.map((p) => p.z))).toBeCloseTo(-13.65);
  expect(Math.max(...points.map((p) => p.z))).toBeCloseTo(11.4);
});
test("rotated capsule follows world XY to renderer X/-Z and retains physical COM offset", () => {
  const world = Matrix.RotationY(Math.PI / 2).multiply(
    Matrix.Translation(100, 0, -200),
  );
  const source = stockFlightCollisionDebugFrame({
    shipId: "ship",
    source: { kind: "legacy-stock" },
    world,
  })!;
  const points = collisionDebugGeometry(source).blockers[0]!;
  expect(Math.min(...points.map((p) => p.x))).toBeCloseTo(100 - 13.65);
  expect(Math.max(...points.map((p) => p.x))).toBeCloseTo(100 + 11.4);
  expect(Math.min(...points.map((p) => p.z))).toBeCloseTo(-200 - 5.4);
  expect(Math.max(...points.map((p) => p.z))).toBeCloseTo(-200 + 5.4);
  expect(source.world).toBe(world);
});
test("only the exact admitted authored template qualifies; static reviews and unknown sources stay hidden", () => {
  const source = {
    kind: "authored" as const,
    templateSha256: WAYFARER_STARTER.sha256,
    flightAdmitted: true,
  };
  expect(
    stockFlightCollisionDebugFrame({ shipId: "ship", source, world }),
  ).toBeDefined();
  for (const invalid of [
    undefined,
    { kind: "unsupported" as const },
    { ...source, templateSha256: "unknown" },
    { ...source, flightAdmitted: false },
    { kind: "authored" as const, templateSha256: WAYFARER_STARTER.sha256 },
  ])
    expect(
      stockFlightCollisionDebugFrame({
        shipId: "ship",
        source: invalid,
        world,
      }),
    ).toBeUndefined();
  expect(
    stockFlightCollisionDebugFrame({ shipId: "", source, world }),
  ).toBeUndefined();
});
