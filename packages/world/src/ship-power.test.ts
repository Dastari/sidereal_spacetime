import { expect, test, vi } from "vitest";
import { SHARED_SYSTEM_SEED } from "@sidereal/content/shared-system";
import WREN_R8 from "./fixtures/fed-s-wren-r8.prefab.json";
import { Identity } from "spacetimedb";
import { consumeFlightDamage } from "./construction-flight-availability";
vi.mock("spacetimedb/server", () => {
  const chain: any = new Proxy({}, { get: () => () => chain });
  return {
    SenderError: class extends Error {},
    Range: class {},
    table: () => ({}),
    t: new Proxy({}, { get: () => () => chain }),
  };
});
const access = vi.hoisted(() => ({ crew: new Set<string>() }));
vi.mock("./construction-passenger-access", () => ({
  acceptedPassengerAccess: (_ctx: unknown, id: string) => ({
    readInterior: access.crew.has(id),
  }),
}));
import { prefabById } from "@sidereal/content/prefabs";
import { defaultPrefabComponentCatalog } from "@sidereal/content/ship-prefab-catalog";
import { prefabConstructionDocument } from "@sidereal/sim/prefab-construction";
import {
  prefabFlightModel,
  prefabPlacedObjectId,
  PREFAB_FLIGHT_DEFINITION,
} from "@sidereal/sim/prefab-flight";
import {
  snapshotPin,
  registerComponentCatalogSnapshot,
} from "@sidereal/sim/component-catalogs";
import { shipComponentCatalogFor } from "@sidereal/sim/prefab-ship-systems";
import { compileFlightDefinition } from "@sidereal/sim/flight-definition";
import { lifecycleTestTables } from "./lifecycle-test-tables";
import { stepShipSystems } from "./ship-systems";
import { markShipSystemsDirty } from "./ship-systems-dirty";
import {
  installPrefabPower,
  replaceInstalledPowerDevice,
  stepShipPower,
  currentShipPower,
  prefabPowerReady,
  ownShipPower,
  ownShipPowerDevices,
  legacyQueuedPowerDamageLoss,
} from "./ship-power";
import { readConstructionFlightInput } from "./construction-flight-input";
const OWNER = Identity.fromString("1".repeat(64)),
  GUEST = Identity.fromString("2".repeat(64)),
  STRANGER = Identity.fromString("3".repeat(64));
