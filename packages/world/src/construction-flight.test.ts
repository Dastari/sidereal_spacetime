import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { WAYFARER_CONVERSION_PIN as PIN } from "../../content/src/wayfarer-conversion-candidate";
import {
  createWayfarerConversionCandidate,
  type WayfarerPinnedInputs,
} from "../../sim/src/wayfarer-conversion-candidate";
import { qualifiedWayfarerWalkingBindings } from "../../sim/src/wayfarer-walking-bindings";
import { planConstructionInstance } from "../../sim/src/construction-instance";
import {
  installConstructionFlight,
  type ConstructionFlightRepository,
  type ConstructionFlightReceipt,
} from "./construction-flight";
import type { ConstructionFlightPlan } from "../../sim/src/construction-flight";
const snapshot = createWayfarerConversionCandidate(
  Object.fromEntries(
    Object.keys(PIN.sources).map((p) => [p, readFileSync(p, "utf8")]),
  ) as WayfarerPinnedInputs,
).snapshot;
function fixture() {
  let n = 0,
    allowed = true,
    live = true,
    writeCount = 0,
    failAt = "";
  const uuid = () =>
    `00000000-0000-4000-8000-${(++n).toString(16).padStart(12, "0")}`;
  const p = planConstructionInstance(
    snapshot,
    {
      blueprintRevisionId: "qualified",
      expectedBlueprintSha256: snapshot.sha256,
      sourceDeckId: PIN.deckId,
      bodyRadiusM: 0.3,
      bodyHeightM: 1.8,
      perimeterHalfWidthM: 0,
      partitionHalfWidthM: 0,
      objectCollisionBindings: qualifiedWayfarerWalkingBindings(
        snapshot,
        0.3,
        1.8,
      ),
    },
    uuid,
  );
  const instance = {
    id: p.instanceId,
    revision: 1n,
    blueprintSha256: p.blueprintSha256,
    documentJson: JSON.stringify(p.document),
    idMapJson: JSON.stringify(p.mappings),
    spawnDeckId: p.spawn.deckId,
    name: p.document.layout.name,
  };
  const data = {
    oldShip: { id: "old", revision: 7n },
    actor: { shipId: "old" },
    cargo: { id: "cargo", itemId: "pistol" },
    rows: new Map<string, ConstructionFlightPlan>(),
    receipts: new Map<string, ConstructionFlightReceipt>(),
  };
  const insert = (kind: string, plan: ConstructionFlightPlan) => {
    if (kind === failAt) throw Error("storage fault");
    data.rows.set(kind, plan);
    writeCount++;
  };
  const db: ConstructionFlightRepository = {
    principalId: "owner",
    requireLiveGame: () => {
      if (!live) throw Error("live");
    },
    accessibleInstance: (id) =>
      allowed && id === instance.id ? instance : undefined,
    receipt: (id) => data.receipts.get(id),
    existingBinding: () => data.rows.get("binding"),
    shipExists: () => data.rows.has("ship"),
    reserveServerBerth: () => ({
      systemId: "system",
      x: 100,
      y: 0,
      serverTick: 10n,
    }),
    allocateUuid: uuid,
    identityExists: () => false,
    insertShip: (p) => insert("ship", p),
    insertMotion: (p) => insert("motion", p),
    insertStation: (p) => insert("station", p),
    insertFittings: (p) => insert("fittings", p),
    insertBinding: (p) => insert("binding", p),
    insertReceipt: (r) => {
      data.receipts.set(r.id, r);
      writeCount++;
    },
  };
  const request = {
    instanceId: instance.id,
    expectedInstanceRevision: 1n,
    operationId: "operation",
  };
  return {
    db,
    data,
    instance,
    request,
    writes: () => writeCount,
    setAccess: (x: boolean) => (allowed = x),
    setLive: (x: boolean) => (live = x),
    setFailure: (x: string) => (failAt = x),
  };
}
test("bridge installs all independent flight records, leaves old ships/actors/cargo untouched", () => {
  const f = fixture(),
    before = structuredClone([f.data.oldShip, f.data.actor, f.data.cargo]);
  const result = installConstructionFlight(f.db, f.request);
  expect(f.writes()).toBe(6);
  expect(result.shipId).toBe(f.instance.id);
  expect([...f.data.rows.keys()]).toEqual([
    "ship",
    "motion",
    "station",
    "fittings",
    "binding",
  ]);
  expect([f.data.oldShip, f.data.actor, f.data.cargo]).toEqual(before);
  expect(f.data.rows.get("station")!.station.occupantId).toBeUndefined();
  expect(f.data.rows.get("fittings")!.actuators).toHaveLength(9);
});
test("exact retry makes zero writes; changed operation payload and second installation fail", () => {
  const f = fixture(),
    result = installConstructionFlight(f.db, f.request);
  expect(installConstructionFlight(f.db, f.request)).toEqual(result);
  expect(f.writes()).toBe(6);
  expect(() =>
    installConstructionFlight(f.db, {
      ...f.request,
      expectedInstanceRevision: 2n,
    }),
  ).toThrow("different payload");
  expect(() =>
    installConstructionFlight(f.db, { ...f.request, operationId: "second" }),
  ).toThrow("already installed");
});
test("current authority gates precede receipts; stale revisions and foreign IDs cannot install", () => {
  const f = fixture();
  expect(() =>
    installConstructionFlight(f.db, {
      ...f.request,
      expectedInstanceRevision: 2n,
    }),
  ).toThrow("revision");
  expect(f.writes()).toBe(0);
  expect(() =>
    installConstructionFlight(f.db, { ...f.request, instanceId: "foreign" }),
  ).toThrow("Accessible");
  installConstructionFlight(f.db, f.request);
  f.setAccess(false);
  expect(() => installConstructionFlight(f.db, f.request)).toThrow(
    "Accessible",
  );
  f.setAccess(true);
  f.setLive(false);
  expect(() => installConstructionFlight(f.db, f.request)).toThrow("live");
});
test("failed enclosing transaction restores all staged rows; adapter never swallows partial writes", () => {
  const f = fixture();
  f.setFailure("binding");
  // Explicit emulator of the SpacetimeDB reducer transaction, not fake isolation
  // inside the adapter. A real isolated module proof remains required.
  const saved = structuredClone(f.data);
  expect(() => {
    try {
      installConstructionFlight(f.db, f.request);
    } catch (e) {
      Object.assign(f.data, saved);
      throw e;
    }
  }).toThrow("storage fault");
  expect(f.data.rows.size).toBe(0);
  expect(f.data.receipts.size).toBe(0);
});
test("all preflight rejects finish before payload writes", () => {
  const f = fixture();
  f.db.identityExists = () => true;
  expect(() => installConstructionFlight(f.db, f.request)).toThrow(
    "already allocated",
  );
  expect(f.writes()).toBe(0);
  f.db.identityExists = () => false;
  f.db.reserveServerBerth = () => {
    throw Error("no berth");
  };
  expect(() => installConstructionFlight(f.db, f.request)).toThrow("no berth");
  expect(f.writes()).toBe(0);
});
