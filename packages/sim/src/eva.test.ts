import { describe, expect, it } from "vitest";
import { PREFAB_SHIPS } from "@sidereal/content/prefabs";
import { defaultPrefabComponentCatalog } from "@sidereal/content/ship-prefab-catalog";
import {
  EVA,
  doorwayCoords,
  evaBodyBlocked,
  evaCaptureShip,
  evaEntryThrough,
  evaExitThrough,
  evaImpactDamage,
  evaPushOut,
  evaReleaseReason,
  evaWorldContact,
  localToWorld,
  maglockBootsActive,
  pointVelocity,
  prefabEvaModel,
  shipToWorld,
  stepEvaFree,
  stepEvaLocal,
  worldToLocal,
  worldToShip,
  type EvaLocalState,
  type ShipPose,
} from "./eva";
import { prefabToShipMetres } from "./prefab-construction";

const catalog = defaultPrefabComponentCatalog();
const wren = PREFAB_SHIPS.find((p) => p.id === "fed.s.wren")!;
const model = prefabEvaModel(wren, catalog);
const toShip = prefabToShipMetres(wren);
const hatch = model.entries[0];
const OPEN = new Set(["airlock"]);
const SHUT = new Set<string>();

function drift(
  s: EvaLocalState,
  input: { dx: number; dy: number },
  ticks: number,
  open = OPEN,
) {
  let impact = 0;
  for (let i = 0; i < ticks; i++) {
    const r = stepEvaLocal(model, s, input, open);
    s = r.state;
    impact = Math.max(impact, r.impactSpeed);
  }
  return { s, impact };
}
/** A body just outside the hatch, at rest relative to the hull. */
const outsideHatch = (d = 1): EvaLocalState => ({
  x: hatch.hatch[0] + hatch.normal[0] * d,
  y: hatch.hatch[1] + hatch.normal[1] * d,
  vx: 0,
  vy: 0,
  heading: 0,
});

describe("EVA ship model (same plane)", () => {
  it("derives Wren's starboard hatch as its one exterior entry", () => {
    expect(model.entries.map((e) => e.id)).toEqual(["airlock"]);
    expect(hatch.airlock).toBe(true);
    const c = toShip([6, 0]);
    expect(hatch.hatch[0]).toBeCloseTo(c[0], 9);
    expect(hatch.hatch[1]).toBeCloseTo(c[1], 9);
    expect(hatch.normal).toEqual([1, 0]);
    expect(Math.abs(hatch.along[1])).toBe(1);
    expect(hatch.room).toBe("hold");
  });

  it("the hull is solid from both sides; an open hatch is the only lane through", () => {
    const deckPoint = toShip([6, 1]); // inside the hold
    const outside: [number, number] = [hatch.hatch[0] + 1, hatch.hatch[1]];
    const wall = toShip([4.5, 0]); // starboard hull line away from the hatch
    expect(evaBodyBlocked(model, deckPoint, OPEN)).toBe(true);
    expect(evaBodyBlocked(model, outside, SHUT)).toBe(false);
    // The doorway lane is open only while the hatch is open.
    const inLane: [number, number] = [hatch.hatch[0] - 0.3, hatch.hatch[1]];
    expect(evaBodyBlocked(model, inLane, OPEN)).toBe(false);
    expect(evaBodyBlocked(model, inLane, SHUT)).toBe(true);
    // Beside the hatch the wall stays solid even with the hatch open.
    expect(evaBodyBlocked(model, [wall[0] - 0.1, wall[1]], OPEN)).toBe(true);
  });
});

