import assert from "node:assert/strict";
import type { DbConnection } from "../packages/net/src/generated";
import { prefabById } from "../packages/content/src/prefabs/index";
import { defaultPrefabComponentCatalog } from "../packages/content/src/ship-prefab-catalog";
import { prefabFlightModel } from "../packages/sim/src/prefab-flight";
import { prefabPilotPose } from "../packages/sim/src/construction-pilot";
import { prefabWalkRoute } from "../packages/sim/src/prefab-construction";
import { traversalWait as wait } from "./traversal-smoke";

/** The starter ship the standard smoke configures (the owner-picked Wren). */
export const STARTER_PREFAB_ID = "fed.s.wren";
export const STARTER_PREFAB = prefabById(STARTER_PREFAB_ID)!;
export const STARTER_CATALOG = defaultPrefabComponentCatalog();
export const STARTER_FLIGHT_MODEL = prefabFlightModel(
  STARTER_PREFAB,
  STARTER_CATALOG,
);
/** Derived pilot seat and approach, ship-local metres. */
export const STARTER_PILOT_POSE = prefabPilotPose(
  STARTER_FLIGHT_MODEL.station!,
);

// Each socket owns one monotonic lease sequence across walking and flight probes.
export const intentSequences = new WeakMap<DbConnection, bigint>();
export const nextSequence = (c: DbConnection) => {
  const next = (intentSequences.get(c) ?? 0n) + 1n;
  intentSequences.set(c, next);
  return next;
};
export async function walkNative(c: DbConnection, x: number, y: number) {
  const end = Date.now() + 15000;
  try {
    while (Date.now() < end) {
      const a = [...c.db.ownCharacters.iter()][0]!;
      const dx = x - a.localX,
        dy = y - a.localY;
      if (Math.hypot(dx, dy) < 0.07) return;
      const scale = Math.max(1, Math.hypot(dx, dy));
      await c.reducers.setIntent({
        sequence: nextSequence(c),
        throttle: 0,
        turn: 0,
        dx: dx / scale,
        dy: dy / scale,
        sprint: false,
      });
      await new Promise((r) => setTimeout(r, 60));
    }
    const a = [...c.db.ownCharacters.iter()][0]!;
    throw Error(
      `Native walk blocked at ${a.localX},${a.localY} toward ${x},${y}`,
    );
  } finally {
    await c.reducers.setIntent({
      sequence: nextSequence(c),
      throttle: 0,
      turn: 0,
      dx: 0,
      dy: 0,
      sprint: false,
    });
  }
}
/** Walk the starter ship's door-aware route from here to a ship-local point. */
export async function walkStarterTo(
  c: DbConnection,
  to: readonly [number, number],
) {
  const a = [...c.db.ownCharacters.iter()][0]!;
  for (const [x, y] of prefabWalkRoute(
    STARTER_PREFAB,
    STARTER_CATALOG,
    [a.localX, a.localY],
    [to[0], to[1]],
  ))
    await walkNative(c, x, y);
}
export async function enterNativePilot(c: DbConnection) {
  await walkStarterTo(c, STARTER_PILOT_POSE.approach);
  await acquireNativePilot(c);
}
export async function acquireNativePilot(c: DbConnection) {
  const f = [...c.db.ownAuthoredFlights.iter()][0]!;
  assert(
    f?.active && f.flightAdmitted,
    "starter ship has accepted active flight admission",
  );
  await c.reducers.enterAuthoredPilot({
    stationId: f.stationId,
    expectedStationRevision: f.stationRevision,
    operationId: crypto.randomUUID(),
  });
  await wait(
    () => [...c.db.ownAuthoredFlights.iter()][0]?.seatState === "seated",
    "native pilot entry",
  );
}
export async function leaveNativePilot(c: DbConnection) {
  await c.reducers.leaveAuthoredPilot({});
  await wait(
    () => [...c.db.ownAuthoredFlights.iter()][0]?.seatState === "none",
    "native pilot supported exit",
  );
}
