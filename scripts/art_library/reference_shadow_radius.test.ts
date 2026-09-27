import { expect, test } from "vitest";
import { referenceShadowRadius } from "./reference_shadow_radius";

test("worker bound encloses actual vertices without inflating to the AABB diagonal", () => {
  const ring = new Float32Array([1.88, 0, 0, 0, 0, -1.88, -1.88, 0, 0]);
  expect(referenceShadowRadius(ring)).toBeCloseTo(1.88);
  expect(referenceShadowRadius([0, -3, 4])).toBe(5);
  expect(referenceShadowRadius([])).toBe(0);
  expect(() => referenceShadowRadius([NaN, 0, 0])).toThrow();
  expect(() => referenceShadowRadius([1, 2])).toThrow();
});
