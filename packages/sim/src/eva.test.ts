import { describe, expect, it } from "vitest";
import { PREFAB_SHIPS } from "@sidereal/content/prefabs";
import { defaultPrefabComponentCatalog } from "@sidereal/content/ship-prefab-catalog";
import {
  EVA,
  airlockFromInside,
  airlockFromOutside,
  evaExitPose,
  evaReference,
  forwardOf,
  headingOf,
  hullSurfaceAt,
  hullWalkable,
  maglockPoint,
  pointVelocity,
  prefabEvaModel,
  shipToWorld,
  stepEvaFree,
  stepMaglockWalk,
  worldToShip,
  type EvaFreeState,
  type ShipPose,
} from "./eva";
import { prefabToShipMetres } from "./prefab-construction";

const catalog = defaultPrefabComponentCatalog();
const wren = PREFAB_SHIPS.find((p) => p.id === "fed.s.wren")!;
const model = prefabEvaModel(wren, catalog);
const toShip = prefabToShipMetres(wren);
const still: ShipPose = { x: 0, y: 0, vx: 0, vy: 0, heading: 0, omega: 0 };

function fly(
  state: EvaFreeState,
  input: { forward: number; strafe: number; turn: number },
  ticks: number,
  ref: (s: EvaFreeState) => [number, number] = () => [0, 0],
) {
  let s = state;
  for (let i = 0; i < ticks; i++) s = stepEvaFree(s, input, ref(s));
  return s;
}

describe("EVA ship model (prefab grammar)", () => {
  it("derives Wren's one exterior airlock on the starboard hold face", () => {
    expect(model.airlocks).toHaveLength(1);
    const lock = model.airlocks[0];
    expect(lock.id).toBe("airlock");
    expect(lock.componentId).toBe("airlock.exterior.md");
    // catalogue cycleS 12 s: one direction is half a cycle
    expect(lock.cycleMicros).toBe(6_000_000n);
    // plan edge y = 0 at x 5..7 (starboard) → game frame +x side
    const hatch = toShip([6, 0]);
    expect(lock.hatch[0]).toBeCloseTo(hatch[0], 9);
    expect(lock.hatch[1]).toBeCloseTo(hatch[1], 9);
    expect(lock.normal).toEqual([1, 0]);
    expect(lock.outside[0]).toBeCloseTo(hatch[0] + EVA.exitOutboardM, 9);
    expect(lock.inside[0]).toBeCloseTo(hatch[0] - EVA.entryInboardM, 9);
    expect(lock.room).toBe("hold");
  });

  it("has a hull footprint with roof heights (deck hull above wings)", () => {
    const centre = toShip([4, 3.5]);
    expect(hullSurfaceAt(model, centre)).toBeCloseTo(43 / 16, 9);
    const wing = toShip([1, -1]);
    expect(hullSurfaceAt(model, wing)).toBeCloseTo(28 / 16, 9);
    expect(hullSurfaceAt(model, [30, 30])).toBeUndefined();
    // the hatch outside point is off the hull; the inside point is on it
    const lock = model.airlocks[0];
    expect(hullSurfaceAt(model, lock.outside)).toBeUndefined();
    expect(hullSurfaceAt(model, lock.inside)).toBeDefined();
    expect(model.radiusM).toBeGreaterThan(6);
  });

  it("finds the airlock from the deck and from space only within reach", () => {
    const lock = model.airlocks[0];
    expect(airlockFromInside(model, lock.inside)?.id).toBe("airlock");
    expect(
      airlockFromInside(model, [lock.inside[0] - 1.6, lock.inside[1]]),
    ).toBeUndefined();
    expect(
      airlockFromOutside(model, [lock.outside[0] + 2, lock.outside[1]])?.id,
    ).toBe("airlock");
    expect(
      airlockFromOutside(model, [lock.outside[0] + 3, lock.outside[1]]),
    ).toBeUndefined();
  });

  it("ignores non-airlock edge mounts (cargo doors)", () => {
    const m = prefabEvaModel(wren, catalog, () => ({
      kind: "cargo-door",
      cycleS: 4,
    }));
    // a custom lookup builds a fresh model only for an uncached document
    expect(m.airlocks.length).toBe(1);
    const copy = structuredClone(wren);
    expect(
      prefabEvaModel(copy, catalog, () => ({ kind: "cargo-door", cycleS: 4 }))
        .airlocks,
    ).toHaveLength(0);
  });
});