describe("hull collision from outside (ship frame)", () => {
  it("floating into a shut hatch stops at the hull; slow contact does no damage", () => {
    const { s, impact } = drift(outsideHatch(2), { dx: -1, dy: 0 }, 60, SHUT);
    const c = doorwayCoords(hatch, [s.x, s.y]);
    expect(c.depth).toBeLessThan(-EVA.bodyRadiusM + 0.05);
    expect(c.depth).toBeGreaterThan(-EVA.bodyRadiusM - 0.2);
    expect(impact).toBeLessThanOrEqual(EVA.speedCap + 1e-9);
    expect(evaImpactDamage(impact)).toBeLessThanOrEqual(
      Math.round((EVA.speedCap - EVA.impactSafeSpeed) * EVA.impactDamagePerMs),
    );
    expect(evaImpactDamage(2)).toBe(0);
  });

  it("an open hatch lets the body float in and reach the entry depth", () => {
    let s = outsideHatch(1.5);
    let entered = false;
    for (let i = 0; i < 80 && !entered; i++) {
      s = stepEvaLocal(model, s, { dx: -1, dy: 0 }, OPEN).state;
      entered = !!evaEntryThrough(model, [s.x, s.y], OPEN);
    }
    expect(entered).toBe(true);
    expect(evaEntryThrough(model, [s.x, s.y], SHUT)).toBeUndefined();
  });

  it("slides along the hull instead of sticking", () => {
    const start = outsideHatch(EVA.bodyRadiusM + 0.02);
    const { s } = drift({ ...start, y: start.y + 2 }, { dx: -0.7, dy: -0.7 }, 20, SHUT);
    expect(s.y).toBeLessThan(start.y + 2 - 0.3);
  });

  it("pushes a body that starts inside the hull (legacy roof position) out without damage", () => {
    const roof = toShip([6, 3.5]);
    const r = stepEvaLocal(model, { x: roof[0], y: roof[1], vx: 0, vy: 0, heading: 0 }, { dx: 0, dy: 0 }, SHUT);
    expect(evaBodyBlocked(model, [r.state.x, r.state.y], SHUT)).toBe(false);
    expect(r.impactSpeed).toBe(0);
  });
});

describe("doorway hand-off (deck frame ↔ outside, same point)", () => {
  const atLine: [number, number] = [
    hatch.hatch[0] - hatch.normal[0] * 0.3,
    hatch.hatch[1] - hatch.normal[1] * 0.3,
  ];
  it("a walker at an open hatch pushing out steps outside; shut or walking along: no", () => {
    expect(evaExitThrough(model, atLine, hatch.normal, OPEN)?.id).toBe("airlock");
    expect(evaExitThrough(model, atLine, hatch.normal, SHUT)).toBeUndefined();
    expect(evaExitThrough(model, atLine, hatch.along, OPEN)).toBeUndefined();
    const deeper: [number, number] = [atLine[0] - 0.5, atLine[1]];
    expect(evaExitThrough(model, deeper, hatch.normal, OPEN)).toBeUndefined();
  });
  it("the exit point is free space for the EVA body, and entry needs to go deeper (hysteresis)", () => {
    expect(evaBodyBlocked(model, atLine, OPEN)).toBe(false);
    expect(evaEntryThrough(model, atLine, OPEN)).toBeUndefined();
    expect(EVA.entryDepthM).toBeGreaterThan(EVA.exitDepthM);
  });
});

describe("frames: ride-along bubble and drop-off", () => {
  const moving: ShipPose = { x: 100, y: -40, vx: 30, vy: 12, heading: 0.7, omega: 0 };
  it("local ↔ world round trip keeps the relative state", () => {
    const s: EvaLocalState = { x: 9, y: -2, vx: 0.4, vy: -0.2, heading: 0.3 };
    const w = localToWorld(moving, s);
    const back = worldToLocal(moving, w);
    expect(back.x).toBeCloseTo(s.x, 9);
    expect(back.y).toBeCloseTo(s.y, 9);
    expect(back.vx).toBeCloseTo(s.vx, 9);
    expect(back.vy).toBeCloseTo(s.vy, 9);
    expect(back.heading).toBeCloseTo(s.heading, 9);
  });

  it("a body at rest in the bubble rides with a moving, turning ship (no input, no drift)", () => {
    let s = outsideHatch(3);
    for (let i = 0; i < 100; i++) s = stepEvaLocal(model, s, { dx: 0, dy: 0 }, SHUT).state;
    expect(Math.hypot(s.vx, s.vy)).toBe(0);
    const turning: ShipPose = { ...moving, omega: 0.3 };
    const w = localToWorld(turning, s);
    // Its world velocity is exactly the hull's point velocity: it rides along.
    const pv = pointVelocity(turning, [w.x, w.y]);
    expect(w.vx).toBeCloseTo(pv[0], 9);
    expect(w.vy).toBeCloseTo(pv[1], 9);
  });

  it("captures a slow body inside the bubble, not a fast or distant one", () => {
    const ship = { id: "s", pose: moving, radiusM: model.radiusM };
    const near = shipToWorld(moving, [model.radiusM + 10, 0]);
    const pv = pointVelocity(moving, near);
    expect(evaCaptureShip([ship], { x: near[0], y: near[1], vx: pv[0] + 2, vy: pv[1], heading: 0 })).toBe("s");
    expect(evaCaptureShip([ship], { x: near[0], y: near[1], vx: pv[0] + 20, vy: pv[1], heading: 0 })).toBeUndefined();
    const far = shipToWorld(moving, [model.radiusM + EVA.bubbleM + 5, 0]);
    expect(evaCaptureShip([ship], { x: far[0], y: far[1], vx: pv[0], vy: pv[1], heading: 0 })).toBeUndefined();
  });

  it("releases beyond the release radius or when the ship out-accelerates the suit (8 m/s²)", () => {
    const local: [number, number] = [8, 0];
    const pv = pointVelocity(moving, shipToWorld(moving, local));
    expect(evaReleaseReason(moving, model.radiusM, local, pv)).toBeUndefined();
    // 5 m/s² along x: the suit follows.
    const gentle: [number, number] = [pv[0] - 5 * EVA.tickSeconds, pv[1]];
    expect(evaReleaseReason(moving, model.radiusM, local, gentle)).toBeUndefined();
    // 12 m/s²: left behind.
    const hard: [number, number] = [pv[0] - 12 * EVA.tickSeconds, pv[1]];
    expect(evaReleaseReason(moving, model.radiusM, local, hard)).toBe("outpaced");
    expect(
      evaReleaseReason(moving, model.radiusM, [model.radiusM + EVA.releaseM + 1, 0], pv),
    ).toBe("far");
  });

  it("jetpacking clear: full thrust reaches the speed cap relative to the reference", () => {
    let s = { x: 0, y: 0, vx: 3, vy: 0, heading: 0 };
    for (let i = 0; i < 200; i++) s = stepEvaFree(s, { dx: 0, dy: 1 }, [3, 0]);
    expect(s.vx).toBeCloseTo(3, 3);
    expect(s.vy).toBeCloseTo(EVA.speedCap, 2);
    // It turned to face the thrust.
    expect(Math.abs(s.heading)).toBeLessThan(1e-6);
  });
});

