import { describe, expect, it, vi } from "vitest";
vi.mock("spacetimedb/server", () => ({ SenderError: class extends Error {} }));
import { joinSharedSystem, ensureCanonicalSystem } from "./shared-world";
import {
  stepSharedWorld,
  type SharedPhysicsContext,
} from "./shared-world-physics";
import { fixture, other, owner } from "./shared-world-test-fixture";
import { SHARED_SYSTEM_SEED } from "@sidereal/content/shared-system";
function setup() {
  const f = fixture();
  joinSharedSystem(f.ctx(), f.args());
  joinSharedSystem(f.ctx(2, other), f.args(2));
  const physics = () =>
    ({
      ...f.ctx(),
      timestamp: { microsSinceUnixEpoch: 100000n },
    }) as unknown as SharedPhysicsContext;
  return { ...f, physics };
}
function rest(f: ReturnType<typeof setup>) {
  for (const row of f.db.shipWorldMotion.rows.values())
    f.db.shipWorldMotion.shipId.update({ ...row, vx: 0, vy: 0, omega: 0 });
}
function pilot(f: ReturnType<typeof setup>, n = 1) {
  const identity = n === 1 ? owner : other;
  f.db.station.insert({
    id: `seat${n}`,
    shipId: `ship${n}`,
    occupantId: `actor${n}`,
    operational: true,
  });
  f.db.inputControl.insert({
    characterId: `actor${n}`,
    owner: identity,
    connectionId: `c${n}`,
    sequence: 0n,
  });
  f.db.input.characterId.update({
    ...f.db.input.characterId.find(`actor${n}`),
    throttle: 1,
    updatedMicros: 100n,
  });
}
describe("authoritative once-per-system adapter", () => {
  it("two ships advance one shared rock exactly once and leave legacy rows untouched", () => {
    const f = setup(),
      id = SHARED_SYSTEM_SEED.bodies[0].id;
    const rock = f.db.bodyWorldMotion.bodyId.find(id);
    f.db.bodyWorldMotion.bodyId.update({ ...rock, vx: 10 });
    const old = f.db.spaceBody.writes,
      shipWrites = f.db.ship.writes;
    const result = stepSharedWorld(f.physics());
    expect(f.db.bodyWorldMotion.bodyId.find(id).x - rock.x).toBeCloseTo(
      0.5,
      10,
    );
    expect(f.db.bodyWorldMotion.bodyId.find(id).serverTick).toBe(2n);
    expect(result.changedMotions).toBe(3);
    expect(f.db.spaceBody.writes).toBe(old);
    expect(f.db.ship.writes).toBe(shipWrites);
  });
  it("initializes the complete engine telemetry once then keeps resting samples write-free", () => {
    const f = setup();
    rest(f);
    expect(stepSharedWorld(f.physics())).toMatchObject({
      changedMotions: 0,
      changedOutputs: 18,
    });
    expect(f.db.actuatorOutput.rows.size).toBe(18);
    expect(
      [...f.db.actuatorOutput.rows.values()].every(
        (row: any) => row.throttle === 0,
      ),
    ).toBe(true);
    const before = f.writes();
    for (let i = 1; i <= 100; i++) {
      expect(
        stepSharedWorld({
          ...f.physics(),
          timestamp: { microsSinceUnixEpoch: 100_000n + BigInt(i) * 50_000n },
        }),
      ).toMatchObject({
        status: "idle",
        changedMotions: 0,
        changedOutputs: 0,
      });
    }
    expect(f.writes()).toBe(before);
    expect(f.db.actuatorOutput.rows.size).toBe(18);
  });
  it("only the occupied operational station and current admitted input-holder connection supply thrust", () => {
    const f = setup();
    rest(f);
    pilot(f);
    const result = stepSharedWorld(f.physics());
    expect(result.changedMotions).toBe(1);
    expect(result.changedOutputs).toBeGreaterThan(0);
    expect(f.db.shipWorldMotion.shipId.find("ship1").vy).toBeGreaterThan(0);
    expect(f.db.shipWorldMotion.shipId.find("ship2").vy).toBe(0);
    f.db.authSession.connectionId.update({
      ...f.db.authSession.connectionId.find("c1"),
      expiresMicros: 99n,
    });
    const before = f.db.shipWorldMotion.shipId.find("ship1").vy;
    f.physics = () =>
      ({
        ...f.ctx(),
        timestamp: { microsSinceUnixEpoch: 150000n },
      }) as unknown as SharedPhysicsContext;
    stepSharedWorld(f.physics());
    expect(f.db.shipWorldMotion.shipId.find("ship1").vy).toBeCloseTo(
      before,
      12,
    );
    expect(f.db.inputControl.characterId.find("actor1")).toBeUndefined();
    expect(
      [...f.db.actuatorOutput.rows.values()].every(
        (o: any) => o.throttle === 0,
      ),
    ).toBe(true);
  });
  it("future/stale intent and operational or membership loss cannot actuate", () => {
    for (const reason of ["future", "stale", "station", "admission"] as const) {
      const f = setup();
      rest(f);
      pilot(f);
      if (reason === "future" || reason === "stale")
        f.db.input.characterId.update({
          ...f.db.input.characterId.find("actor1"),
          updatedMicros: reason === "future" ? 100001n : 0n,
        });
      if (reason === "stale")
        f.physics = () =>
          ({
            ...f.ctx(),
            timestamp: { microsSinceUnixEpoch: 400000n },
          }) as unknown as SharedPhysicsContext;
      if (reason === "station")
        f.db.station.shipId.update({
          ...f.db.station.shipId.find("ship1"),
          operational: false,
        });
      if (reason === "admission")
        f.db.worldAdmission.characterId.delete("actor1");
      expect(stepSharedWorld(f.physics()).changedMotions).toBe(0);
    }
  });
  it("updates negative cell keys only when motion crosses their floor boundary", () => {
    const f = setup();
    rest(f);
    const ship = f.db.shipWorldMotion.shipId.find("ship1");
    f.db.shipWorldMotion.shipId.update({
      ...ship,
      x: -399.9,
      y: -200,
      vx: -10,
      cellX: -1n,
      cellY: -1n,
    });
    stepSharedWorld(f.physics());
    expect(f.db.shipWorldMotion.shipId.find("ship1")).toMatchObject({
      cellX: -2n,
      cellY: -1n,
      serverTick: 2n,
    });
  });
  it("halts the whole island on capacity overflow instead of stepping a subset", () => {
    const f = setup();
    rest(f);
    const model = f.db.shipWorldMotion.shipId.find("ship1");
    for (let i = 0; i < 59; i++)
      f.db.shipWorldMotion.insert({
        ...model,
        shipId: `crowd${i}`,
        x: 1000 + i * 50,
      });
    const before = f.db.shipWorldMotion.writes;
    expect(stepSharedWorld(f.physics())).toMatchObject({
      status: "exhausted",
      reason: "island-admission-budget",
    });
    expect(f.db.shipWorldMotion.writes).toBe(before);
  });
  it("uses one active-system clock write and skips repeated samples without confusing a new admission stamp", () => {
    const f = setup();
    const ship = f.db.shipWorldMotion.shipId.find("ship1");
    f.db.shipWorldMotion.shipId.update({ ...ship, serverTick: 2n });
    const clockBefore = f.db.worldSystem.writes;
    expect(stepSharedWorld(f.physics()).changedMotions).toBeGreaterThan(0);
    expect(f.db.worldSystem.writes - clockBefore).toBe(1);
    ensureCanonicalSystem(f.db);
    expect(f.db.worldSystem.writes - clockBefore).toBe(1);
    const after = f.writes();
    expect(stepSharedWorld(f.physics())).toMatchObject({
      status: "idle",
      reason: "sample-already-applied",
    });
    expect(f.writes()).toBe(after);
    expect(
      stepSharedWorld({
        ...f.physics(),
        timestamp: { microsSinceUnixEpoch: 50000n },
      }),
    ).toMatchObject({ status: "exhausted", reason: "sample-regressed" });
  });
});

