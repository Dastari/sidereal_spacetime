import { compileShipFlight } from "./construction-flight-compilation";
import { expect, test, vi } from "vitest";
import { Identity } from "spacetimedb";
vi.mock("spacetimedb/server", () => ({
  SenderError: class extends Error {},
  table: () => ({}),
  t: new Proxy(
    {},
    {
      get: () => () => ({
        primaryKey() {
          return this;
        },
        unique() {
          return this;
        },
      }),
    },
  ),
}));
vi.mock("./auth", () => ({
  requireGame: (ctx: { live: boolean }) => {
    if (!ctx.live) throw Error("Live game required");
  },
}));
import { insertQualifiedFlightPlan } from "./construction-flight-writer";
import { resolveShipFlightDefinition } from "./construction-flight-resolver";
import { planConstructionInstance } from "@sidereal/sim/construction-instance";
import { compileConstruction } from "@sidereal/sim/construction-transactions";
import { prefabById } from "@sidereal/content/prefabs";
import { defaultPrefabComponentCatalog } from "@sidereal/content/ship-prefab-catalog";
import {
  PREFAB_DECK_ID,
  prefabConstructionDocument,
} from "@sidereal/sim/prefab-construction";
import {
  planPrefabConstructionFlight,
  prefabFlightInput,
  prefabFlightModel,
  prefabPlacedObjectId,
} from "@sidereal/sim/prefab-flight";
function table(primary = "id") {
  const rows = new Map<string, any>();
  return {
    rows,
    insert: (r: any) => {
      if (rows.has(r[primary])) throw Error("Duplicate");
      rows.set(r[primary], { ...r });
    },
    [primary]: {
      find: (id: string) => rows.get(id),
      delete: (id: string) => rows.delete(id),
      update: (row: any) => {
        if (!rows.has(row[primary])) throw Error("Missing row");
        rows.set(row[primary], { ...row });
      },
    },
    by_system: {
      filter: (systemId: string) =>
        [...rows.values()].filter((r) => r.systemId === systemId),
    },
    by_instance: {
      filter: (instanceId: string) =>
        [...rows.values()].filter((r) => r.instanceId === instanceId),
    },
    by_ship: {
      filter: (shipId: string) =>
        [...rows.values()].filter((r) => r.shipId === shipId),
    },
  };
}
const WREN = prefabById("fed.s.wren")!;
const catalog = defaultPrefabComponentCatalog();
const snapshot = compileConstruction(
  JSON.stringify(prefabConstructionDocument(WREN, catalog)),
);
const model = prefabFlightModel(WREN, catalog);
function fixture() {
  let n = 0;
  const uuid = () =>
    `00000000-0000-4000-8000-${(++n).toString(16).padStart(12, "0")}`;
  const owner = Identity.fromString("1".repeat(64));
  const p = planConstructionInstance(
    snapshot,
    {
      blueprintRevisionId: `trusted-prefab:fed.s.wren:r${WREN.revision}`,
      expectedBlueprintSha256: snapshot.sha256,
      sourceDeckId: PREFAB_DECK_ID,
      bodyRadiusM: 0.3,
      bodyHeightM: 1.8,
      perimeterHalfWidthM: 0,
      partitionHalfWidthM: 0,
      objectCollisionBindings: [],
    },
    uuid,
  );
  const db: any = {
    constructionCargoAssembly: table("containerId"),
    instanceInventoryBinding: table("placedObjectId"),
    character: table(),
    constructionInstance: table(),
    ship: table(),
    station: table(),
    shipWorldMotion: table("shipId"),
    inventoryItem: table(),
    inventoryContainer: table(),
    interactionObject: table(),
    constructionFlightBinding: table("shipId"),
    constructionFlightCompiled: table("shipId"),
    constructionFlightDirty: table("shipId"),
    constructionFlightFitting: table(),
    constructionFlightStation: table("stationId"),
    constructionFlightReceipt: table(),
  };
  const instance = {
    id: p.instanceId,
    owner,
    workspaceId: "workspace",
    revision: 1n,
    blueprintSha256: p.blueprintSha256,
    documentJson: JSON.stringify(p.document),
    idMapJson: JSON.stringify(p.mappings),
    spawnDeckId: p.spawn.deckId,
    name: p.document.layout.name,
  };
  db.constructionInstance.insert(instance);
  db.ship.insert({ id: "original", owner, revision: 8n });
  db.inventoryItem.insert({ id: "pistol", containerId: "pockets" });
  const ctx: any = {
    db,
    sender: owner,
    timestamp: { microsSinceUnixEpoch: 1n },
    newUuidV4: () => ({ toString: uuid }),
    live: true,
  };
  /** Trusted prefab installation (as installPrefabShip does), dormant until activated. */
  const install = () =>
    insertQualifiedFlightPlan(
      ctx,
      planPrefabConstructionFlight(
        instance,
        { systemId: "system", x: 50, y: 0, serverTick: 42n },
        uuid,
      ),
    );
  const reader = {
    binding: (id: string) => db.constructionFlightBinding.shipId.find(id),
    constructionInstanceExists: (id: string) =>
      !!db.constructionInstance.id.find(id),
    currentInstanceRevision: (id: string) =>
      db.constructionInstance.id.find(id)?.revision,
    fittings: (id: string) => db.constructionFlightFitting.by_ship.filter(id),
    compiled: (id: string) => {
      if (!db.constructionFlightBinding.shipId.find(id)) return undefined;
      compileShipFlight(db, id, () =>
        prefabFlightInput(
          model,
          (sourceId) => prefabPlacedObjectId(id, sourceId),
          {
            fittings: db.constructionFlightFitting.by_ship
              .filter(id)
              .map(
                ({
                  id,
                  placedObjectId,
                  definitionId,
                  definitionRevision,
                  installed,
                  powered,
                  availability,
                }: any) => ({
                  id,
                  placedObjectId,
                  definitionId,
                  definitionRevision,
                  installed,
                  powered,
                  availability,
                }),
              ),
          },
        ),
      );
      return db.constructionFlightCompiled.shipId.find(id);
    },
    dirty: () => false,
  };
  return { ctx, db, p, install, reader };
}
test("trusted installation inserts fresh bound records without legacy entity rewrites", () => {
  const f = fixture();
  f.install();
  expect(f.db.ship.rows.size).toBe(2);
  expect(f.db.ship.id.find("original").revision).toBe(8n);
  expect(f.db.inventoryItem.id.find("pistol").containerId).toBe("pockets");
  const binding = f.db.constructionFlightBinding.shipId.find(f.p.instanceId);
  expect(f.db.constructionFlightFitting.rows.size).toBe(model.fittings.length);
  expect(f.db.station.id.find(binding.stationId).operational).toBe(false);
  expect(f.db.shipWorldMotion.shipId.find(f.p.instanceId).serverTick).toBe(42n);
  expect(
    f.db.constructionFlightStation.stationId.find(binding.stationId).deckId,
  ).toBe(f.p.spawn.deckId);
  expect(() => f.install()).toThrow("already installed");
  expect(f.db.constructionFlightFitting.rows.size).toBe(model.fittings.length);
});
test("foreign owner cannot install; no allocation occurs", () => {
  const f = fixture();
  f.ctx.sender = Identity.fromString("2".repeat(64));
  expect(() => f.install()).toThrow("Owned qualified flight instance");
  expect(f.db.ship.rows.size).toBe(1);
  expect(f.db.constructionFlightFitting.rows.size).toBe(0);
});
test("resolver fails closed on missing bound instances and holds dormant installation", () => {
  const f = fixture();
  expect(resolveShipFlightDefinition(f.reader, f.p.instanceId).status).toBe(
    "invalid",
  );
  expect(resolveShipFlightDefinition(f.reader, "original").status).toBe(
    "invalid",
  );
  f.install();
  expect(resolveShipFlightDefinition(f.reader, f.p.instanceId).status).toBe(
    "dormant",
  );
});
test("active resolver feeds exact approved force definitions with fresh runtime telemetry IDs", () => {
  const f = fixture();
  f.install();
  f.db.constructionFlightBinding.shipId.find(f.p.instanceId).lifecycle =
    "active";
  const result = resolveShipFlightDefinition(f.reader, f.p.instanceId);
  expect(result.status).toBe("ready");
  if (result.status !== "ready") throw Error("unavailable");
  expect(result.kind).toBe("construction");
  const actuators = model.fittings.filter((x) => x.role === "actuator");
  expect(result.actuators).toHaveLength(actuators.length);
  const parts = new Map(model.parts.map((p) => [p.sourceId, p]));
  const definitions = new Map(model.catalog.definitions.map((d) => [d.id, d]));
  for (const a of result.actuators) {
    expect(a.id).not.toBe(a.sourceDeviceId);
    const part = parts.get(a.sourceDeviceId)!;
    const definition = definitions.get(part.definitionId) as {
      maxThrustN: number;
    };
    expect(a.maxThrustN).toBe(definition.maxThrustN);
    expect(a.placedObjectId).toBe(
      prefabPlacedObjectId(f.p.instanceId, a.sourceDeviceId),
    );
  }
  const first = result.actuators[0];
  f.db.constructionFlightFitting.id.find(first.id).powered = false;
  const disabled = resolveShipFlightDefinition(f.reader, f.p.instanceId);
  if (disabled.status !== "ready") throw Error("unavailable");
  expect(disabled.actuators[0].availability).toBe(0);
  f.db.constructionFlightFitting.id.find(disabled.computer.id).powered = false;
  const computerOff = resolveShipFlightDefinition(f.reader, f.p.instanceId);
  if (computerOff.status !== "ready") throw Error("unavailable");
  expect(computerOff.computer.powered).toBe(false);
});
test("refit, changed definition, missing or extra fittings never fall back to stock thrust", () => {
  for (const mutate of [
    (f: ReturnType<typeof fixture>) =>
      f.db.constructionInstance.id.find(f.p.instanceId).revision++,
    (f: ReturnType<typeof fixture>) =>
      (f.db.constructionFlightBinding.shipId.find(
        f.p.instanceId,
      ).definitionSha256 = "bad"),
    (f: ReturnType<typeof fixture>) =>
      f.db.constructionFlightFitting.insert({
        ...f.db.constructionFlightFitting.rows.values().next().value,
        id: "extra",
      }),
    (f: ReturnType<typeof fixture>) =>
      (f.db.constructionFlightFitting.rows.values().next().value.availability =
        NaN),
    // Only trusted prefab bindings resolve; the retired Wayfarer pin fails closed.
    (f: ReturnType<typeof fixture>) =>
      (f.db.constructionFlightBinding.shipId.find(f.p.instanceId).definitionId =
        "qualified-wayfarer-lab-flight-v1"),
  ]) {
    const f = fixture();
    f.install();
    f.db.constructionFlightBinding.shipId.find(f.p.instanceId).lifecycle =
      "active";
    mutate(f);
    const failed = resolveShipFlightDefinition(f.reader, f.p.instanceId);
    expect(failed.status).not.toBe("ready");
    if (failed.status !== "invalid") expect(failed.actuators).toEqual([]);
  }
});

