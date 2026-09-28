/** EVA milestone 1 smoke steps (wiki `Systems/EVA`), run by scripts/prefab-smoke.ts against the
 * isolated prefab smoke module over real websockets: walk to the exterior airlock, cycle out,
 * jetpack away and stabilise, come back over the hull, maglock, walk on the hull, detach, cycle
 * back in. Every position is the server's; the smoke only sends intent. */
import assert from "node:assert/strict";
import { nextSequence, walkNative } from "./native-starter-smoke";
import { prefabWalkRoute } from "../packages/sim/src/prefab-construction";
import {
  EVA,
  prefabEvaModel,
  shipToWorld,
  worldToShip,
} from "../packages/sim/src/eva";
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
  const lock = model.airlocks[0];
  assert(lock, "the prefab has an exterior airlock");
  const actor = () => [...s.db.ownCharacters.iter()][0] as any;
  const body = () => [...s.db.ownEvaBody.iter()][0] as any;
  const cycle = () => [...s.db.ownEvaAirlockCycle.iter()][0] as any;
  const location = () => [...s.db.ownConstructionLocation.iter()][0] as any;
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
  const intent = (v: {
    throttle?: number;
    turn?: number;
    dx?: number;
    dy?: number;
  }) =>
    s.reducers.setIntent({
      sequence: nextSequence(s),
      throttle: 0,
      turn: 0,
      dx: 0,
      dy: 0,
      sprint: false,
      ...v,
    });
  const hold = async (
    ms: number,
    v: { throttle?: number; turn?: number; dx?: number; dy?: number },
  ) => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      await intent(v);
      await pause(50);
    }
    await intent({});
  };
  const local = () => worldToShip(motion(), [body().x, body().y]);

  await s.reducers.claimInputControl({});
  const massAboard = [...s.db.ownAuthoredFlightPhysics.iter()].find(
    (p: any) => p.shipId === shipId,
  ) as any;

  // 1. Walk to the hatch and cycle out.
  for (const [x, y] of prefabWalkRoute(
    prefab,
    catalog,
    [actor().localX, actor().localY],
    lock.inside,
  ))
    await walkNative(s, x, y);
  const started = Date.now();
  await s.reducers.evaCycleAirlock({ shipId, airlockId: lock.id });
  await wait(() => cycle()?.direction === "out", "cycle out started", 5000);
  await wait(() => !!body(), "outside after the cycle", 15000);
  const cycleOutMs = Date.now() - started;
  assert(
    cycleOutMs >= Number(lock.cycleMicros / 1000n) - 200,
    `cycle takes half the component cycle (${cycleOutMs} ms)`,
  );
  await wait(() => !location(), "no aboard location while outside", 5000);
  assert.equal(body().phase, "free");
  const exit = shipToWorld(motion(), lock.outside);
  const exitGap = Math.hypot(body().x - exit[0], body().y - exit[1]);
  assert(exitGap < 0.5, `left through the hatch (${exitGap} m)`);
  assert(
    [...s.db.visibleEvaBodies.iter()].some(
      (r: any) => r.characterId === actor().id,
    ),
    "own body in visible_eva_bodies",
  );
  // The character is no longer ship mass.
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

  // 2. Jetpack out along the heading (outward), then the stabiliser brings the body to rest.
  const out0 = local();
  await hold(1000, { throttle: 1 });
  const out1 = local();
  const outward =
    (out1[0] - out0[0]) * lock.normal[0] + (out1[1] - out0[1]) * lock.normal[1];
  assert(outward > 1, `thrust moved the body outward (${outward} m)`);
  await pause(3000);
  const rest = body();
  const restSpeed = Math.hypot(rest.vx - motion().vx, rest.vy - motion().vy);
  assert(restSpeed < 0.3, `stabilised relative to the ship (${restSpeed} m/s)`);
  const heading0 = body().heading;
  await hold(400, { turn: 1 });
  await hold(400, { turn: -1 });
  assert(Math.abs(body().heading - heading0) < 0.3, "turned and turned back");

  // 3. Reverse thrust back over the hull (closed loop on the server position), then maglock.
  const target = [
    lock.hatch[0] - lock.normal[0] * 1.2,
    lock.hatch[1] - lock.normal[1] * 1.2,
  ];
  const along = () =>
    (local()[0] - target[0]) * lock.normal[0] +
    (local()[1] - target[1]) * lock.normal[1];
  const backEnd = Date.now() + 15000;
  while (along() > 0.3 && Date.now() < backEnd) {
    await intent({ throttle: along() > 2 ? -1 : -0.4 });
    await pause(50);
  }
  await intent({});
  await wait(
    () => Math.hypot(body().vx - motion().vx, body().vy - motion().vy) < 0.5,
    "slow over the hull",
    8000,
  );
  await s.reducers.evaToggleMaglock({});
  await wait(() => body()?.phase === "maglocked", "maglocked", 5000);
  assert.equal(body().anchorShipId, shipId);

  // 4. Walk on the hull (ship-local fore), then back toward the hatch.
  const hull0 = [body().localX, body().localY];
  await hold(1000, { dx: 0, dy: 1 });
  const walked = Math.hypot(body().localX - hull0[0], body().localY - hull0[1]);
  assert(
    walked > 0.8 && walked < EVA.walkSpeed * 1.6,
    `walked on the hull (${walked} m)`,
  );
  const backEnd2 = Date.now() + 8000;
  while (Date.now() < backEnd2) {
    const dx = hull0[0] - body().localX,
      dy = hull0[1] - body().localY;
    if (Math.hypot(dx, dy) < 0.1) break;
    await intent({ dx, dy });
    await pause(50);
  }
  await intent({});

  // 5. Detach, then cycle back in from free flight within reach of the hatch.
  await s.reducers.evaToggleMaglock({});
  await wait(() => body()?.phase === "free", "detached", 5000);
  await s.reducers.evaCycleAirlock({ shipId, airlockId: lock.id });
  await wait(() => cycle()?.direction === "in", "cycle in started", 5000);
  assert.equal(body().phase, "maglocked", "held at the hatch while cycling");
  await wait(() => !body() && !!location(), "aboard again", 15000);
  const entryGap = Math.hypot(
    actor().localX - lock.inside[0],
    actor().localY - lock.inside[1],
  );
  assert(entryGap < 2.3, `entered at the hatch (${entryGap} m)`);
  await s.reducers.releaseInputControl({});
  return {
    airlock: lock.id,
    cycleOutMs,
    exitGapM: exitGap,
    massDropKg: massDrop,
    thrustOutwardM: outward,
    restRelativeSpeed: restSpeed,
    hullWalkM: walked,
    entryGapM: entryGap,
  };
}
