import { expect, test, vi } from "vitest";
import { Identity } from "spacetimedb";
vi.mock("spacetimedb/server", () => {
  const chain: any = new Proxy({}, { get: () => () => chain });
  return {
    SenderError: class extends Error {},
    Range: class {},
    table: () => ({}),
    t: new Proxy({}, { get: () => () => chain }),
  };
});
// Crew admission and space discovery have their own suites; here they are switches.
const access = vi.hoisted(() => ({
  crew: new Set<string>(),
  visible: [] as string[],
}));
vi.mock("./construction-passenger-access", () => ({
  acceptedPassengerAccess: (_ctx: unknown, characterId: string) => ({
    readInterior: access.crew.has(characterId),
  }),
}));
vi.mock("./shared-world-views", () => ({
  visibleShipMotion: () => access.visible.map((shipId) => ({ shipId })),
}));
import { PREFAB_SHIPS, prefabById } from "@sidereal/content/prefabs";
import { defaultPrefabComponentCatalog } from "@sidereal/content/ship-prefab-catalog";
import { compilePrefabShipSystems } from "@sidereal/sim/prefab-ship-systems";
import {
  SHIP_SYSTEMS_COMPILES_PER_TICK,
  compileShipSystemsFor,
  ownShipNetworks,
  ownShipSystemsReport,
  shipSystemsAvailabilityOf,
  stepShipSystems,
  visibleShipSystemEffects,
} from "./ship-systems";
import { markShipSystemsDirty } from "./ship-systems-dirty";
import { damageComponent } from "./combat-damage";
import WREN_R4 from "./fixtures/fed-s-wren-r4.prefab.json";
import { lifecycleEvents, lifecycleTestTables } from "./lifecycle-test-tables";

function table(primary: string, indexes: Record<string, string> = {}) {
  const rows = new Map<string, any>();
  const t: any = {
    rows,
    count: () => BigInt(rows.size),
    iter: () => [...rows.values()],
    insert: (r: any) => {
      if (rows.has(r[primary])) throw Error("duplicate " + r[primary]);
      rows.set(r[primary], { ...r });
      return r;
    },
    [primary]: {
      find: (id: any) => rows.get(id) ?? null,
      update: (r: any) => {
        if (!rows.has(r[primary])) throw Error("missing");
        rows.set(r[primary], { ...r });
        return r;
      },
      delete: (id: any) => rows.delete(id),
    },
    by_revision: {
      filter: () =>
        [...rows.values()].sort((a, b) =>
          a.revision < b.revision ? -1 : a.revision > b.revision ? 1 : 0,
        ),
    },
  };
  for (const [name, column] of Object.entries(indexes))
    t[name] = {
      filter: (v: any) =>
        [...rows.values()].filter((r) =>
          v?.isEqual ? v.isEqual(r[column]) : r[column] === v,
        ),
    };
  return t;
}

const OWNER = Identity.fromString("1".repeat(64));
const GUEST = Identity.fromString("3".repeat(64));
const STRANGER = Identity.fromString("5".repeat(64));
const CATALOG = defaultPrefabComponentCatalog().revision;

function fixture() {
  const db: any = {
    ship: table("id", { by_owner: "owner" }),
    character: table("id", { by_owner: "owner" }),
    constructionInstance: table("id"),
    constructionPassengerVisit: table("characterId"),
    gameShipAccess: table("shipId"),
    shipComponentDamage: table("id", { by_ship: "shipId" }),
    shipSystemsState: table("shipId"),
    shipPowerState: table("shipId"),
    shipPowerClock: table("id"),
    shipSystemsDirty: table("shipId"),
    shipSystemsClock: table("id"),
    // Component damage also marks prefab flight dirty (FLIGHT-IFCS actuator supply); these ships
    // have no flight binding, so nothing is queued.
    constructionFlightBinding: table("shipId"),
    ...lifecycleTestTables(),
  };
  const ctx: any = { db, timestamp: { microsSinceUnixEpoch: 10_000_000n } };
  const tick = (micros = 50_000n) => {
    ctx.timestamp = {
      microsSinceUnixEpoch: ctx.timestamp.microsSinceUnixEpoch + micros,
    };
    return stepShipSystems(ctx);
  };
  const addShip = (
    shipId: string,
    document: unknown,
    catalog = CATALOG,
    owner = OWNER,
  ) => {
    db.ship.insert({ id: shipId, owner, name: shipId });
    db.constructionInstance.insert({
      id: shipId,
      owner,
      revision: 1n,
      documentJson: JSON.stringify({ prefab: { document, catalog } }),
    });
    db.gameShipAccess.insert({ shipId, owner });
  };
  return { db, ctx, tick, addShip };
}