const CATALOG = defaultPrefabComponentCatalog();
function fixture(prefab: any = prefabById("fed.s.wren")!) {
  let uuid = 0;
  const tables: Record<string, any> = { ...lifecycleTestTables() };
  const pk: Record<string, string> = {
    shipPowerClock: "id",
    shipSystemsClock: "id",
    shipPowerDevice: "id",
    constructionInstance: "id",
    ship: "id",
    character: "id",
    shipComponentDamage: "id",
    constructionFlightFitting: "id",
    constructionFlightReceipt: "id",
    constructionFlightDamageEvent: "id",
    input: "characterId",
    constructionPassengerVisit: "characterId",
  };
  const columns: Record<string, string> = {
    by_system: "systemId",
    by_ship: "shipId",
    by_owner: "owner",
    by_instance: "instanceId",
  };
  const db: any = new Proxy(
    {},
    {
      get: (_, name: string) => {
        if (tables[name]) return tables[name];
        const rows: any[] = [];
        const primary = pk[name] ?? "shipId";
        const same = (a: any, b: any) => (a?.isEqual ? a.isEqual(b) : a === b);
        return (tables[name] = new Proxy(
          {
            rows,
            iter: () => rows.values(),
            count: () => BigInt(rows.length),
            insert: (r: any) => {
              if (rows.some((v) => same(v[primary], r[primary])))
                throw Error("duplicate " + name);
              rows.push({ ...r });
              return r;
            },
          },
          {
            get: (t, index: string) => {
              if (index in t) return (t as any)[index];
              const field = columns[index] ?? index;
              return {
                find: (id: any) => rows.find((r) => same(r[field], id)),
                filter: (id: any) =>
                  rows
                    .filter(
                      (r) =>
                        index === "by_revision" ||
                        index === "by_created" ||
                        same(r[field], id),
                    )
                    .sort((a, b) =>
                      index === "by_revision"
                        ? Number(a.revision - b.revision)
                        : index === "by_created"
                          ? Number(a.createdMicros - b.createdMicros)
                          : 0,
                    ),
                update: (r: any) => {
                  const i = rows.findIndex((v) => same(v[primary], r[primary]));
                  if (i < 0) throw Error("missing " + name);
                  rows[i] = { ...r };
                  return r;
                },
                delete: (id: any) => {
                  const i = rows.findIndex((r) => same(r[field], id));
                  if (i < 0) return false;
                  rows.splice(i, 1);
                  return true;
                },
              };
            },
          },
        ));
      },
    },
  );
  const ctx: any = {
    db,
    sender: OWNER,
    databaseIdentity: OWNER,
    timestamp: { microsSinceUnixEpoch: 10_000_000n },
    newUuidV4: () => ({ toString: () => `power-${++uuid}` }),
  };
  db.ship.insert({ id: "ship", owner: OWNER });
  db.shipWorldMotion.insert({
    shipId: "ship",
    systemId: SHARED_SYSTEM_SEED.systemId,
    serverTick: 0n,
  });
  db.constructionInstance.insert({
    id: "ship",
    owner: OWNER,
    revision: 1n,
    blueprintSha256: `${prefab.id}:${prefab.revision}`,
    createdMicros: 1n,
    idMapJson: "{}",
    documentJson: JSON.stringify(prefabConstructionDocument(prefab, CATALOG)),
  });
  db.character.insert({
    id: "pilot",
    owner: OWNER,
    shipId: "ship",
    localX: 0,
    localY: 0,
  });
  const compile = () => {
    markShipSystemsDirty(ctx, "ship", "damage");
    stepShipSystems(ctx);
  };
  const tick = () => {
    ctx.timestamp = {
      microsSinceUnixEpoch: ctx.timestamp.microsSinceUnixEpoch + 50_000n,
    };
    stepShipPower(ctx);
  };
  const damage = (mountId: string, performance: number) => {
    const id = `ship|mount:${mountId}`,
      old = db.shipComponentDamage.id.find(id),
      row = { id, shipId: "ship", objectId: `mount:${mountId}`, performance };
    if (old) db.shipComponentDamage.id.update(row);
    else db.shipComponentDamage.insert(row);
    compile();
  };
  const device = (mountId: string) =>
    db.shipPowerDevice.by_ship
      .filter("ship")
      .find((r: any) => r.mountId === `mount:${mountId}`);
  return { ctx, db, compile, tick, damage, device };
}
test("trusted new issue charges once, black starts for one tick, compile/refit/restart preserve device UUID and joules", () => {
  const f = fixture();
  installPrefabPower(f.ctx, "ship");
  f.compile();
  const issued = { ...f.device("battery") };
  expect(issued.energyJ).toBe(72_000_000);
  expect(f.device("reactor").running).toBe(false);
  f.tick();
  expect(f.device("reactor").running).toBe(true);
  expect(currentShipPower(f.ctx, "ship")!.generationW).toBe(0);
  f.tick();
  expect(currentShipPower(f.ctx, "ship")!.generationW).toBeGreaterThan(0);
  const retained = { ...f.device("battery") };
  f.compile();
  expect(f.device("battery")).toEqual(retained);
  dbRecompile(f);
  expect(f.device("battery")).toEqual(retained);
  const instance = f.db.constructionInstance.id.find("ship");
  f.db.constructionInstance.id.update({ ...instance, revision: 2n });
  installPrefabPower(f.ctx, "ship");
  expect(f.device("battery")).toEqual(retained);
  expect(f.device("battery").id).toBe(issued.id);
});
function dbRecompile(f: ReturnType<typeof fixture>) {
  f.db.shipPowerState.shipId.delete("ship");
  f.compile();
}
test("removed battery retires UUID; replacement UUID starts empty on compilation and cannot inherit charge", () => {
  const f = fixture();
  installPrefabPower(f.ctx, "ship");
  const old = { ...f.device("battery") };
  const instance = f.db.constructionInstance.id.find("ship"),
    doc = JSON.parse(instance.documentJson);
  doc.prefab.document.mounts = doc.prefab.document.mounts.filter(
    (m: any) => m.id !== "battery",
  );
  f.db.constructionInstance.id.update({
    ...instance,
    revision: 2n,
    blueprintSha256: "removed",
    documentJson: JSON.stringify(doc),
  });
  f.compile();
  f.tick();
  expect(f.db.shipPowerDevice.id.find(old.id)).toBeUndefined();
  doc.prefab.document.mounts.push({
    ...prefabById("fed.s.wren")!.mounts.find((m) => m.id === "battery")!,
  });
  f.db.constructionInstance.id.update({
    ...instance,
    revision: 3n,
    blueprintSha256: "replacement",
    documentJson: JSON.stringify(doc),
  });
  f.compile();
  f.tick();
  const next = f.device("battery");
  expect(next.id).not.toBe(old.id);
  expect(next.energyJ).toBeLessThanOrEqual(8_000); // actual generated charge this one step, never inherited 72 MJ
  f.db.shipPowerState.shipId.delete("ship");
  f.db.shipPowerDevice.id.delete(next.id);
  f.compile();
  // Rebuilding a missing installed row is empty; permanent marker forbids another issue.
  f.damage("reactor", 0);
  f.tick();
  expect(f.device("battery").energyJ).toBe(0);
});
test("durable one-time legacy compatibility, damaged/stopped legacy and new issue remain distinct", () => {
  const f = fixture();
  f.compile();
  f.tick();
  expect(f.device("reactor").running).toBe(true);
  expect(f.db.shipPowerInstallation.shipId.find("ship").policy).toBe(
    "legacy-running",
  );
  const retained = { ...f.device("battery") };
  expect(retained.energyJ).toBeLessThanOrEqual(8000);
  f.db.shipPowerState.shipId.delete("ship");
  f.damage("reactor", 0);
  f.tick();
  expect(f.device("reactor").running).toBe(false);
  f.damage("reactor", 1);
  f.db.shipPowerDevice.id.update({ ...f.device("battery"), energyJ: 0 });
  f.tick();
  expect(f.device("reactor").running).toBe(false); // marker cannot repeatedly regrant a running reactor
  const damaged = fixture();
  damaged.damage("reactor", 0.5);
  damaged.tick();
  expect(damaged.device("reactor").running).toBe(false);
  const newlyCreated = fixture();
  newlyCreated.db.constructionInstance.id.update({
    ...newlyCreated.db.constructionInstance.id.find("ship"),
    createdMicros: 20_000_000n,
  });
  newlyCreated.compile();
  newlyCreated.tick();
  expect(newlyCreated.device("reactor").running).toBe(false);
});
test("same tick solves once, restart preserves J without charging, destroyed store dissipates J", () => {
  const f = fixture();
  installPrefabPower(f.ctx, "ship");
  f.compile();
  f.tick();
  const before = { ...f.device("battery") };
  stepShipPower({ ...f.ctx });
  expect(f.device("battery")).toEqual(before);
  f.db.shipPowerState.shipId.delete("ship");
  f.damage("battery", 0);
  f.tick();
  expect(f.device("battery").energyJ).toBe(0);
  const networks = JSON.parse(currentShipPower(f.ctx, "ship")!.networksJson);
  expect(networks.reduce((n: number, r: any) => n + r.dissipatedJ, 0)).toBe(
    before.energyJ,
  );
});
test("committed solve tolerates bounded enqueue timestamp inversion; stale, impossible future and inconsistent clock rows fail closed", () => {
  const f = fixture();
  installPrefabPower(f.ctx, "ship");
  f.compile();
  f.tick();
  const row = { ...f.db.shipPowerState.shipId.find("ship") };
  const clock = { ...f.db.shipPowerClock.id.find(0) };
  const devices = f.db.shipPowerDevice.rows.map((r: any) => ({ ...r }));
  const at = (micros: bigint) => ({
    ...f.ctx,
    timestamp: { microsSinceUnixEpoch: micros },
  });
  // Both timestamps are within the same fixed tick.
  f.db.shipPowerState.shipId.update({
    ...row,
    solvedMicros: row.solvedMicros + 20n,
  });
  expect(prefabPowerReady(at(row.solvedMicros + 8n), "ship")).toBe(true);
  // Command enqueue is 12 us before the boundary; the committed solve is on it.
  f.db.shipPowerState.shipId.update(row);
  expect(prefabPowerReady(at(row.solvedMicros - 12n), "ship")).toBe(true);
  expect(prefabPowerReady(at(row.solvedMicros - 50_001n), "ship")).toBe(false);
  expect(prefabPowerReady(at(row.solvedMicros + 100_001n), "ship")).toBe(false);
  expect(prefabPowerReady(at(row.solvedMicros + 100_000n), "ship")).toBe(true);
  // Neither an impossible solve timestamp nor a clock older than its row is accepted.
  f.db.shipPowerState.shipId.update({
    ...row,
    solvedMicros: row.solvedMicros + 50_000n,
  });
  expect(prefabPowerReady(at(row.solvedMicros), "ship")).toBe(false);
  f.db.shipPowerState.shipId.update(row);
  f.db.shipPowerClock.id.update({ ...clock, lastTick: row.tick - 1n });
  expect(prefabPowerReady(at(row.solvedMicros), "ship")).toBe(false);
  f.db.shipPowerClock.id.delete(0);
  expect(prefabPowerReady(at(row.solvedMicros), "ship")).toBe(false);
  expect(f.db.shipPowerDevice.rows).toEqual(devices);
});
test("dirty/stale/revision mismatch fails closed immediately, destroyed core stops control and clears old input", () => {
  const f = fixture();
  f.compile();
  f.tick();
  expect(prefabPowerReady(f.ctx, "ship")).toBe(true);
  markShipSystemsDirty(f.ctx, "ship", "damage");
  expect(prefabPowerReady(f.ctx, "ship")).toBe(false);
  f.compile();
  f.ctx.timestamp = {
    microsSinceUnixEpoch: f.ctx.timestamp.microsSinceUnixEpoch + 100_001n,
  };
  expect(prefabPowerReady(f.ctx, "ship")).toBe(false);
  f.tick();
  f.db.input.insert({
    characterId: "pilot",
    throttle: 1,
    turn: 1,
    dx: 1,
    dy: 1,
    sprint: true,
  });
  f.damage("core", 0);
  expect(prefabPowerReady(f.ctx, "ship")).toBe(false);
  f.tick();
  expect(prefabPowerReady(f.ctx, "ship")).toBe(false);
  expect(f.db.input.characterId.find("pilot")).toMatchObject({
    throttle: 0,
    turn: 0,
    dx: 1,
    dy: 1,
    sprint: true,
  });
});
test("owner/current admitted crew only; revocation, unaccepted passengers and strangers see no runtime rows", () => {
  const f = fixture();
  f.compile();
  f.tick();
  expect(ownShipPower(f.ctx)).toHaveLength(1);
  expect(ownShipPowerDevices(f.ctx).length).toBeGreaterThan(0);
  f.db.character.insert({ id: "guest", owner: GUEST, shipId: "ship" });
  f.db.constructionPassengerVisit.insert({
    characterId: "guest",
    shipId: "ship",
  });
  const guest = { ...f.ctx, sender: GUEST };
  expect(ownShipPower(guest)).toEqual([]);
  access.crew.add("guest");
  expect(ownShipPower(guest)).toHaveLength(1);
  access.crew.delete("guest");
  expect(ownShipPowerDevices(guest)).toEqual([]);
  expect(ownShipPower({ ...f.ctx, sender: STRANGER })).toEqual([]);
});
test("flight reads allocated fraction independently of physical fitting damage, dirty compile zeros thrust and core", () => {
  const f = fixture(),
    model = prefabFlightModel(prefabById("fed.s.wren")!, CATALOG);
  f.db.constructionFlightBinding.insert({
    shipId: "ship",
    definitionId: PREFAB_FLIGHT_DEFINITION,
  });
  for (const fit of model.fittings)
    f.db.constructionFlightFitting.insert({
      id: fit.sourceId,
      shipId: "ship",
      placedObjectId: prefabPlacedObjectId("ship", fit.sourceId),
      sourceDeviceId: fit.sourceId,
      definitionId: fit.definitionId,
      definitionRevision: fit.definitionRevision,
      kind: fit.role,
      installed: true,
      powered: true,
      availability: 0.8,
      revision: 1n,
    });
  installPrefabPower(f.ctx, "ship");
  f.compile();
  f.tick();
  f.tick();
  const before = compileFlightDefinition(
    readConstructionFlightInput(f.ctx, "ship"),
  );
  expect(before.status).toBe("ready");
  if (before.status !== "ready") throw Error(before.reason);
  const row = currentShipPower(f.ctx, "ship")!,
    supply = JSON.parse(row.supplyJson);
  supply["mount:main-c"] = 0.25;
  f.db.shipPowerState.shipId.update({
    ...row,
    supplyJson: JSON.stringify(supply),
  });
  const allocated = compileFlightDefinition(
    readConstructionFlightInput(f.ctx, "ship"),
  );
  if (allocated.status !== "ready") throw Error(allocated.reason);
  const drive = allocated.actuators.find((a) =>
    a.id.startsWith("mount-main-c"),
  )!;
  expect(drive.availability).toBeCloseTo(0.2);
  markShipSystemsDirty(f.ctx, "ship", "damage");
  const dirty = compileFlightDefinition(
    readConstructionFlightInput(f.ctx, "ship"),
  );
  if (dirty.status !== "ready") throw Error(dirty.reason);
  expect(dirty.actuators.every((a) => a.availability === 0)).toBe(true);
  expect(dirty.computers.every((c) => !c.powered)).toBe(true);
});

