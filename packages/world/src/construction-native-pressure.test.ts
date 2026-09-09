import { readFileSync } from "node:fs";
import { expect, test, vi } from "vitest";
import { Identity } from "spacetimedb";
vi.mock("spacetimedb/server", () => ({
  SenderError: class extends Error {},
  table: () => ({}),
  t: new Proxy(
    {},
    { get: () => () => ({ primaryKey: () => ({}), unique: () => ({}) }) },
  ),
}));
import { createNativePressureRoomDocument } from "@sidereal/sim/construction-pressure-document";
import { createNativePressureRoomCompiler } from "@sidereal/sim/construction-native-room";
import { compilePressureTopology } from "@sidereal/sim/construction-topology";
import {
  installNativePressure,
  stepNativePressure,
  ownNativePressure,
  NATIVE_PRESSURE_FLOW_POLICY,
} from "./construction-native-pressure";
import { requestDoor, stepDoors } from "./construction-doors";

const audit = new Uint8Array(
  readFileSync(
    "assets/art-library/designs/shipyard.structure.boundary-kit/revisions/r006/qualification-a007/native-room-validation.json",
  ),
);
const pins = JSON.parse(new TextDecoder().decode(audit)).sourcePins as Record<
  string,
  { path: string }
>;
const compile = createNativePressureRoomCompiler({
  audit,
  sources: Object.fromEntries(
    Object.entries(pins).map(([name, pin]) => [
      name,
      new Uint8Array(readFileSync(pin.path)),
    ]),
  ),
});
const owner = Identity.fromString("1".repeat(64)),
  other = Identity.fromString("2".repeat(64));
function table(indexes: Record<string, string> = {}, primary = "id") {
  const rows = new Map<string, any>();
  const result: any = {
    iter: () => rows.values(),
    insert: (row: any) => {
      if (rows.has(row[primary])) throw Error("duplicate");
      rows.set(row[primary], row);
    },
    [primary]: {
      find: (id: string) => rows.get(id),
      update: (row: any) => {
        if (!rows.has(row[primary])) throw Error("missing");
        rows.set(row[primary], row);
      },
    },
  };
  for (const [index, column] of Object.entries(indexes))
    result[index] = {
      filter: function* (value: any) {
        for (const row of rows.values())
          if (
            value?.isEqual ? value.isEqual(row[column]) : row[column] === value
          )
            yield row;
      },
    };
  return result;
}
function fixture() {
  const db: any = {
    wayfarerRefitAttachment: table({ by_instance: "instanceId" }),
    constructionNativePressure: table({ by_owner: "owner", by_door: "doorId" }),
    constructionAtmosphereClock: table(),
    constructionAtmosphere: table({ by_owner: "owner" }),
    constructionInstance: table({ by_owner: "owner" }),
    constructionAirlock: table({ by_owner: "owner", by_active: "active" }),
    constructionDoor: table({
      by_instance: "instanceId",
      by_deck: "deckId",
      by_moving: "moving",
    }),
    constructionLocation: table({ by_instance: "instanceId" }, "characterId"),
    character: table({ by_owner: "owner" }),
    constructionGrant: table({ by_principal: "principal" }),
    constructionReceipt: table({ by_principal: "principal" }),
  };
  const ctx: any = {
    db,
    sender: owner,
    timestamp: { microsSinceUnixEpoch: 10n },
  };
  function prepare(id = "room-a", principal = owner) {
    const built = compile({
      instanceId: id,
      deckId: id + ":deck",
      openingId: id + ":door",
      apertureFraction: 0,
      sealRetraction: 0,
      flowPolicy: NATIVE_PRESSURE_FLOW_POLICY,
    });
    const document = createNativePressureRoomDocument();
    document.layout = built.layout;
    document.floors = document.floors.map((f) => ({
      ...f,
      deckId: id + ":deck",
    }));
    db.constructionInstance.insert({
      id,
      owner: principal,
      workspaceId: "workspace",
      documentJson: JSON.stringify(document),
      revision: 1n,
    });
    db.constructionDoor.insert({
      id: id + ":door",
      instanceId: id,
      deckId: id + ":deck",
      x: 2,
      y: 0,
      quarterTurns: 1,
      fraction: 0,
      targetOpen: false,
      moving: false,
      blocked: false,
      revision: 1n,
    });
    return {
      instanceId: id,
      deckId: id + ":deck",
      doorId: id + ":door",
      actualParts: built.installation,
    };
  }
  function install(id = "room-a", principal = owner) {
    const input = prepare(id, principal);
    installNativePressure({ ...ctx, sender: principal }, input, compile);
    return input;
  }
  function tick() {
    ctx.timestamp = {
      microsSinceUnixEpoch: ctx.timestamp.microsSinceUnixEpoch + 50000n,
    };
    return stepNativePressure(ctx, compile);
  }
  return { ctx, db, prepare, install, tick };
}
const gasRows = (row: any): { compartmentId: string; moles: number }[] =>
  JSON.parse(row.gasJson);