test("server compile equals the shared estimator on all 12 prefabs, within the per-tick budget", () => {
  const { db, ctx, tick, addShip } = fixture();
  expect(PREFAB_SHIPS).toHaveLength(12);
  for (const p of PREFAB_SHIPS) {
    addShip(p.id, p);
    markShipSystemsDirty(ctx, p.id, "install");
  }
  // Bounded: two per tick, the remainder deferred and counted.
  const first = tick();
  expect(first).toMatchObject({
    compiled: SHIP_SYSTEMS_COMPILES_PER_TICK,
    remaining: 10,
  });
  expect(db.shipSystemsState.count()).toBe(2n);
  expect(db.shipSystemsClock.id.find(0)).toMatchObject({
    compiles: 2n,
    deferredTicks: 1n,
    deferredShips: 10n,
    lastQueue: 10,
  });
  for (let i = 0; i < 5; i++) tick();
  expect(db.shipSystemsDirty.count()).toBe(0n);
  const clock = db.shipSystemsClock.id.find(0);
  expect(clock).toMatchObject({
    compiles: 12n,
    changed: 12n,
    failed: 0n,
    deferredTicks: 5n,
    deferredShips: 10n + 8n + 6n + 4n + 2n,
    lastQueue: 0,
  });
  for (const p of PREFAB_SHIPS) {
    const row = db.shipSystemsState.shipId.find(p.id);
    const estimate = compilePrefabShipSystems(p, CATALOG);
    expect(row.reportJson, p.id).toBe(JSON.stringify(estimate.report));
    expect(row).toMatchObject({
      prefabId: p.id,
      prefabRevision: p.revision,
      catalog: CATALOG,
      inputHash: estimate.inputHash,
      instanceRevision: 1n,
      compileRevision: 1n,
      status: estimate.report.status,
      generationKw: estimate.report.power.generationKw,
      cruiseBalanceKw: estimate.report.power.modes.cruise.balanceKw,
      massKg: estimate.report.mass.totalKg,
    });
    expect(row.generationKw, p.id).toBeGreaterThan(0);
  }
  // An idle tick writes nothing.
  const before = JSON.stringify(db.shipSystemsClock.id.find(0), (_, v) =>
    typeof v === "bigint" ? String(v) : v,
  );
  tick();
  expect(
    JSON.stringify(db.shipSystemsClock.id.find(0), (_, v) =>
      typeof v === "bigint" ? String(v) : v,
    ),
  ).toBe(before);
});

test("the live Wren r4 (pinned catalogue) is backfilled by the stale sweep", () => {
  const { db, tick, addShip } = fixture();
  addShip("wren-r4", WREN_R4, "ship-components-v1@2");
  addShip("legacy", { not: "a prefab" });
  tick(); // sweep queues it; the same tick compiles it
  const row = db.shipSystemsState.shipId.find("wren-r4");
  expect(row).toMatchObject({
    prefabId: "fed.s.wren",
    prefabRevision: 4,
    catalog: "ship-components-v1@2",
  });
  expect(db.shipSystemsState.shipId.find("legacy")).toBeNull();
  expect(db.shipSystemsDirty.count()).toBe(0n);
  // A first compile (backfill) has no previous supply: no lifecycle events.
  expect(
    lifecycleEvents(db).filter((e) => e.kind === "component.supply_changed"),
  ).toEqual([]);
  // Nothing to do until something changes.
  tick(2_000_000n);
  expect(db.shipSystemsState.shipId.find("wren-r4").compileRevision).toBe(1n);
});