test("same-socket same-component replacement retires actual installed UUID and starts empty", () => {
  const f = fixture();
  installPrefabPower(f.ctx, "ship");
  f.compile();
  f.tick();
  const battery = { ...f.device("battery") };
  expect(battery.energyJ).toBeGreaterThan(1_000_000);
  replaceInstalledPowerDevice(f.ctx, "ship", "mount:battery", battery.id);
  expect(f.db.shipPowerDevice.id.find(battery.id)).toBeUndefined();
  const replacement = f.device("battery");
  expect(replacement.id).not.toBe(battery.id);
  expect(replacement.energyJ).toBe(0);
  expect(currentShipPower(f.ctx, "ship")).toBeUndefined();
  expect(() =>
    replaceInstalledPowerDevice(f.ctx, "ship", "mount:battery", battery.id),
  ).toThrow("revision mismatch");
});

test("retained device repin clamps joules to new capacity without refilling and uses immutable snapshot", () => {
  const f = fixture();
  installPrefabPower(f.ctx, "ship");
  const old = { ...f.device("battery") };
  const definition = shipComponentCatalogFor(CATALOG.revision).components.find(
    (d) => d.id === "battery.sm",
  )!;
  const snapshot = {
    base: 4,
    components: [
      {
        ...definition,
        revision: definition.revision + 1,
        power: { ...definition.power, storageKwh: 1 },
      },
    ],
    removed: [],
  };
  const pin = snapshotPin(snapshot);
  registerComponentCatalogSnapshot(pin.pin, pin.canonical);
  const instance = f.db.constructionInstance.id.find("ship"),
    doc = JSON.parse(instance.documentJson);
  doc.prefab.catalog = pin.pin;
  f.db.constructionInstance.id.update({
    ...instance,
    revision: 2n,
    blueprintSha256: "repin",
    documentJson: JSON.stringify(doc),
  });
  installPrefabPower(f.ctx, "ship");
  expect(f.device("battery").id).toBe(old.id);
  expect(f.device("battery").energyJ).toBe(3_600_000);
  expect(f.device("battery").definition).toContain(pin.pin);
  f.db.shipPowerDevice.id.update({ ...f.device("battery"), energyJ: 12345 });
  installPrefabPower(f.ctx, "ship");
  expect(f.device("battery").energyJ).toBe(12345);
  expect(old.definition).not.toContain(pin.pin);
});