const total = (row: any) =>
  gasRows(row).reduce((n, g) => n + g.moles, 0) +
  row.ventedMoles +
  row.removedMoles;
/** Test-only finite resource setup. No production reducer accepts this charge. */
function charge(db: any, id = "room-a") {
  const row = db.constructionAtmosphere.id.find(id),
    gas = gasRows(row);
  gas[0].moles = 100;
  db.constructionAtmosphere.id.update({
    ...row,
    gasJson: JSON.stringify(gas),
    sourceMoles: 100,
  });
}

test("native authority binds exhaustive installed parts, actual frame and owner before vacuum installation", () => {
  const f = fixture(),
    input = f.prepare();
  expect(() =>
    installNativePressure({ ...f.ctx, sender: other }, input, compile),
  ).toThrow(/owned/);
  for (const changed of [
    input.actualParts.slice(1),
    [...input.actualParts, input.actualParts[0]],
    input.actualParts.map((p, i) => (i ? p : { ...p, sha256: "0".repeat(64) })),
    input.actualParts.map((p, i) =>
      i ? p : { ...p, originM: [99, 0, 0] as [number, number, number] },
    ),
  ]) {
    expect(() =>
      installNativePressure(f.ctx, { ...input, actualParts: changed }, compile),
    ).toThrow(/installation|installed|duplicate/);
  }
  expect([...f.db.constructionAtmosphere.iter()]).toHaveLength(0);
  const door = f.db.constructionDoor.id.find(input.doorId);
  f.db.constructionDoor.id.update({ ...door, x: 3 });
  expect(() => installNativePressure(f.ctx, input, compile)).toThrow(/frame/);
  f.db.constructionDoor.id.update(door);
  installNativePressure(f.ctx, input, compile);
  expect(total(f.db.constructionAtmosphere.id.find(input.instanceId))).toBe(0);
  expect(
    compilePressureTopology(
      JSON.parse(
        f.db.constructionAtmosphere.id.find(input.instanceId).structureJson,
      ),
    ).compartments.every((c) => c.deckIds.includes(input.deckId)),
  ).toBe(true);
});

