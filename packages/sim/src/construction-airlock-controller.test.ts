import { expect, test } from "vitest";
import {
  requestNativeAirlock,
  stepNativeAirlock,
  nativeAirlockPassageAllowed,
  type NativeAirlockState,
  type NativeAirlockContext,
} from "./construction-airlock-controller";
const state = (): NativeAirlockState => ({
  inner: {
    hingeFraction: 0,
    sealRetraction: 0,
    targetOpen: false,
    blocked: false,
  },
  outer: {
    hingeFraction: 0,
    sealRetraction: 0,
    targetOpen: false,
    blocked: false,
  },
  pumpTarget: null,
});
const context = (): NativeAirlockContext => ({
  pressure: {
    chamberPa: 100000,
    innerPa: 100000,
    outerPa: 0,
    maxOpeningDifferentialPa: 1000,
  },
  powered: true,
  chamberIntact: true,
  sealsQualified: { inner: true, outer: true },
  motion: {
    inner: {
      hingeSeconds: 1,
      sealSeconds: 0.5,
      hingeObstructed: false,
      sealObstructed: false,
    },
    outer: {
      hingeSeconds: 1,
      sealSeconds: 0.5,
      hingeObstructed: false,
      sealObstructed: false,
    },
  },
});
function opened(side: "inner" | "outer", s = state(), c = context()) {
  const r = requestNativeAirlock(s, c, { kind: "open", side }, true);
  if (!r.ok) throw Error(r.reason);
  return r.state;
}
test("opening reserves target then retracts gasket before moving actual hinge", () => {
  const s = opened("inner"),
    c = context();
  expect(s.inner.hingeFraction).toBe(0);
  const n = stepNativeAirlock(s, c, 0.25);
  expect(n.inner).toMatchObject({ hingeFraction: 0, sealRetraction: 0.5 });
  expect(
    requestNativeAirlock(
      n,
      { ...c, pressure: { ...c.pressure, outerPa: 100000 } },
      { kind: "open", side: "outer" },
      true,
    ),
  ).toMatchObject({ ok: false, reason: "interlock" });
  expect(
    requestNativeAirlock(n, c, { kind: "startPump", side: "outer" }, true),
  ).toMatchObject({ ok: false, reason: "interlock" });
});
test("current pressure and opposing partly deployed seal are rechecked during motion", () => {
  const s = opened("inner"),
    c = context();
  c.pressure.chamberPa = 50000;
  expect(stepNativeAirlock(s, c, 0.25).inner).toMatchObject({
    hingeFraction: 0,
    sealRetraction: 0,
    blocked: true,
  });
  c.pressure.chamberPa = 100000;
  s.outer.sealRetraction = 0.01;
  expect(stepNativeAirlock(s, c, 0.25).inner.blocked).toBe(true);
});
test("power loss holds partly-open pose and cancels pump without changing gas", () => {
  const s = state(),
    c = context();
  s.inner = {
    hingeFraction: 0.4,
    sealRetraction: 1,
    targetOpen: true,
    blocked: false,
  };
  c.powered = false;
  expect(stepNativeAirlock(s, c, 0.25).inner).toMatchObject({
    hingeFraction: 0.4,
    sealRetraction: 1,
    blocked: true,
  });
  const pump = state();
  pump.pumpTarget = "outer";
  expect(stepNativeAirlock(pump, c, 0.25).pumpTarget).toBe(null);
  expect(c.pressure.chamberPa).toBe(100000);
});
test("obstructed close retains physical pose and prevents opposite door opening", () => {
  const s = state(),
    c = context();
  s.inner = {
    hingeFraction: 0.4,
    sealRetraction: 1,
    targetOpen: false,
    blocked: false,
  };
  c.motion.inner.hingeObstructed = true;
  expect(stepNativeAirlock(s, c, 0.25).inner.hingeFraction).toBe(0.4);
  expect(
    requestNativeAirlock(
      s,
      { ...c, pressure: { ...c.pressure, outerPa: 100000 } },
      { kind: "open", side: "outer" },
      true,
    ).ok,
  ).toBe(false);
});
test("pressure, admission and qualified seals gate commands; pump request creates no gas", () => {
  const s = state(),
    c = context();
  expect(
    requestNativeAirlock(s, c, { kind: "open", side: "outer" }, true),
  ).toMatchObject({ ok: false, reason: "unsafe-pressure" });
  expect(
    requestNativeAirlock(s, c, { kind: "open", side: "inner" }, false),
  ).toMatchObject({ ok: false, reason: "permission" });
  c.sealsQualified.outer = false;
  expect(
    requestNativeAirlock(s, c, { kind: "open", side: "inner" }, true),
  ).toMatchObject({ ok: false, reason: "broken-seal" });
  c.sealsQualified.outer = true;
  const next = requestNativeAirlock(
    s,
    c,
    { kind: "startPump", side: "outer" },
    true,
  );
  expect(next).toMatchObject({ ok: true, state: { pumpTarget: "outer" } });
  expect(c.pressure.chamberPa).toBe(100000);
});
test("physical passage requires fully open accepted leaf and supported exposure-authorized route", () => {
  const s = state(),
    gate = {
      authorized: true,
      supportedRoute: true,
      destinationExposureAllowed: true,
    };
  expect(nativeAirlockPassageAllowed(s, "outer", gate)).toBe(false);
  s.outer = {
    hingeFraction: 1,
    sealRetraction: 1,
    targetOpen: true,
    blocked: false,
  };
  expect(nativeAirlockPassageAllowed(s, "outer", gate)).toBe(true);
  for (const k of Object.keys(gate))
    expect(
      nativeAirlockPassageAllowed(s, "outer", { ...gate, [k]: false }),
    ).toBe(false);
  expect(() =>
    stepNativeAirlock({ ...s, inner: { ...s.outer } }, context(), 0.05),
  ).toThrow("conflicting");
});

test("manual actuation scope cannot move a second paused mechanism", () => {
  const s: NativeAirlockState = {
    inner: {
      hingeFraction: 0.4,
      sealRetraction: 1,
      targetOpen: false,
      blocked: false,
    },
    outer: {
      hingeFraction: 0.4,
      sealRetraction: 1,
      targetOpen: false,
      blocked: false,
    },
    pumpTarget: null,
  };
  const c: NativeAirlockContext = {
    pressure: {
      innerPa: 0,
      chamberPa: 0,
      outerPa: 0,
      maxOpeningDifferentialPa: 1000,
    },
    powered: true,
    actuatedSides: ["inner"],
    chamberIntact: true,
    sealsQualified: { inner: true, outer: true },
    motion: {
      inner: {
        hingeSeconds: 1,
        sealSeconds: 0.25,
        hingeObstructed: false,
        sealObstructed: false,
      },
      outer: {
        hingeSeconds: 1,
        sealSeconds: 0.25,
        hingeObstructed: false,
        sealObstructed: false,
      },
    },
  };
  const next = stepNativeAirlock(s, c, 0.05);
  expect(next.inner.hingeFraction).toBeLessThan(s.inner.hingeFraction);
  expect(next.outer).toEqual({ ...s.outer, blocked: true });
});