test("damage recompiles: a destroyed reactor removes its generation", () => {
  const { db, ctx, tick, addShip } = fixture();
  const wren = prefabById("fed.s.wren")!;
  addShip("wren-dmg", wren);
  tick();
  const pristine = db.shipSystemsState.shipId.find("wren-dmg");
  const reactor = wren.mounts.find((m) => m.component.startsWith("reactor."))!;
  for (let i = 0; i < 400 && !db.shipSystemsDirty.shipId.find("wren-dmg"); i++)
    damageComponent(ctx, "wren-dmg", `mount:${reactor.id}`, 5000, true);
  expect(db.shipSystemsDirty.shipId.find("wren-dmg")).toMatchObject({
    reason: "damage",
  });
  // Keep hitting until destroyed, then compile.
  for (let i = 0; i < 400; i++)
    damageComponent(ctx, "wren-dmg", `mount:${reactor.id}`, 5000, true);
  expect(
    db.shipComponentDamage.id.find(`wren-dmg|mount:${reactor.id}`).state,
  ).toBe("destroyed");
  tick();
  const damaged = db.shipSystemsState.shipId.find("wren-dmg");
  expect(damaged.compileRevision).toBe(2n);
  // S1-1: every component whose compiled power supply changed gets one supply_changed event.
  const supply = lifecycleEvents(db).filter(
    (e) => e.kind === "component.supply_changed",
  );
  expect(supply.length).toBeGreaterThan(0);
  for (const e of supply) {
    expect(e.objectId.startsWith("wren-dmg|mount:")).toBe(true);
    expect(e.frameId).toBe("wren-dmg");
    expect(e.causationId).toBe("ship-systems:wren-dmg@2");
    expect(e.payload).toMatchObject({ channel: "power", mode: "combat" });
    expect(e.payload.supply).not.toBe(e.payload.previous);
  }
  expect(new Set(supply.map((e) => e.objectId)).size).toBe(supply.length);
  expect(damaged.destroyedComponents).toBe(1);
  expect(damaged.generationKw).toBeLessThan(pristine.generationKw);
  expect(damaged.reportJson).toBe(
    JSON.stringify(
      compilePrefabShipSystems(wren, CATALOG, [
        { objectId: `mount:${reactor.id}`, performance: 0 },
      ]).report,
    ),
  );
});

test("refit recompiles: a new instance revision is picked up by the sweep", () => {
  const { db, tick, addShip } = fixture();
  addShip("wren-refit", WREN_R4, "ship-components-v1@2");
  tick();
  const r4 = db.shipSystemsState.shipId.find("wren-refit");
  const r5 = prefabById("fed.s.wren")!;
  const instance = db.constructionInstance.id.find("wren-refit");
  db.constructionInstance.id.update({
    ...instance,
    revision: 2n,
    documentJson: JSON.stringify({
      prefab: { document: r5, catalog: CATALOG },
    }),
  });
  tick(); // within the 1 s sweep period: no change yet
  expect(db.shipSystemsState.shipId.find("wren-refit").instanceRevision).toBe(
    1n,
  );
  tick(1_000_000n);
  const refit = db.shipSystemsState.shipId.find("wren-refit");
  expect(refit).toMatchObject({
    instanceRevision: 2n,
    compileRevision: 2n,
    prefabRevision: r5.revision,
    catalog: CATALOG,
  });
  expect(refit.inputHash).not.toBe(r4.inputHash);
});

test("a removed ship loses its row; compile of an unknown ship is a no-op", () => {
  const { db, ctx, tick, addShip } = fixture();
  addShip("wren-gone", prefabById("fed.s.wren")!);
  tick();
  db.ship.id.delete("wren-gone");
  tick(1_000_000n);
  expect(db.shipSystemsState.shipId.find("wren-gone")).toBeNull();
  expect(compileShipSystemsFor(ctx, "nobody")).toBe("removed");
});