test("resolved fitting IDs drive existing IFCS solver and disabled authority produces no thrust", async () => {
  const { stepSystemSpace } = await import("@sidereal/sim/system-space");
  const f = fixture();
  f.install();
  f.db.constructionFlightBinding.shipId.find(f.p.instanceId).lifecycle =
    "active";
  const d = resolveShipFlightDefinition(f.reader, f.p.instanceId);
  if (d.status !== "ready") throw Error("Unavailable definition");
  const body = {
    ...d.hull,
    id: f.p.instanceId,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    heading: 0,
    omega: 0,
    massKg: d.mass.massKg,
    inertia: d.mass.inertiaKgM2,
  };
  const control = {
    bodyId: body.id,
    enabled: true,
    intent: { throttle: 1, turn: 0 },
    mass: d.mass,
    actuators: d.actuators,
    profile: d.profile,
    maxForwardSpeed: d.speed.forward,
    maxReverseSpeed: d.speed.reverse,
  };
  const moving = stepSystemSpace([body], [control]);
  expect(moving.exhausted).toBe(false);
  expect(moving.bodies[0].vy).toBeGreaterThan(0);
  expect(moving.commands[0].actuators.map((a) => a.id).sort()).toEqual(
    d.actuators.map((a) => a.id).sort(),
  );
  const disabled = stepSystemSpace([body], [{ ...control, enabled: false }]);
  expect(disabled.changedBodyIds).toEqual([]);
  expect(disabled.commands[0].actuators.every((a) => a.throttle === 0)).toBe(
    true,
  );
});

test("dormant installed ships retain their physical definition and cannot stall another ship's contact island", async () => {
  const { stepSystemSpace } = await import("@sidereal/sim/system-space");
  const f = fixture();
  f.install();
  const d = resolveShipFlightDefinition(f.reader, f.p.instanceId);
  if (d.status === "invalid") throw Error(d.reason);
  expect(d.status).toBe("dormant");
  expect(d.computer.powered).toBe(false);
  const a = {
    ...d.hull,
    id: f.p.instanceId,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    heading: 0,
    omega: 0,
    massKg: d.mass.massKg,
    inertia: d.mass.inertiaKgM2,
  };
  const b = { ...a, id: "another", x: 100, vx: 1 };
  const step = stepSystemSpace([a, b]);
  expect(step.exhausted).toBe(false);
  expect(step.changedBodyIds).toEqual(["another"]);
  expect(step.bodies.find((x) => x.id === "another")!.x).toBeCloseTo(100.05);
});