test("native gasket retracts before hinge, closed reference leaks only after accepted retraction, and gas is finite/conserved", () => {
  const f = fixture(),
    input = f.install();
  charge(f.db);
  f.tick();
  expect(
    gasRows(f.db.constructionAtmosphere.id.find(input.instanceId))[1].moles,
  ).toBe(0);
  let door = f.db.constructionDoor.id.find(input.doorId);
  f.db.constructionDoor.id.update({ ...door, targetOpen: true, moving: true });
  stepDoors(f.ctx);
  expect(f.db.constructionDoor.id.find(input.doorId).fraction).toBe(0);
  f.tick();
  expect(
    f.db.constructionNativePressure.id.find(input.instanceId).sealRetraction,
  ).toBeCloseTo(0.2);
  expect(f.db.constructionDoor.id.find(input.doorId).fraction).toBe(0);
  const first = gasRows(
    f.db.constructionAtmosphere.id.find(input.instanceId),
  )[1].moles;
  expect(first).toBeGreaterThan(0);
  expect(first).toBeLessThan(50);
  for (let i = 0; i < 25; i++) f.tick();
  expect(f.db.constructionDoor.id.find(input.doorId).fraction).toBe(1);
  expect(
    f.db.constructionNativePressure.id.find(input.instanceId).sealRetraction,
  ).toBe(1);
  door = f.db.constructionDoor.id.find(input.doorId);
  f.db.constructionDoor.id.update({ ...door, targetOpen: false, moving: true });
  for (let i = 0; i < 26; i++) f.tick();
  expect(f.db.constructionDoor.id.find(input.doorId).fraction).toBe(0);
  expect(
    f.db.constructionNativePressure.id.find(input.instanceId).sealRetraction,
  ).toBe(0);
  const final = f.db.constructionAtmosphere.id.find(input.instanceId);
  expect(total(final)).toBeCloseTo(100, 9);
  expect(
    gasRows(final).every((g) => Number.isFinite(g.moles) && g.moles >= 0),
  ).toBe(true);
  const before = final.gasJson;
  f.tick();
  expect(f.db.constructionAtmosphere.id.find(input.instanceId).gasJson).toBe(
    before,
  );
});

test("obstructions prevent native hinge and gasket deployment; generic hinge tampering and document edits reject", () => {
  const f = fixture(),
    input = f.install();
  const door = f.db.constructionDoor.id.find(input.doorId);
  f.db.constructionDoor.id.update({ ...door, targetOpen: true, moving: true });
  f.db.character.insert({
    id: "occupant",
    owner,
    shipId: input.instanceId,
    localX: 1.7,
    localY: 1,
  });
  f.db.constructionLocation.insert({
    characterId: "occupant",
    instanceId: input.instanceId,
    deckId: input.deckId,
  });
  f.tick();
  expect(f.db.constructionDoor.id.find(input.doorId).blocked).toBe(true);
  expect(
    f.db.constructionNativePressure.id.find(input.instanceId).sealRetraction,
  ).toBe(0);
  const native = f.db.constructionDoor.id.find(input.doorId);
  f.db.constructionDoor.id.update({ ...native, fraction: 0.1 });
  expect(() => f.tick()).toThrow(/hinge state/);
  f.db.constructionDoor.id.update(native);
  const instance = f.db.constructionInstance.id.find(input.instanceId);
  f.db.constructionInstance.id.update({
    ...instance,
    documentJson: instance.documentJson + " ",
  });
  expect(() => f.tick()).toThrow(/document changed/);
});

test("clock and installation replay survive serialized restart without charging, catching up or exchanging instances", () => {
  const f = fixture(),
    input = f.install();
  f.install("room-b", other);
  charge(f.db);
  const door = f.db.constructionDoor.id.find(input.doorId);
  f.db.constructionDoor.id.update({ ...door, targetOpen: true, moving: true });
  f.tick();
  const before = f.db.constructionAtmosphere.id.find(input.instanceId);
  expect(stepNativePressure(f.ctx, compile)).toBe(false);
  expect(f.db.constructionAtmosphere.id.find(input.instanceId)).toEqual(before);
  installNativePressure(f.ctx, input, compile);
  expect(f.db.constructionAtmosphere.id.find(input.instanceId)).toEqual(before);
  const restored = fixture();
  for (const [name, source] of Object.entries(f.db) as [string, any][]) {
    const serialized = JSON.stringify([...source.iter()], (_, value) =>
      typeof value === "bigint"
        ? { bigint: value.toString() }
        : value instanceof Identity
          ? { identity: value.toHexString() }
          : value,
    );
    for (const row of JSON.parse(serialized, (_, value) =>
      value?.bigint
        ? BigInt(value.bigint)
        : value?.identity
          ? Identity.fromString(value.identity)
          : value,
    ))
      restored.db[name].insert(row);
  }
  restored.ctx.timestamp = { ...f.ctx.timestamp };
  expect(stepNativePressure(restored.ctx, compile)).toBe(false);
  expect(restored.db.constructionAtmosphere.id.find(input.instanceId)).toEqual(
    before,
  );
  restored.ctx.timestamp.microsSinceUnixEpoch += 86400000000n;
  stepNativePressure(restored.ctx, compile);
  expect(
    restored.db.constructionAtmosphereClock.id.find(
      "native-pressure-fixed-step-v1",
    ).tick,
  ).toBe(2n);
  expect(
    restored.db.constructionNativePressure.id.find(input.instanceId)
      .sealRetraction,
  ).toBeCloseTo(0.4);
  expect(
    total(restored.db.constructionAtmosphere.id.find(input.instanceId)),
  ).toBeCloseTo(100, 10);
  expect(total(restored.db.constructionAtmosphere.id.find("room-b"))).toBe(0);
});

