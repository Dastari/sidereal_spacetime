import { expect, test } from "vitest";
import {
  sealedDoorMotionStep as step,
  sealedDoorPhase as phase,
  type SealedDoorMotion,
  type SealMotionPolicy,
} from "./construction-seal-motion";
const policy: SealMotionPolicy = {
  hingeSeconds: 1,
  sealSeconds: 0.2,
  actuationAllowed: true,
  deploymentAllowed: true,
  hingeObstructed: false,
  sealObstructed: false,
};
const closed: SealedDoorMotion = {
  hingeFraction: 0,
  sealRetraction: 0,
  targetOpen: false,
  blocked: false,
};
test("gasket fully retracts before physical hinge movement and deploys only after exact closure", () => {
  let s = step({ ...closed, targetOpen: true }, 0.1, policy);
  expect(s.sealRetraction).toBe(0.5);
  expect(s.hingeFraction).toBe(0);
  expect(phase(s)).toBe("retracting");
  s = step(s, 0.2, policy);
  expect(s.sealRetraction).toBe(1);
  expect(s.hingeFraction).toBeCloseTo(0.1);
  for (let i = 0; i < 20; i++) {
    s = step(s, 0.05, policy);
    expect(s.hingeFraction === 0 || s.sealRetraction === 1).toBe(true);
  }
  expect(phase(s)).toBe("open");
  s = { ...s, targetOpen: false };
  for (let i = 0; i < 24; i++) {
    s = step(s, 0.05, policy);
    expect(s.hingeFraction === 0 || s.sealRetraction === 1).toBe(true);
  }
  expect(s.hingeFraction).toBe(0);
  expect(s.sealRetraction).toBeCloseTo(0);
});
test("reversal in each phase preserves physical invariants and consumes the same time under subdivision", () => {
  const seeds = [
    { ...closed, sealRetraction: 0.6, targetOpen: true },
    { ...closed, hingeFraction: 0.6, sealRetraction: 1, targetOpen: true },
    { ...closed, hingeFraction: 0.2, sealRetraction: 1 },
    { ...closed, sealRetraction: 0.8 },
  ];
  for (const seed of seeds) {
    const reversed = { ...seed, targetOpen: !seed.targetOpen };
    const whole = step(reversed, 0.2, policy);
    let split = reversed;
    for (let i = 0; i < 4; i++) split = step(split, 0.05, policy);
    expect(split.hingeFraction).toBeCloseTo(whole.hingeFraction, 12);
    expect(split.sealRetraction).toBeCloseTo(whole.sealRetraction, 12);
    expect(split.hingeFraction === 0 || split.sealRetraction === 1).toBe(true);
  }
});
test("obstruction, loss of actuation and invalid contact permission pause without teleporting or claiming a seal", () => {
  const opening = { ...closed, targetOpen: true };
  expect(step(opening, 0.2, { ...policy, sealObstructed: true })).toEqual({
    ...opening,
    blocked: true,
  });
  const retracted = step(opening, 0.2, { ...policy, hingeObstructed: true });
  expect(retracted).toEqual({ ...opening, sealRetraction: 1, blocked: true });
  expect(step(retracted, 0.2, { ...policy, actuationAllowed: false })).toEqual(
    retracted,
  );
  const shut = { ...closed, sealRetraction: 1 };
  expect(step(shut, 0.2, { ...policy, deploymentAllowed: false })).toEqual({
    ...shut,
    blocked: true,
  });
  expect(step(shut, 0.2, policy)).toEqual(closed);
  expect(step(closed, 0.2, { ...policy, actuationAllowed: false })).toEqual(
    closed,
  );
});
test("invalid physical states and unbounded policy values reject before modifying inputs", () => {
  for (const bad of [
    { ...closed, hingeFraction: 0.01 },
    { ...closed, sealRetraction: NaN },
    { ...closed, hingeFraction: 2 },
  ])
    expect(() => step(bad, 0.05, policy)).toThrow();
  for (const seconds of [NaN, -0.1, 0.251])
    expect(() => step(closed, seconds, policy)).toThrow();
  for (const duration of [Infinity, 0, 61])
    expect(() =>
      step(closed, 0.05, { ...policy, sealSeconds: duration }),
    ).toThrow();
  expect(closed).toEqual({
    hingeFraction: 0,
    sealRetraction: 0,
    targetOpen: false,
    blocked: false,
  });
});