test("views: owner reads summary and report; crew aboard reads summary; outsiders see effects only", () => {
  const { db, tick, addShip } = fixture();
  addShip("wren-view", prefabById("fed.s.wren")!);
  addShip("jackal", prefabById("rj.s.jackal")!, CATALOG, STRANGER);
  tick();
  tick(1_000_000n);
  db.character.insert({ id: "owner-c", owner: OWNER, shipId: "wren-view" });
  db.character.insert({ id: "guest-c", owner: GUEST, shipId: "wren-view" });
  db.character.insert({ id: "stranger-c", owner: STRANGER, shipId: "jackal" });
  db.constructionPassengerVisit.insert({
    characterId: "guest-c",
    shipId: "wren-view",
  });
  const as = (sender: Identity) => ({ db, sender }) as any;

  const owner = ownShipNetworks(as(OWNER));
  expect(owner.map((r) => [r.shipId, r.access])).toEqual([
    ["wren-view", "owner"],
  ]);
  expect(owner[0]).not.toHaveProperty("reportJson");
  expect(owner[0]).not.toHaveProperty("inputHash");
  expect(ownShipSystemsReport(as(OWNER)).map((r) => r.shipId)).toEqual([
    "wren-view",
  ]);

  // A visitor whose passenger admission is not accepted sees nothing.
  expect(ownShipNetworks(as(GUEST))).toEqual([]);
  access.crew.add("guest-c");
  const crew = ownShipNetworks(as(GUEST));
  expect(crew.map((r) => [r.shipId, r.access])).toEqual([
    ["wren-view", "crew"],
  ]);
  expect(crew[0].generationKw).toBe(owner[0].generationKw);
  // Crew never get the owner's report.
  expect(ownShipSystemsReport(as(GUEST))).toEqual([]);
  // A visit to another ship grants nothing here.
  db.character.id.update({ id: "guest-c", owner: GUEST, shipId: "jackal" });
  expect(ownShipNetworks(as(GUEST))).toEqual([]);
  access.crew.clear();

  // Strangers: only their own ship.
  expect(ownShipNetworks(as(STRANGER)).map((r) => r.shipId)).toEqual([
    "jackal",
  ]);
  expect(ownShipSystemsReport(as(STRANGER)).map((r) => r.shipId)).toEqual([
    "jackal",
  ]);

  // Inspect: discovered ships expose only their outward power effect.
  access.visible = ["jackal", "wren-view", "unknown"];
  db.shipPowerClock.insert({
    id: 0,
    legacyCutoffMicros: 1n,
    lastTick: 1n,
    admissionValid: true,
  });
  for (const shipId of ["jackal", "wren-view"]) {
    const compiled = db.shipSystemsState.shipId.find(shipId);
    db.shipPowerState.insert({
      shipId,
      instanceRevision: compiled.instanceRevision,
      inputHash: compiled.inputHash,
      tick: 1n,
      solvedMicros: 50_000n,
      generationW: 1,
      energyJ: 1,
      brownout: false,
    });
  }
  const effects = visibleShipSystemEffects(as(STRANGER));
  expect(effects).toEqual([
    { shipId: "jackal", power: "powered" },
    { shipId: "wren-view", power: "powered" },
  ]);
  db.shipPowerState.shipId.update({
    ...db.shipPowerState.shipId.find("jackal"),
    energyJ: 0,
    generationW: 0,
  });
  markShipSystemsDirty(
    { db, timestamp: { microsSinceUnixEpoch: 1n } } as any,
    "wren-view",
    "damage",
  );
  expect(visibleShipSystemEffects(as(STRANGER))).toEqual([
    { shipId: "jackal", power: "dark" },
    { shipId: "wren-view", power: "dark" },
  ]);
  access.visible = [];
});

test("availability interface: current rows only; a queued recompile or a new revision reads as unknown", () => {
  const { db, ctx, tick, addShip } = fixture();
  const wren = prefabById("fed.s.wren")!;
  addShip("wren-avail", wren);
  expect(shipSystemsAvailabilityOf(ctx, "wren-avail")).toBeUndefined();
  tick();
  const drive = wren.mounts.find((m) => m.component.startsWith("thrust-"))!;
  const reactor = wren.mounts.find((m) => m.component.startsWith("reactor."))!;
  expect(
    shipSystemsAvailabilityOf(ctx, "wren-avail")![`mount:${drive.id}`],
  ).toEqual({ power: 1, fuel: 1, performance: 1 });
  for (let i = 0; i < 400; i++)
    damageComponent(ctx, "wren-avail", `mount:${reactor.id}`, 5000, true);
  for (let i = 0; i < 400; i++)
    damageComponent(ctx, "wren-avail", "mount:battery", 5000, true);
  // Queued: callers keep their existing behaviour until the recompile lands.
  expect(shipSystemsAvailabilityOf(ctx, "wren-avail")).toBeUndefined();
  tick();
  expect(
    shipSystemsAvailabilityOf(ctx, "wren-avail")![`mount:${drive.id}`].power,
  ).toBe(0);
  const instance = db.constructionInstance.id.find("wren-avail");
  db.constructionInstance.id.update({ ...instance, revision: 2n });
  expect(shipSystemsAvailabilityOf(ctx, "wren-avail")).toBeUndefined();
});