test("pressure view needs owned instance plus readable workspace; denied or revoked door requests cannot replay", () => {
  const f = fixture(),
    input = f.install();
  expect(ownNativePressure(f.ctx)).toEqual([]);
  const grant = {
    id: "grant",
    principal: owner,
    workspaceId: "workspace",
    capability: "draft.read",
    revoked: false,
    expiresMicros: 1000000n,
  };
  f.db.constructionGrant.insert(grant);
  const view = ownNativePressure(f.ctx);
  expect(view).toHaveLength(1);
  expect(view[0].compartments).toHaveLength(2);
  expect(Object.keys(view[0])).not.toContain("installedPartsJson");
  expect(ownNativePressure({ ...f.ctx, sender: other })).toEqual([]);
  const request = {
    openingId: input.doorId,
    expectedVisitId: "visit",
    expectedRevision: 1n,
    open: true,
    operationId: "request",
  };
  expect(() => requestDoor({ ...f.ctx, sender: other }, request)).toThrow(
    /character/,
  );
  f.db.character.insert({
    id: "actor",
    owner,
    shipId: input.instanceId,
    connected: true,
    localX: 0.5,
    localY: 1,
  });
  f.db.constructionLocation.insert({
    characterId: "actor",
    instanceId: input.instanceId,
    deckId: input.deckId,
    visitId: "visit",
  });
  expect(() => requestDoor(f.ctx, request)).toThrow(/grant/);
  expect([...f.db.constructionReceipt.iter()]).toHaveLength(0);
  const spawnGrant = {
    ...grant,
    id: "spawn-grant",
    capability: "instance.spawn",
  };
  f.db.constructionGrant.insert(spawnGrant);
  requestDoor(f.ctx, request);
  const acceptedDoor = f.db.constructionDoor.id.find(input.doorId);
  requestDoor(f.ctx, request);
  expect(f.db.constructionDoor.id.find(input.doorId)).toEqual(acceptedDoor);
  expect([...f.db.constructionReceipt.iter()]).toHaveLength(1);
  expect(() =>
    requestDoor(f.ctx, { ...request, operationId: "stale" }),
  ).toThrow(/revision/);
  f.db.constructionGrant.id.update({ ...spawnGrant, revoked: true });
  expect(() => requestDoor(f.ctx, request)).toThrow(/grant/);
  f.db.constructionGrant.id.update({ ...grant, revoked: true });
  expect(ownNativePressure(f.ctx)).toEqual([]);
  const actor = f.db.character.id.find("actor");
  f.db.character.id.update({ ...actor, connected: false });
  expect(() => requestDoor(f.ctx, request)).toThrow(/character/);
});

