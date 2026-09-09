import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import proof from "./wayfarer-refit-fuel-proof.json";
import {
  PRESERVED_FUEL_MOUNT as d,
  requireQualifiedPreservedFuelMount as qualify,
} from "./wayfarer-refit-mount";
const valid = { ...d, x: -3, y: 7, z: 0.1875 };
test("actual native certificate is the exact independently rerun qualification and mount retains provisional old limits", () => {
  expect(proof).toEqual(
    JSON.parse(
      readFileSync("docs/handoffs/wayfarer_refit_fuel_geometry.json", "utf8"),
    ),
  );
  expect(qualify(valid)).toBe(d);
  expect(d.stacking).toBe(false);
  expect(d.capacityLitres).toBe(100);
  expect(d.maxMassKg).toBe(80);
});
test("moved, rescaled-capacity or substituted native mount cannot borrow this certificate", () => {
  for (const altered of [
    { x: -3.1 },
    { z: 1 },
    { assetSha256: "0".repeat(64) },
    { baseSha256: "0".repeat(64) },
    { capacityLitres: 101 },
    { maxMassKg: 81 },
  ])
    expect(() => qualify({ ...valid, ...altered })).toThrow("Exact");
});
