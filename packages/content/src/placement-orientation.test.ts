import { expect, test } from "vitest";
import {
  classifyLegacyYaw,
  normalizeYawStep,
  orientationCapabilityError,
  quarterTurnsToYawStep,
  readYawStep,
  transformPlacementPoint,
  yawStepRadians,
} from "./placement-orientation";

test("persisted admission is strict while finite UI commands wrap safely", () => {
  for (const invalid of [-1, 72, 1.5, NaN, Infinity, "3", undefined])
    expect(() => readYawStep(invalid)).toThrow();
  for (const invalid of [NaN, Infinity, 0.5, Number.MAX_SAFE_INTEGER + 1])
    expect(() => normalizeYawStep(invalid)).toThrow();
  expect(normalizeYawStep(-1)).toBe(71);
  expect(normalizeYawStep(72 * 100 + 9)).toBe(9);
  expect(normalizeYawStep(-72)).toBe(0);
  expect(Object.is(readYawStep(-0), -0)).toBe(false);
  for (const step of [18, 9, 6, 3, 1])
    expect(normalizeYawStep(71 + step)).toBe(step - 1);
});

test("all finite angles survive radians classification without losing original bytes", () => {
  const raw = ' { "rotation" : 0, "other": [1, 2] }\n';
  for (let yaw = 0; yaw < 72; yaw++) {
    const angle = yawStepRadians(yaw);
    expect(classifyLegacyYaw(angle, raw)).toEqual({
      status: "representable",
      yawStep: yaw,
      sourceRaw: raw,
      sourceRadians: angle,
    });
    expect(classifyLegacyYaw(angle - 4 * Math.PI, raw)).toMatchObject({
      status: "representable",
      yawStep: yaw,
      sourceRaw: raw,
    });
  }
  for (let q = 0; q < 4; q++) expect(quarterTurnsToYawStep(q)).toBe(q * 18);
  for (const q of [-1, 4, 0.2, NaN])
    expect(() => quarterTurnsToYawStep(q)).toThrow();
});

test("arbitrary radians remain unresolved and proposals never replace the source", () => {
  const angle = (7 * Math.PI) / 180,
    raw = ' {"rotation": 0.12217304763960307}\n';
  const result = classifyLegacyYaw(angle, raw);
  expect(result).toMatchObject({
    status: "unresolved",
    sourceRaw: raw,
    sourceRadians: angle,
    proposal: { yawStep: 1 },
  });
  if (result.status === "unresolved")
    expect(result.proposal!.angularDeltaRadians).toBeCloseTo(
      (-2 * Math.PI) / 180,
      14,
    );
  expect(classifyLegacyYaw(yawStepRadians(3) + 1e-8, raw).status).toBe(
    "unresolved",
  );
  for (const angle of [NaN, Infinity, -Infinity, 1e12])
    expect(classifyLegacyYaw(angle, raw)).toMatchObject({
      status: "unresolved",
      sourceRaw: raw,
      proposal: null,
    });
});

test("capabilities reject unsupported yaw and reflection without implicit qualification", () => {
  const quarters = {
    allowedYawSteps: [0, 18, 36, 54],
    reflection: "forbidden",
  } as const;
  expect(orientationCapabilityError(18, false, quarters)).toBeUndefined();
  expect(orientationCapabilityError(1, false, quarters)).toMatch(/yawStep/);
  expect(orientationCapabilityError(18, true, quarters)).toMatch(/reflection/);
  expect(orientationCapabilityError(0, false, undefined)).toMatch(
    /unqualified/,
  );
  expect(
    orientationCapabilityError(1, true, {
      allowedYawSteps: [1],
      reflection: "allowed",
    }),
  ).toBeUndefined();
  expect(() =>
    orientationCapabilityError(0, false, {
      allowedYawSteps: [72],
      reflection: "allowed",
    }),
  ).toThrow();
  expect(() =>
    orientationCapabilityError(0, false, {
      allowedYawSteps: [0, 0],
      reflection: "allowed",
    }),
  ).toThrow();
});

test("continuous transforms preserve negative coordinates, mirror order and socket lengths", () => {
  expect(transformPlacementPoint([-3, 2], 18)).toEqual([-2, -3]);
  expect(transformPlacementPoint([-3, 2], 18, true)).toEqual([-2, 3]);
  expect(transformPlacementPoint([0, 0], 54)).toEqual([0, 0]);
  for (let yaw = 0; yaw < 72; yaw++) {
    const p = transformPlacementPoint([-3, 2], yaw);
    const restored = transformPlacementPoint(p, normalizeYawStep(-yaw));
    expect(restored[0]).toBeCloseTo(-3, 12);
    expect(restored[1]).toBeCloseTo(2, 12);
    const mirrored = transformPlacementPoint([-3, 2], yaw, true);
    const undoRotation = transformPlacementPoint(
      mirrored,
      normalizeYawStep(-yaw),
    );
    expect(undoRotation[0]).toBeCloseTo(3, 12);
    expect(undoRotation[1]).toBeCloseTo(2, 12);
    const socket = transformPlacementPoint([1, 0], yaw, true);
    expect(Math.hypot(...socket)).toBeCloseTo(1, 14);
  }
  const fine = transformPlacementPoint([32, 0], 1);
  expect(Number.isInteger(fine[0])).toBe(false);
  expect(Number.isInteger(fine[1])).toBe(false);
  expect(() => transformPlacementPoint([NaN, 0], 0)).toThrow();
});