test("an occupant arriving after hinge closure prevents gasket seating and therefore zero flow", () => {
  const f = fixture(),
    input = f.install();
  charge(f.db);
  let door = f.db.constructionDoor.id.find(input.doorId);
  f.db.constructionDoor.id.update({ ...door, targetOpen: true, moving: true });
  for (let i = 0; i < 26; i++) f.tick();
  door = f.db.constructionDoor.id.find(input.doorId);
  f.db.constructionDoor.id.update({ ...door, targetOpen: false, moving: true });
  for (let i = 0; i < 20; i++) f.tick();
  const seatedHinge = f.db.constructionNativePressure.id.find(input.instanceId);
  expect(seatedHinge.acceptedFraction).toBe(0);
  expect(seatedHinge.sealRetraction).toBeGreaterThan(0);
  f.db.character.insert({
    id: "occupant",
    owner,
    shipId: input.instanceId,
    localX: 1.7,
    localY: 1,
  });
  f.db.constructionLocation.insert({
    characterId: "occupant",
    instanceId: input.instanceId,
    deckId: input.deckId,
  });
  for (let i = 0; i < 6; i++) f.tick();
  expect(
    f.db.constructionNativePressure.id.find(input.instanceId).sealRetraction,
  ).toBe(seatedHinge.sealRetraction);
  expect(f.db.constructionDoor.id.find(input.doorId).blocked).toBe(true);
  const topology = compilePressureTopology(
    JSON.parse(
      f.db.constructionAtmosphere.id.find(input.instanceId).structureJson,
    ),
  );
  expect(
    topology.flows.some((flow) => flow.conductanceMolesPerSecondPa > 0),
  ).toBe(true);
  expect(
    total(f.db.constructionAtmosphere.id.find(input.instanceId)),
  ).toBeCloseTo(100, 9);
});

test("global pressure admission rejects a 33rd installation before pressure writes and keeps the world tick viable", () => {
  const f = fixture();
  let first: ReturnType<typeof f.install> | undefined;
  for (let i = 0; i < 32; i++) {
    const installed = f.install("budget-room-" + i, i % 2 ? other : owner);
    first ??= installed;
  }
  const input = f.prepare("over-budget");
  const pressureBefore = [...f.db.constructionNativePressure.iter()];
  const gasBefore = [...f.db.constructionAtmosphere.iter()];
  expect(() => installNativePressure(f.ctx, input, compile)).toThrow(
    /admission budget/,
  );
  expect([...f.db.constructionNativePressure.iter()]).toEqual(pressureBefore);
  expect([...f.db.constructionAtmosphere.iter()]).toEqual(gasBefore);
  expect(
    f.db.constructionNativePressure.id.find(input.instanceId),
  ).toBeUndefined();
  expect(f.db.constructionAtmosphere.id.find(input.instanceId)).toBeUndefined();
  // An exact prior transaction retry remains valid at the admission ceiling.
  installNativePressure(f.ctx, first!, compile);
  expect(f.tick()).toBe(false);
  expect([...f.db.constructionAtmosphere.iter()]).toEqual(gasBefore);
  expect([...f.db.constructionAtmosphereClock.iter()]).toEqual([]);
});

test("immutable validation caches cannot hide edits made without revision increments", () => {
  const f = fixture(),
    input = f.install();
  f.tick();
  f.tick();
  const installed = f.db.constructionNativePressure.id.find(input.instanceId);
  const parts = JSON.parse(installed.installedPartsJson);
  parts[0].sha256 = "0".repeat(64);
  f.db.constructionNativePressure.id.update({
    ...installed,
    installedPartsJson: JSON.stringify(parts),
  });
  expect(() => f.tick()).toThrow(/installed transform or definition/);
  f.db.constructionNativePressure.id.update(installed);
  const gas = f.db.constructionAtmosphere.id.find(input.instanceId);
  const structure = JSON.parse(gas.structureJson);
  structure.cells[0].volumeM3 *= 2;
  f.db.constructionAtmosphere.id.update({
    ...gas,
    structureJson: JSON.stringify(structure),
  });
  expect(() => f.tick()).toThrow(/model no longer matches/);
  f.db.constructionAtmosphere.id.update(gas);
  expect(f.tick()).toBe(false);
});

test("empty pressure scheduling writes no clock and first later installation takes one fixed step", () => {
  const f = fixture();
  for (let i = 0; i < 100; i++) expect(f.tick()).toBe(false);
  expect([...f.db.constructionAtmosphereClock.iter()]).toEqual([]);
  const input = f.install();
  const door = f.db.constructionDoor.id.find(input.doorId);
  f.db.constructionDoor.id.update({ ...door, targetOpen: true, moving: true });
  f.ctx.timestamp.microsSinceUnixEpoch += 86400000000n;
  expect(f.tick()).toBe(true);
  expect(
    f.db.constructionNativePressure.id.find(input.instanceId).sealRetraction,
  ).toBeCloseTo(0.2);
  expect([...f.db.constructionAtmosphereClock.iter()][0].tick).toBe(1n);
});