describe("frames", () => {
  it("round-trips ship-local and world points and uses the ship heading convention", () => {
    const pose: ShipPose = { ...still, x: 100, y: -50, heading: 0.7 };
    const w = shipToWorld(pose, [2, 5]);
    const l = worldToShip(pose, w);
    expect(l[0]).toBeCloseTo(2, 12);
    expect(l[1]).toBeCloseTo(5, 12);
    // heading 0: the bow (+y local) points at world +y
    expect(shipToWorld(still, [0, 1])).toEqual([0, 1]);
    expect(forwardOf(0)).toEqual([0, 1]);
    expect(headingOf([1, 0])).toBeCloseTo(-Math.PI / 2, 12);
    expect(forwardOf(headingOf([1, 0]))[0]).toBeCloseTo(1, 12);
  });

  it("gives the rigid-body point velocity of a turning ship", () => {
    const pose: ShipPose = { ...still, vx: 3, omega: 0.5 };
    expect(pointVelocity(pose, [0, 4])).toEqual([3 - 2, 0]);
    expect(pointVelocity(pose, [4, 0])).toEqual([3, 2]);
  });
});

describe("jetpack integrator", () => {
  const rest: EvaFreeState = { x: 0, y: 0, vx: 0, vy: 0, heading: 0 };

  it("is unlimited and capped: full thrust settles at the relative speed cap", () => {
    const s = fly(rest, { forward: 1, strafe: 0, turn: 0 }, 400);
    expect(Math.hypot(s.vx, s.vy)).toBeCloseTo(EVA.speedCap, 3);
    expect(s.vx).toBeCloseTo(0, 9);
    expect(s.vy).toBeGreaterThan(0);
  });

  it("stabilises back to rest without input", () => {
    const moving = { ...rest, vx: 4, vy: -3 };
    const s = fly(moving, { forward: 0, strafe: 0, turn: 0 }, 300);
    expect(Math.hypot(s.vx, s.vy)).toBeLessThan(1e-3);
  });

  it("strafes and reverses at the reduced fraction", () => {
    const side = fly(rest, { forward: 0, strafe: 1, turn: 0 }, 400);
    expect(side.vx).toBeCloseTo(EVA.speedCap * EVA.strafe, 3);
    const back = fly(rest, { forward: -1, strafe: 0, turn: 0 }, 400);
    expect(back.vy).toBeCloseTo(-EVA.speedCap * EVA.strafe, 3);
  });

  it("turns counter-clockwise for positive input at the turn rate", () => {
    const s = fly(rest, { forward: 0, strafe: 0, turn: 1 }, 10);
    expect(s.heading).toBeCloseTo(EVA.turnRate * 0.5, 9);
  });

  it("never exceeds the acceleration limit", () => {
    const s = stepEvaFree(rest, { forward: 1, strafe: 0, turn: 0 }, [200, 0]);
    const dv = Math.hypot(s.vx, s.vy);
    expect(dv).toBeLessThanOrEqual(EVA.accelLimit * EVA.tickSeconds + 1e-9);
  });

  it("rejects non-finite input and clamps to the shared-world bound", () => {
    const s = stepEvaFree(
      rest,
      { forward: NaN, strafe: Infinity, turn: 0 },
      [0, 0],
    );
    expect(s).toEqual(rest);
    const edge = stepEvaFree(
      { ...rest, x: EVA.positionLimit, vx: 10 },
      { forward: 0, strafe: 0, turn: 0 },
      [10, 0],
    );
    expect(edge.x).toBe(EVA.positionLimit);
    expect(edge.vx).toBe(0);
  });

  it("is deterministic", () => {
    const a = fly(rest, { forward: 0.7, strafe: -0.3, turn: 0.4 }, 57);
    const b = fly(rest, { forward: 0.7, strafe: -0.3, turn: 0.4 }, 57);
    expect(a).toEqual(b);
  });
});