it("real stock flight brakes to exact rest and then emits no motion, actuator or clock writes", () => {
  const f = setup();
  rest(f);
  pilot(f);
  f.db.authSession.connectionId.update({
    ...f.db.authSession.connectionId.find("c1"),
    expiresMicros: 1_000_000_000_000n,
  });
  let now = 100_000n;
  const step = (throttle: number, turn: number) => {
    now += 50_000n;
    f.db.input.characterId.update({
      ...f.db.input.characterId.find("actor1"),
      throttle,
      turn,
      updatedMicros: now,
    });
    return stepSharedWorld({
      ...f.physics(),
      timestamp: { microsSinceUnixEpoch: now },
    });
  };
  for (let i = 0; i < 15; i++) step(1, 0.3);
  expect(
    Math.hypot(
      f.db.shipWorldMotion.shipId.find("ship1").vx,
      f.db.shipWorldMotion.shipId.find("ship1").vy,
    ),
  ).toBeGreaterThan(0.1);
  for (let i = 0; i < 500; i++) step(0, 0);
  expect(f.db.shipWorldMotion.shipId.find("ship1")).toMatchObject({
    vx: 0,
    vy: 0,
    omega: 0,
  });
  expect(
    [...f.db.actuatorOutput.rows.values()].every(
      (row: any) => row.throttle === 0,
    ),
  ).toBe(true);
  const writes = () =>
    f.db.shipWorldMotion.writes +
    f.db.bodyWorldMotion.writes +
    f.db.actuatorOutput.writes +
    f.db.worldSystem.writes;
  const before = writes(),
    motion = f.db.shipWorldMotion.shipId.find("ship1");
  for (let i = 0; i < 100; i++)
    expect(step(0, 0)).toMatchObject({
      status: "idle",
      changedMotions: 0,
      changedOutputs: 0,
    });
  expect(writes()).toBe(before);
  expect(f.db.shipWorldMotion.shipId.find("ship1")).toEqual(motion);
  expect(step(1, 0).changedMotions).toBeGreaterThan(0);
});