describe("ship impacts in world space (leeway, then damage)", () => {
  const still: ShipPose = { x: 0, y: 0, vx: 0, vy: 0, heading: 0, omega: 0 };
  const wall = toShip([4.5, 0]);
  it("a ship moving slowly into a body pushes it out without damage", () => {
    const pose: ShipPose = { ...still, vx: 2 };
    // The hull has moved over the body standing 0.1 m off the starboard wall.
    const body = { x: wall[0] - 0.1, y: wall[1], vx: 0, vy: 0, heading: 0 };
    const r = evaWorldContact(model, pose, body, SHUT)!;
    expect(r).toBeDefined();
    expect(evaBodyBlocked(model, worldToShip(pose, [r.body.x, r.body.y]), SHUT)).toBe(false);
    expect(r.impactSpeed).toBeCloseTo(2, 6);
    expect(evaImpactDamage(r.impactSpeed)).toBe(0);
    // After contact it moves with the hull along the normal.
    expect(r.body.vx).toBeCloseTo(2, 6);
  });
  it("a fast ship hits hard: damage scales with speed", () => {
    const body = { x: wall[0] - 0.1, y: wall[1], vx: 0, vy: 0, heading: 0 };
    const hit = (v: number) =>
      evaImpactDamage(evaWorldContact(model, { ...still, vx: v }, body, SHUT)!.impactSpeed);
    expect(hit(8)).toBeGreaterThan(0);
    expect(hit(15)).toBeGreaterThan(hit(8));
    expect(hit(15)).toBe(Math.round((15 - EVA.impactSafeSpeed) * EVA.impactDamagePerMs));
  });
  it("no contact, no push", () => {
    expect(evaWorldContact(model, still, { x: 50, y: 50, vx: 0, vy: 0, heading: 0 }, SHUT)).toBeUndefined();
    expect(evaPushOut(model, [50, 50], SHUT)).toBeUndefined();
  });
});

describe("maglock boots (space-suit boots only, inside ships only)", () => {
  it("only suit boots, only aboard, only without gravity", () => {
    expect(maglockBootsActive({ aboard: true, boots: "wardrobe-suit-boots", gravity: false })).toBe(true);
    expect(maglockBootsActive({ aboard: true, boots: "suit-boots", gravity: false })).toBe(true);
    // Outside: never (the jetpack moves you; the roof is unreachable).
    expect(maglockBootsActive({ aboard: false, boots: "wardrobe-suit-boots", gravity: false })).toBe(false);
    // Gravity on (every prefab ship today): walking is ordinary.
    expect(maglockBootsActive({ aboard: true, boots: "wardrobe-suit-boots", gravity: true })).toBe(false);
    // Clothing and armour boots are not mag boots.
    for (const boots of ["wardrobe-t1-boots", "wardrobe-t2-boots", "armor.boots.heavy", null])
      expect(maglockBootsActive({ aboard: true, boots, gravity: false })).toBe(false);
  });
});