describe("relative motion near a moving ship", () => {
  it("keeps a body at rest relative to a ship flying at 40 m/s", () => {
    let ship: ShipPose = { ...still, vx: 40, vy: 10 };
    const lock = model.airlocks[0];
    const exit = evaExitPose(ship, lock);
    // the body leaves with the ship's point velocity
    expect([exit.vx, exit.vy]).toEqual([40, 10]);
    let body: EvaFreeState = exit;
    for (let i = 0; i < 200; i++) {
      ship = {
        ...ship,
        x: ship.x + ship.vx * 0.05,
        y: ship.y + ship.vy * 0.05,
      };
      const ref = evaReference(
        [{ id: "s", pose: ship, radiusM: 8 }],
        [body.x, body.y],
      );
      expect(ref?.shipId).toBe("s");
      body = stepEvaFree(
        body,
        { forward: 0, strafe: 0, turn: 0 },
        ref!.velocity,
      );
    }
    const local = worldToShip(ship, [body.x, body.y]);
    expect(local[0]).toBeCloseTo(lock.outside[0], 6);
    expect(local[1]).toBeCloseTo(lock.outside[1], 6);
  });

  it("follows a turning ship's point velocity", () => {
    let ship: ShipPose = { ...still, omega: 0.2 };
    const exit = evaExitPose(ship, model.airlocks[0]);
    let body: EvaFreeState = exit;
    const start = worldToShip(ship, [body.x, body.y]);
    let previous: [number, number] = [exit.vx, exit.vy];
    for (let i = 0; i < 100; i++) {
      ship = { ...ship, heading: ship.heading + ship.omega * 0.05 };
      const ref = evaReference(
        [{ id: "s", pose: ship, radiusM: 8 }],
        [body.x, body.y],
      )!;
      body = stepEvaFree(
        body,
        { forward: 0, strafe: 0, turn: 0 },
        ref.velocity,
        EVA.tickSeconds,
        previous,
      );
      previous = ref.velocity;
    }
    const local = worldToShip(ship, [body.x, body.y]);
    // the fed-forward reference keeps the body next to its local point through a 57° turn
    expect(Math.hypot(local[0] - start[0], local[1] - start[1])).toBeLessThan(
      0.2,
    );
  });

  it("holds station next to a ship accelerating within the stabiliser", () => {
    let ship: ShipPose = { ...still };
    let body: EvaFreeState = { x: 15, y: 0, vx: 0, vy: 0, heading: 0 };
    let previous: [number, number] = [0, 0];
    for (let i = 0; i < 200; i++) {
      ship = { ...ship, vy: ship.vy + 3 * 0.05 };
      ship = { ...ship, y: ship.y + ship.vy * 0.05 };
      const ref = evaReference(
        [{ id: "s", pose: ship, radiusM: 8 }],
        [body.x, body.y],
      )!;
      body = stepEvaFree(
        body,
        { forward: 0, strafe: 0, turn: 0 },
        ref.velocity,
        EVA.tickSeconds,
        previous,
      );
      previous = ref.velocity;
    }
    expect(ship.vy).toBeCloseTo(30, 6);
    expect(Math.abs(body.y - ship.y)).toBeLessThan(0.5);
  });

  it("is left behind by a ship that accelerates beyond the stabiliser", () => {
    let ship: ShipPose = { ...still };
    let body: EvaFreeState = { x: 20, y: 0, vx: 0, vy: 0, heading: 0 };
    for (let i = 0; i < 200; i++) {
      ship = {
        ...ship,
        vy: ship.vy + 20 * 0.05,
        y: ship.y + ship.vy * 0.05,
      };
      const ref = evaReference(
        [{ id: "s", pose: ship, radiusM: 8 }],
        [body.x, body.y],
      );
      body = stepEvaFree(
        body,
        { forward: 0, strafe: 0, turn: 0 },
        ref?.velocity ?? [body.vx, body.vy],
      );
    }
    expect(ship.y - body.y).toBeGreaterThan(EVA.captureM);
    expect(
      evaReference([{ id: "s", pose: ship, radiusM: 8 }], [body.x, body.y]),
    ).toBeUndefined();
  });

  it("captures the nearest ship within the capture radius", () => {
    const a = { id: "a", pose: { ...still, x: 50 }, radiusM: 8 };
    const b = { id: "b", pose: { ...still, x: -30, vx: 2 }, radiusM: 8 };
    expect(evaReference([a, b], [0, 0])?.shipId).toBe("b");
    expect(evaReference([a, b], [0, 0])?.velocity).toEqual([2, 0]);
    expect(evaReference([a], [200, 0])).toBeUndefined();
  });
});

describe("maglock", () => {
  it("attaches on the hull and just outside it, never far away", () => {
    const on = toShip([4, 3.5]);
    expect(maglockPoint(model, on)).toEqual(on);
    const lock = model.airlocks[0];
    const near: [number, number] = [lock.hatch[0] + 0.3, lock.hatch[1]];
    const snapped = maglockPoint(model, near)!;
    expect(snapped).toBeDefined();
    expect(hullWalkable(model, snapped)).toBe(true);
    expect(maglockPoint(model, [lock.hatch[0] + 3, lock.hatch[1]])).toBe(
      undefined,
    );
  });

  it("walks on the hull and stops at the edge", () => {
    let p = toShip([4, 3.5]);
    for (let i = 0; i < 20; i++) p = stepMaglockWalk(model, p, [0, 1]);
    // 20 ticks at 1.4 m/s = 1.4 m
    expect(p[1] - toShip([4, 3.5])[1]).toBeCloseTo(1.4, 6);
    for (let i = 0; i < 400; i++) p = stepMaglockWalk(model, p, [1, 0]);
    expect(hullWalkable(model, p)).toBe(true);
    const stuck = stepMaglockWalk(model, p, [1, 0]);
    expect(stuck).toEqual(p);
  });

  it("lets a body held at the hatch step only onto the hull", () => {
    const lock = model.airlocks[0];
    const out = stepMaglockWalk(model, lock.outside, [1, 0]);
    expect(out).toEqual(lock.outside);
    let p: [number, number] = [lock.outside[0], lock.outside[1]];
    for (let i = 0; i < 40; i++) p = stepMaglockWalk(model, p, [-1, 0]);
    // cannot cross the gap from the outside point: the first step must already be walkable
    expect(p).toEqual(lock.outside);
  });
});