test("legacy cleanup preserves independent fitting damage and only removes proven combat power derating", () => {
  const f = fixture();
  f.db.constructionFlightFitting.insert({
    id: "independent",
    shipId: "ship",
    sourceDeviceId: "mount-main-c",
    installed: true,
    powered: true,
    availability: 0.5,
    revision: 2n,
  });
  f.db.constructionFlightFitting.insert({
    id: "known",
    shipId: "ship",
    sourceDeviceId: "mount-main-s",
    installed: true,
    powered: true,
    availability: 0,
    revision: 2n,
  });
  f.db.constructionFlightFitting.insert({
    id: "unproven",
    shipId: "ship",
    sourceDeviceId: "mount-main-p",
    installed: true,
    powered: true,
    availability: 0,
    revision: 2n,
  });
  f.db.constructionFlightReceipt.insert({
    id: JSON.stringify(["server-flight-damage", "combat-damage:known:1"]),
    requestJson: JSON.stringify({
      event: JSON.stringify({
        id: "combat-damage:known:1",
        shipId: "ship",
        fittingId: "known",
        expectedFittingRevision: "1",
        lossFraction: 1,
        sourceEventId: "combat-damage:ship:1",
      }),
      result: "applied",
    }),
  });
  f.damage("reactor", 0);
  f.tick();
  expect(
    f.db.constructionFlightFitting.id.find("independent").availability,
  ).toBe(0.5);
  expect(f.db.constructionFlightFitting.id.find("known").availability).toBe(1);
  expect(f.db.constructionFlightFitting.id.find("unproven").availability).toBe(
    0,
  );
  expect(f.device("reactor").running).toBe(false);
});
test("legacy queue beyond eight drains across initialization without reapplying power damage or healing independent damage", () => {
  const f = fixture();
  f.db.constructionFlightBinding.insert({
    shipId: "ship",
    instanceId: "ship",
    owner: OWNER,
    revision: 1n,
  });
  for (let i = 0; i < 14; i++) {
    const id = `queued-${i}`;
    f.db.constructionFlightFitting.insert({
      id,
      shipId: "ship",
      sourceDeviceId: "mount-main-c",
      installed: true,
      powered: true,
      kind: "actuator",
      availability: i === 10 ? 0.5 : 1,
      revision: 1n,
    });
    f.db.constructionFlightDamageEvent.insert({
      id: `combat-damage:${id}:1`,
      shipId: "ship",
      fittingId: id,
      expectedFittingRevision: 1n,
      sourceEventId: "combat-damage:ship:1",
      createdMicros: 1n,
      lossFraction: 1,
    });
  }
  f.damage("reactor", 0);
  const hash = f.db.shipSystemsState.shipId.find("ship").inputHash;
  const consume = () =>
    consumeFlightDamage(f.ctx, (event, fitting) =>
      legacyQueuedPowerDamageLoss(f.ctx, event, fitting),
    );
  expect(consume()).toBe(8);
  expect(f.db.constructionFlightFitting.id.find("queued-0").availability).toBe(
    0,
  );
  f.tick(); // applied old factors are removed by the one-time cleanup
  expect(f.db.constructionFlightBinding.shipId.find("ship").revision).toBe(10n);
  expect(f.db.constructionFlightFitting.id.find("queued-0")).toMatchObject({
    availability: 1,
    revision: 3n,
  });
  expect(f.db.constructionFlightDamageEvent.rows).toHaveLength(6);
  expect(consume()).toBe(6); // remaining old factors are removed before application
  f.tick();
  for (let i = 0; i < 14; i++)
    expect(
      f.db.constructionFlightFitting.id.find(`queued-${i}`).availability,
    ).toBe(i === 10 ? 0.5 : 1);
  const receipt = JSON.parse(
    f.db.constructionFlightReceipt.id.find(
      JSON.stringify(["server-flight-damage", "combat-damage:queued-9:1"]),
    ).requestJson,
  );
  expect(JSON.parse(receipt.event).lossFraction).toBe(1);
  expect(receipt).toMatchObject({ result: "applied", appliedLossFraction: 0 });
  expect(f.db.constructionFlightFitting.id.find("queued-9").revision).toBe(2n);
  expect(f.db.shipSystemsState.shipId.find("ship").inputHash).toBe(hash);
  const cutoff = f.db.shipPowerClock.id.find(0).legacyCutoffMicros;
  for (const [id, createdMicros, sourceEventId] of [
    ["post-cutoff", cutoff + 1n, "combat-damage:ship:1"],
    ["independent", 1n, "collision:ship:1"],
  ] as const) {
    f.db.constructionFlightFitting.insert({
      id,
      shipId: "ship",
      sourceDeviceId: "mount-main-c",
      installed: true,
      powered: true,
      kind: "actuator",
      availability: 0.5,
      revision: 1n,
    });
    f.db.constructionFlightDamageEvent.insert({
      id: `combat-damage:${id}:1`,
      shipId: "ship",
      fittingId: id,
      expectedFittingRevision: 1n,
      sourceEventId,
      createdMicros,
      lossFraction: 1,
    });
  }
  expect(consume()).toBe(2);
  f.tick();
  expect(
    f.db.constructionFlightFitting.id.find("post-cutoff").availability,
  ).toBe(0);
  expect(
    f.db.constructionFlightFitting.id.find("independent").availability,
  ).toBe(0);
});
test("post-cutoff damage already applied while legacy initialization is pending is never grandfathered", () => {
  const f = fixture();
  f.db.shipPowerClock.insert({
    id: 0,
    legacyCutoffMicros: 5_000_000n,
    lastTick: 100n,
    admissionValid: true,
  });
  f.db.shipPowerInstallation.insert({
    shipId: "ship",
    initializedMicros: 5_000_000n,
    policy: "legacy-pending",
    lastSolvedTick: 0n,
  });
  f.db.constructionFlightBinding.insert({
    shipId: "ship",
    instanceId: "ship",
    owner: OWNER,
    revision: 1n,
  });
  f.db.constructionFlightFitting.insert({
    id: "after",
    shipId: "ship",
    sourceDeviceId: "mount-main-c",
    installed: true,
    powered: true,
    kind: "actuator",
    availability: 1,
    revision: 1n,
  });
  f.db.constructionFlightDamageEvent.insert({
    id: "combat-damage:after:1",
    shipId: "ship",
    fittingId: "after",
    expectedFittingRevision: 1n,
    sourceEventId: "combat-damage:ship:1",
    createdMicros: 6_000_000n,
    lossFraction: 1,
  });
  f.damage("reactor", 0);
  expect(
    consumeFlightDamage(f.ctx, (event, fitting) =>
      legacyQueuedPowerDamageLoss(f.ctx, event, fitting),
    ),
  ).toBe(1);
  f.tick();
  expect(f.db.constructionFlightFitting.id.find("after")).toMatchObject({
    availability: 0,
    revision: 2n,
  });
});
test.each(["destroyed", "disconnected"] as const)(
  "real compiled Wren fuel source %s stops running generation; finite battery and black start remain conserved",
  (reason) => {
    const f = fixture();
    installPrefabPower(f.ctx, "ship");
    f.compile();
    f.tick();
    f.tick();
    expect(f.device("reactor").running).toBe(true);
    expect(currentShipPower(f.ctx, "ship")!.generationW).toBeGreaterThan(0);
    f.db.shipPowerDevice.id.update({ ...f.device("battery"), energyJ: 10_000 });
    const fuelMounts = prefabById("fed.s.wren")!
      .mounts.filter(
        (m) =>
          shipComponentCatalogFor(CATALOG.revision).components.find(
            (d) => d.id === m.component,
          )!.fluids.fuelCapacityL > 0,
      )
      .map((m) => m.id);
    expect(fuelMounts.length).toBeGreaterThan(0);
    if (reason === "destroyed") {
      for (const mount of fuelMounts) f.damage(mount, 0);
    } else {
      const instance = f.db.constructionInstance.id.find("ship");
      const source = JSON.parse(instance.documentJson);
      source.prefab.document.mounts = source.prefab.document.mounts.filter(
        (m: any) => !fuelMounts.includes(m.id),
      );
      f.db.constructionInstance.id.update({
        ...instance,
        revision: instance.revision + 1n,
        blueprintSha256: instance.blueprintSha256 + ":no-fuel",
        documentJson: JSON.stringify(source),
      });
      f.compile();
    }
    const reactorUuid = f.device("reactor").id;
    f.tick();
    const supplied = currentShipPower(f.ctx, "ship")!;
    expect(supplied).toMatchObject({ generationW: 0, corePowered: true });
    expect(f.device("reactor")).toMatchObject({
      id: reactorUuid,
      running: false,
    });
    expect(f.device("battery").energyJ).toBeLessThan(10_000);
    expect(f.device("battery").energyJ).toBeGreaterThan(0);
    expect(JSON.parse(supplied.supplyJson)["mount:reactor"]).toBe(0);
    for (const network of JSON.parse(supplied.networksJson)) {
      expect(network.generationJ).toBe(0);
      expect(network.startupJ).toBe(0);
      expect(network.chargeJ).toBe(0);
      expect(network.beforeJ - network.afterJ).toBeCloseTo(
        network.loadJ + network.dissipatedJ,
        6,
      );
    }
    for (let i = 0; i < 10; i++) f.tick();
    expect(f.device("battery").energyJ).toBe(0);
    expect(prefabPowerReady(f.ctx, "ship")).toBe(false);
    if (reason === "destroyed") {
      for (const mount of fuelMounts) f.damage(mount, 1);
      f.tick();
      expect(f.device("reactor").running).toBe(false);
      expect(currentShipPower(f.ctx, "ship")!.generationW).toBe(0);
      f.db.shipPowerDevice.id.update({ ...f.device("battery"), energyJ: 500 });
      f.tick();
      expect(f.device("reactor").running).toBe(true);
      expect(currentShipPower(f.ctx, "ship")!.generationW).toBe(0);
      expect(
        JSON.parse(currentShipPower(f.ctx, "ship")!.networksJson).reduce(
          (n: number, r: any) => n + r.startupJ,
          0,
        ),
      ).toBe(
        shipComponentCatalogFor(CATALOG.revision).components.find(
          (d) =>
            d.id ===
            prefabById("fed.s.wren")!.mounts.find((m) => m.id === "reactor")!
              .component,
        )!.power.idleKw *
          1000 *
          0.05,
      );
      expect(
        JSON.parse(currentShipPower(f.ctx, "ship")!.networksJson).every(
          (r: any) => r.chargeJ === 0,
        ),
      ).toBe(true);
      f.tick();
      expect(currentShipPower(f.ctx, "ship")!.generationW).toBeGreaterThan(0);
    }
  },
);
test("drafts are ignored; every one of 60 admitted ships solves at 20 Hz; corrupt overflow closes whole island without throwing", () => {
  const f = fixture();
  const source = f.db.constructionInstance.id.find("ship");
  for (let i = 0; i < 300; i++)
    f.db.constructionInstance.insert({
      ...source,
      id: `draft-${i}`,
      documentJson: "not a prefab",
    });
  f.compile();
  f.tick();
  expect(currentShipPower(f.ctx, "ship")).toBeDefined();
  for (let i = 0; i < 59; i++) {
    const id = `active-${i}`;
    f.db.ship.insert({ id, owner: OWNER });
    f.db.shipWorldMotion.insert({
      shipId: id,
      systemId: SHARED_SYSTEM_SEED.systemId,
      serverTick: 0n,
    });
    f.db.constructionInstance.insert({ ...source, id });
    markShipSystemsDirty(f.ctx, id, "install");
  }
  for (let i = 0; i < 30; i++) stepShipSystems(f.ctx);
  f.tick();
  expect(f.db.shipPowerState.rows).toHaveLength(60);
  const timings: number[] = [];
  for (let i = 0; i < 20; i++) {
    const started = performance.now();
    f.tick();
    timings.push(performance.now() - started);
    expect(
      f.db.shipPowerState.rows.every(
        (r: any) => r.tick === f.ctx.timestamp.microsSinceUnixEpoch / 50_000n,
      ),
    ).toBe(true);
  }
  if (process.env.SIDEREAL_POWER_TIMING)
    console.log(
      JSON.stringify({
        powerAdapterTiming: {
          admittedShips: 60,
          ticks: timings.length,
          averageMs: timings.reduce((a, b) => a + b, 0) / timings.length,
          maximumMs: Math.max(...timings),
          scope:
            "isolated in-memory world adapter; not a database server benchmark",
        },
      }),
    );
  const energies = f.db.shipPowerDevice.rows.map((r: any) => [r.id, r.energyJ]);
  f.db.input.insert({
    characterId: "pilot",
    throttle: 1,
    turn: 1,
    dx: 1,
    dy: 1,
    sprint: true,
  });
  f.db.shipWorldMotion.insert({
    shipId: "corrupt-extra",
    systemId: SHARED_SYSTEM_SEED.systemId,
  });
  expect(() => f.tick()).not.toThrow();
  expect(currentShipPower(f.ctx, "ship")).toBeUndefined();
  expect(f.db.input.characterId.find("pilot")).toMatchObject({
    throttle: 0,
    turn: 0,
    dx: 1,
    dy: 1,
    sprint: true,
  });
  expect(f.db.shipPowerDevice.rows.map((r: any) => [r.id, r.energyJ])).toEqual(
    energies,
  );
});
test("retained r8 without a battery stays operational once; a newly admitted draft gets empty/stopped devices", () => {
  const f = fixture(WREN_R8);
  f.compile();
  f.tick();
  expect(f.device("battery")).toBeUndefined();
  expect(f.device("reactor").running).toBe(true);
  expect(prefabPowerReady(f.ctx, "ship")).toBe(true);
  f.damage("reactor", 0);
  f.tick();
  f.damage("reactor", 1);
  f.tick();
  expect(f.device("reactor").running).toBe(false);
  const draft = fixture();
  draft.db.shipWorldMotion.shipId.delete("ship");
  draft.compile();
  draft.tick();
  expect(draft.db.shipPowerDevice.rows).toHaveLength(0);
  // The draft itself predates runtime activation; only its admission is new.
  draft.db.shipWorldMotion.insert({
    shipId: "ship",
    systemId: SHARED_SYSTEM_SEED.systemId,
    serverTick: draft.ctx.timestamp.microsSinceUnixEpoch / 50_000n,
  });
  draft.tick();
  expect(draft.device("battery").energyJ).toBe(0);
  expect(draft.device("reactor").running).toBe(false);
  expect(prefabPowerReady(draft.ctx, "ship")).toBe(false);
});
