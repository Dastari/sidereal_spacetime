import assert from "node:assert/strict";
import type { DbConnection } from "../packages/net/src/generated";
import { QUALIFIED_PILOT_APPROACH } from "../packages/sim/src/construction-pilot";
import { traversalWait as wait } from "./traversal-smoke";
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
export async function enterNativePilot(c: DbConnection, fromSpawn = false) {
  if (fromSpawn) {
    for (const [x, y] of [
      [-2, -1.5],
      [0, -1.5],
      [0, 7],
    ])
      await walkNative(c, x!, y!);
  }
  await walkNative(c, ...QUALIFIED_PILOT_APPROACH);
  await acquireNativePilot(c);
}
export async function acquireNativePilot(c: DbConnection) {
  const f = [...c.db.ownAuthoredFlights.iter()][0]!;
  assert(
    f?.active && f.flightAdmitted,
    "native starter has accepted active flight admission",
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