test("moving pressure door reads indexed instance occupants without scanning every location", () => {
  const f = fixture(),
    input = f.install();
  f.db.constructionLocation.iter = () => {
    throw Error("full location scan");
  };
  const door = f.db.constructionDoor.id.find(input.doorId);
  f.db.constructionDoor.id.update({ ...door, targetOpen: true, moving: true });
  expect(() => f.tick()).not.toThrow();
  expect(
    f.db.constructionNativePressure.id.find(input.instanceId).sealRetraction,
  ).toBeCloseTo(0.2);
});

test("installed sealed pressure remains write-free while idle and resumes once without catch-up", () => {
  const f = fixture(),
    input = f.install();
  charge(f.db);
  const clocks = vi.spyOn(f.db.constructionAtmosphereClock, "insert");
  const clockUpdates = vi.spyOn(f.db.constructionAtmosphereClock.id, "update");
  const gas = vi.spyOn(f.db.constructionAtmosphere.id, "update");
  const pose = vi.spyOn(f.db.constructionNativePressure.id, "update");
  const hinge = vi.spyOn(f.db.constructionDoor.id, "update");
  for (let i = 0; i < 100; i++) expect(f.tick()).toBe(false);
  for (const spy of [clocks, clockUpdates, gas, pose, hinge])
    expect(spy).not.toHaveBeenCalled();
  const prior = f.db.constructionDoor.id.find(input.doorId);
  f.db.constructionDoor.id.update({ ...prior, targetOpen: true, moving: true });
  f.ctx.timestamp.microsSinceUnixEpoch += 86_400_000_000n;
  expect(f.tick()).toBe(true);
  expect(
    f.db.constructionNativePressure.id.find(input.instanceId).sealRetraction,
  ).toBeCloseTo(0.2);
  expect(clocks).toHaveBeenCalledTimes(1);
  expect(clockUpdates).not.toHaveBeenCalled();
  expect(gas).toHaveBeenCalled();
  const snapshot = JSON.stringify(
    [...f.db.constructionNativePressure.iter()],
    (_, value) => (typeof value === "bigint" ? String(value) : value),
  );
  expect(stepNativePressure(f.ctx, compile)).toBe(false);
  f.ctx.timestamp.microsSinceUnixEpoch += 49_999n;
  expect(stepNativePressure(f.ctx, compile)).toBe(false);
  expect(
    JSON.stringify([...f.db.constructionNativePressure.iter()], (_, value) =>
      typeof value === "bigint" ? String(value) : value,
    ),
  ).toBe(snapshot);
  f.ctx.timestamp.microsSinceUnixEpoch += 1n;
  expect(stepNativePressure(f.ctx, compile)).toBe(true);
  expect(clockUpdates).toHaveBeenCalledTimes(1);
  expect(
    f.db.constructionNativePressure.id.find(input.instanceId).sealRetraction,
  ).toBeCloseTo(0.4);
  expect(
    total(f.db.constructionAtmosphere.id.find(input.instanceId)),
  ).toBeCloseTo(100, 10);
});

test("open vacuum pressure becomes write-free again after the hinge settles", () => {
  const f = fixture(),
    input = f.install();
  const door = f.db.constructionDoor.id.find(input.doorId);
  f.db.constructionDoor.id.update({ ...door, targetOpen: true, moving: true });
  for (let i = 0; i < 30; i++) f.tick();
  expect(
    f.db.constructionNativePressure.id.find(input.instanceId).acceptedFraction,
  ).toBe(1);
  const clock = vi.spyOn(f.db.constructionAtmosphereClock.id, "update");
  const gas = vi.spyOn(f.db.constructionAtmosphere.id, "update");
  for (let i = 0; i < 100; i++) expect(f.tick()).toBe(false);
  expect(clock).not.toHaveBeenCalled();
  expect(gas).not.toHaveBeenCalled();
});
