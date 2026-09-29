/** EVA milestone 2 smoke steps (wiki `Systems/EVA`, `Systems/Ship Logic`), run by
 * scripts/prefab-smoke.ts against the isolated prefab smoke module over real websockets:
 * press the inside airlock button, wait out the interlocked cycle, walk out through the open hatch
 * on the same plane, jetpack and ride along, push into the hull (solid from outside), seal the lock
 * with the outside button, call it back, float in through the hatch and cycle back to pressure.
 * Every position and door state is the server's; the smoke only sends intent and presses. */
import assert from "node:assert/strict";
import { nextSequence, walkNative } from "./native-starter-smoke";
import { prefabWalkRoute } from "../packages/sim/src/prefab-construction";
import {
  EVA,
  doorwayCoords,
  pointVelocity,
  prefabEvaModel,
} from "../packages/sim/src/eva";
import { shipLogicModel } from "../packages/sim/src/ship-logic-model";
import type {
  PrefabComponentCatalog,
  ShipPrefabDocumentV1,
} from "../packages/content/src/ship-prefab";

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function wait(fn: () => boolean, label: string, ms = 15000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (fn()) return;
    await pause(25);
  }
  throw Error("Timeout: " + label);
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export async function evaSmoke(
  s: any,
  shipId: string,
  prefab: ShipPrefabDocumentV1,
  catalog: PrefabComponentCatalog,
) {
  const model = prefabEvaModel(prefab, catalog);
  const logic = shipLogicModel(prefab, catalog);
  const lock = model.entries[0];
  assert(lock && logic, "the prefab has an exterior hatch and ship logic");
  const panel = (id: string) => {
    const p = logic.panels.find((x) => x.deviceId === id);
    assert(p, `panel ${id}`);
    return p;
  };
  const actor = () => [...s.db.ownCharacters.iter()][0] as any;
  const body = () => [...s.db.ownEvaBody.iter()][0] as any;
  const location = () => [...s.db.ownConstructionLocation.iter()][0] as any;
  const device = (id: string) =>
    [...s.db.visibleShipLogic.iter()].find(
      (r: any) => r.shipId === shipId && r.deviceId === id,
    ) as any;
  const vitals = () => [...s.db.ownCharacterVitals.iter()][0] as any;
  const motion = () => {
    const ship = [...s.db.ownShips.iter()].find(
      (r: any) => r.id === shipId,
    ) as any;
    return {
      x: ship.x,
      y: ship.y,
      vx: ship.vx,
      vy: ship.vy,
      heading: ship.heading,
      omega: Number(ship.omega ?? 0),
    };
  };
  const intent = (v: { dx?: number; dy?: number }) =>
    s.reducers.setIntent({
      sequence: nextSequence(s),
      throttle: 0,
      turn: 0,
      dx: 0,
      dy: 0,
      sprint: false,
      ...v,
    });
  const hold = async (ms: number, v: { dx?: number; dy?: number }) => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      await intent(v);
      await pause(50);
    }
    await intent({});
  };
  const localOf = () => [body().localX, body().localY] as [number, number];
  /** Speed relative to the ship: its frame while riding along (the ship's rotation is
   * presentation only), else the hull point under the body. */
  const relative = () => {
    const m = motion();
    const v =
      body().phase === "local"
        ? [m.vx, m.vy]
        : pointVelocity(m, [body().x, body().y]);
    return Math.hypot(body().vx - v[0], body().vy - v[1]);
  };
  /** Closed-loop jetpack flight to a ship-local point (server pose only). */
  const flyTo = async (target: readonly [number, number], label: string) => {
    const end = Date.now() + 20000;
    while (Date.now() < end) {
      if (!body()) return;
      const [x, y] = localOf();
      const d = [target[0] - x, target[1] - y];
      const dist = Math.hypot(d[0], d[1]);
      if (dist < 0.15 && relative() < 0.3) break;
      const gain = Math.min(1, dist * 0.6);
      await intent({
        dx: (d[0] / (dist || 1)) * gain,
        dy: (d[1] / (dist || 1)) * gain,
      });
      await pause(50);
    }
    await intent({});
    if (body()) await wait(() => relative() < 0.3, `${label}: settled`, 8000);
  };
  const press = async (id: string) =>
    s.reducers.pressShipButton({ shipId, deviceId: id });
  const plus = (p: readonly number[], n: readonly number[], d: number) =>
    [p[0] + n[0] * d, p[1] + n[1] * d] as [number, number];

  await s.reducers.claimInputControl({});
  const massAboard = [...s.db.ownAuthoredFlightPhysics.iter()].find(
    (p: any) => p.shipId === shipId,
  ) as any;
  await wait(() => !!device("lock"), "ship logic visible", 5000);
  assert.equal(device("lock").state, "pressurised");
  assert.equal(device("door-outer").open, false, "hatch starts shut");
  assert.equal(device("door-inner").open, true, "hold door starts open");

  // 0. Vacuum needs the EVA suit: without it the inside button refuses to depressurise.
  for (const [x, y] of prefabWalkRoute(
    prefab,
    catalog,
    [actor().localX, actor().localY],
    panel("btn-lock-in").front,
  ))
    await walkNative(s, x, y);
  const refusal = await press("btn-lock-in").then(
    () => "",
    (e: unknown) => String(e),
  );
  assert.match(refusal, /EVA needs a pressure suit, helmet and EVA jetpack/);
  assert.equal(device("lock").state, "pressurised", "no cycle without a suit");
  // Smoke-only: wear the EVA suit (production stocks it with `ship_cargo.py --kit eva-suit` and the
  // player equips it from the crate).
  await s.reducers.wearPrefabSmokeEvaSuit({});
  await wait(
    () =>
      [...s.db.ownInventoryItems.iter()].filter(
        (i: any) => /^wardrobe-suit-/.test(i.definitionId) && i.equipmentSlot,
      ).length === 4,
    "EVA suit worn",
    5000,
  );

  // 1. Walk to the inside button and press it: interlocked 3 s cycle, then the hatch opens.
  for (const [x, y] of prefabWalkRoute(
    prefab,
    catalog,
    [actor().localX, actor().localY],
    panel("btn-lock-in").front,
  ))
    await walkNative(s, x, y);
  const started = Date.now();
  await press("btn-lock-in");
  await wait(() => device("lock")?.state === "depressurising", "cycling", 3000);
  assert.equal(device("door-inner").open, false, "inner door sealed first");
  assert.equal(device("door-outer").open, false, "interlock: outer still shut");
  await wait(() => device("door-outer")?.open, "hatch open", 10000);
  const cycleMs = Date.now() - started;
  assert(cycleMs >= 2800, `the cycle takes about 3 s (${cycleMs} ms)`);
  assert.equal(device("lock").state, "vacuum");
  assert.equal(device("btn-lock-out").light, "red");

  // 2. Walk out through the open hatch: the hand-off keeps the ship-local point.
  const inLane = plus(lock.hatch, lock.normal, -EVA.entryDepthM - 0.05);
  await walkNative(s, inLane[0], inLane[1]);
  const lastDeck: [number, number] = [actor().localX, actor().localY];
  const outEnd = Date.now() + 8000;
  while (!body() && Date.now() < outEnd) {
    await intent({ dx: lock.normal[0], dy: lock.normal[1] });
    await pause(50);
  }
  assert(body(), "stepped outside");
  await intent({});
  const handoffGap = Math.hypot(
    body().localX - lastDeck[0],
    body().localY - lastDeck[1],
  );
  assert(
    handoffGap < 0.35,
    `continuous hand-off at the doorway (${handoffGap} m)`,
  );
  assert.equal(body().phase, "local");
  assert.equal(body().anchorShipId, shipId);
  await wait(() => !location(), "no aboard location while outside", 5000);
  let massDrop = 0;
  if (massAboard?.status === "ready")
    await wait(
      () => {
        const now = [...s.db.ownAuthoredFlightPhysics.iter()].find(
          (p: any) => p.shipId === shipId,
        ) as any;
        massDrop = massAboard.massKg - (now?.massKg ?? massAboard.massKg);
        return massDrop > 50;
      },
      "ship mass without the spacewalker",
      10000,
    );

  // 3. Jetpack out, then ride along at rest in the ship's frame.
  const out0 = localOf();
  await hold(1000, { dx: lock.normal[0], dy: lock.normal[1] });
  const out1 = localOf();
  const outward =
    (out1[0] - out0[0]) * lock.normal[0] + (out1[1] - out0[1]) * lock.normal[1];
  assert(outward > 1, `thrust moved the body outward (${outward} m)`);
  // The stabiliser brings it to rest relative to the ship (1.2 s time constant, then held).
  await pause(7000);
  const rest0 = localOf();
  await pause(1000);
  const rest1 = localOf();
  const drift = Math.hypot(rest1[0] - rest0[0], rest1[1] - rest0[1]);
  const restSpeed = relative();
  if (drift >= 0.02)
    console.log(
      JSON.stringify(
        { rideAlongDebug: { body: body(), ship: motion(), rest0, rest1 } },
        (_, v) => (typeof v === "bigint" ? v.toString() : v),
      ),
    );
  assert(
    drift < 0.02,
    `rides along at rest in the ship frame (${drift} m in 1 s)`,
  );
  assert(restSpeed < 0.3, `moves with the hull (${restSpeed} m/s relative)`);

  // 4. The hull is solid from outside: push into the wall beside the hatch.
  // Toward the bow (ship +y): the straight hull face, clear of the starboard wing.
  const fore =
    lock.along[1] >= 0 ? lock.along : [-lock.along[0], -lock.along[1]];
  const beside = plus(plus(lock.hatch, fore, 2.5), lock.normal, 1.2);
  await flyTo(beside, "beside the hatch");
  const hpBefore = vitals()?.health ?? 100;
  await hold(2000, { dx: -lock.normal[0], dy: -lock.normal[1] });
  const pushed = doorwayCoords(lock, localOf());
  assert(
    pushed.depth <= -EVA.bodyRadiusM + 0.05,
    `stopped at the hull, never inside (depth ${pushed.depth} m)`,
  );
  const hullDamage = hpBefore - (vitals()?.health ?? 100);
  assert(
    hullDamage <= 12,
    `low-speed contact does little or no damage (${hullDamage})`,
  );

  // 5. Seal the lock from outside, then call it back (the outside button cycles).
  await flyTo(panel("btn-lock-out").front, "outside button");
  await press("btn-lock-out");
  await wait(
    () => device("lock")?.state === "pressurised",
    "sealed behind me",
    10000,
  );
  assert.equal(device("door-outer").open, false);
  assert.equal(device("door-inner").open, true);
  // A shut hatch is hull: pushing at it keeps the body outside.
  await flyTo(plus(lock.hatch, lock.normal, 1), "at the shut hatch");
  await hold(1500, { dx: -lock.normal[0], dy: -lock.normal[1] });
  assert(body(), "still outside a shut hatch");
  assert(doorwayCoords(lock, localOf()).depth <= -EVA.bodyRadiusM + 0.05);
  await flyTo(panel("btn-lock-out").front, "outside button again");
  await press("btn-lock-out");
  await wait(() => device("door-outer")?.open, "hatch called open", 10000);

  // 6. Float back in through the hatch: aboard at the doorway, same point.
  await flyTo(plus(lock.hatch, lock.normal, 0.8), "in front of the hatch");
  const inEnd = Date.now() + 8000;
  let lastOutside: [number, number] = localOf();
  while (body() && Date.now() < inEnd) {
    lastOutside = localOf();
    await intent({ dx: -lock.normal[0] * 0.6, dy: -lock.normal[1] * 0.6 });
    await pause(50);
  }
  await intent({});
  await wait(() => !body() && !!location(), "aboard again", 5000);
  const entry = doorwayCoords(lock, [actor().localX, actor().localY]);
  assert(
    entry.depth >= EVA.entryDepthM - 0.01 && entry.depth < 1.2,
    `stepped aboard in the doorway (depth ${entry.depth} m)`,
  );
  const entryGap = Math.hypot(
    actor().localX - lastOutside[0],
    actor().localY - lastOutside[1],
  );

  // 7. Cycle back to pressure from inside.
  for (const [x, y] of prefabWalkRoute(
    prefab,
    catalog,
    [actor().localX, actor().localY],
    panel("btn-lock-in").front,
  ))
    await walkNative(s, x, y);
  await press("btn-lock-in");
  await wait(
    () => device("lock")?.state === "pressurised",
    "pressurised",
    10000,
  );
  assert.equal(device("door-outer").open, false);
  assert.equal(device("door-inner").open, true);
  await s.reducers.releaseInputControl({});
  return {
    hatch: lock.id,
    shipSpeed: Math.hypot(motion().vx, motion().vy),
    shipOmega: motion().omega,
    cycleOutMs: cycleMs,
    handoffGapM: handoffGap,
    massDropKg: massDrop,
    thrustOutwardM: outward,
    rideAlongDriftM: drift,
    restRelativeSpeed: restSpeed,
    hullPushDepthM: pushed.depth,
    hullContactDamage: hullDamage,
    entryDepthM: entry.depth,
    entryGapM: entryGap,
  };
}
