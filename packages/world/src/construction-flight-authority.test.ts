import { readFileSync } from "node:fs";
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
vi.mock("./construction", () => ({
  requireGrant: (
    ctx: { grants: Set<string> },
    _workspace: string,
    capability: string,
  ) => {
    if (!ctx.grants.has(capability)) throw Error("Current grant required");
  },
}));
import { installConstructionFlightAuthority } from "./construction-flight-authority";
import { resolveShipFlightDefinition } from "./construction-flight-resolver";
import {
  createWayfarerConversionCandidate,
  type WayfarerPinnedInputs,
} from "../../sim/src/wayfarer-conversion-candidate";
import { WAYFARER_CONVERSION_PIN as PIN } from "../../content/src/wayfarer-conversion-candidate";
import { planConstructionInstance } from "../../sim/src/construction-instance";
import { qualifiedWayfarerWalkingBindings } from "../../sim/src/wayfarer-walking-bindings";
import { LAB_FLIGHT_ACTUATORS } from "@sidereal/content/flight";
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
      update: (row: any) => {
        if (!rows.has(row[primary])) throw Error("Missing row");
        rows.set(row[primary], { ...row });
      },
    },
    by_ship: {
      filter: (shipId: string) =>
        [...rows.values()].filter((r) => r.shipId === shipId),
    },
  };
}
const snapshot = createWayfarerConversionCandidate(
  Object.fromEntries(
    Object.keys(PIN.sources).map((p) => [p, readFileSync(p, "utf8")]),
  ) as WayfarerPinnedInputs,
).snapshot;
function fixture() {
  let n = 0;
  const uuid = () =>
    `00000000-0000-4000-8000-${(++n).toString(16).padStart(12, "0")}`;
  const owner = Identity.fromString("1".repeat(64));
  const p = planConstructionInstance(
    snapshot,
    {
      blueprintRevisionId: "b",
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
  const db: any = {
    constructionInstance: table(),
    ship: table(),
    station: table(),
    shipWorldMotion: table("shipId"),
    inventoryItem: table(),
    inventoryContainer: table(),
    interactionObject: table(),
    constructionFlightBinding: table("shipId"),
    constructionFlightFitting: table(),
    constructionFlightStation: table("stationId"),
    constructionFlightReceipt: table(),
  };
  db.constructionInstance.insert({
    id: p.instanceId,
    owner,
    workspaceId: "workspace",
    revision: 1n,
    blueprintSha256: p.blueprintSha256,
    documentJson: JSON.stringify(p.document),
    idMapJson: JSON.stringify(p.mappings),
    spawnDeckId: p.spawn.deckId,
    name: p.document.layout.name,
  });
  db.ship.insert({ id: "original", owner, revision: 8n });
  db.inventoryItem.insert({ id: "pistol", containerId: "pockets" });
  const ctx: any = {
    db,
    sender: owner,
    newUuidV4: () => ({ toString: uuid }),
    live: true,
    grants: new Set(["draft.read", "instance.spawn"]),
  };
  const args = {
    instanceId: p.instanceId,
    expectedInstanceRevision: 1n,
    operationId: "flight",
  };
  const hooks = {
    reserveBerth: () => ({ systemId: "system", x: 50, y: 0, serverTick: 42n }),
  };
  const reader = {
    binding: (id: string) => db.constructionFlightBinding.shipId.find(id),
    constructionInstanceExists: (id: string) =>
      !!db.constructionInstance.id.find(id),
    currentInstanceRevision: (id: string) =>
      db.constructionInstance.id.find(id)?.revision,
    fittings: (id: string) => db.constructionFlightFitting.by_ship.filter(id),
  };
  return { ctx, db, p, args, hooks, reader };
}
test("actual table adapter inserts fresh bound records without legacy entity rewrites", () => {
  const f = fixture(),
    result = installConstructionFlightAuthority(f.ctx, f.args, f.hooks);
  expect(f.db.ship.rows.size).toBe(2);
  expect(f.db.ship.id.find("original").revision).toBe(8n);
  expect(f.db.inventoryItem.id.find("pistol").containerId).toBe("pockets");
  expect(f.db.constructionFlightFitting.rows.size).toBe(10);
  expect(f.db.station.id.find(result.stationId).operational).toBe(false);
  expect(f.db.shipWorldMotion.shipId.find(result.shipId).serverTick).toBe(42n);
  expect(
    f.db.constructionFlightStation.stationId.find(result.stationId).deckId,
  ).toBe(f.p.spawn.deckId);
  expect(installConstructionFlightAuthority(f.ctx, f.args, f.hooks)).toEqual(
    result,
  );
  expect(f.db.constructionFlightFitting.rows.size).toBe(10);
  f.ctx.grants.delete("draft.read");
  expect(() =>
    installConstructionFlightAuthority(f.ctx, f.args, f.hooks),
  ).toThrow("grant");
});
test("foreign owner cannot install even with workspace capability; no allocation occurs", () => {
  const f = fixture();
  f.ctx.sender = Identity.fromString("2".repeat(64));
  expect(() =>
    installConstructionFlightAuthority(f.ctx, f.args, f.hooks),
  ).toThrow("Accessible");
  expect(f.db.ship.rows.size).toBe(1);
  expect(f.db.constructionFlightFitting.rows.size).toBe(0);
});
test("resolver fails closed on missing bound instances and holds dormant installation", () => {
  const f = fixture();
  expect(resolveShipFlightDefinition(f.reader, f.p.instanceId).status).toBe(
    "invalid",
  );
  expect(resolveShipFlightDefinition(f.reader, "original").status).toBe(
    "ready",
  );
  installConstructionFlightAuthority(f.ctx, f.args, f.hooks);
  expect(resolveShipFlightDefinition(f.reader, f.p.instanceId).status).toBe(
    "dormant",
  );
});
test("active resolver feeds exact approved force definitions with fresh runtime telemetry IDs", () => {
  const f = fixture();
  installConstructionFlightAuthority(f.ctx, f.args, f.hooks);
  f.db.constructionFlightBinding.shipId.find(f.p.instanceId).lifecycle =
    "active";
  const result = resolveShipFlightDefinition(f.reader, f.p.instanceId);
  expect(result.status).toBe("ready");
  if (result.status !== "ready") throw Error("unavailable");
  expect(result.kind).toBe("construction");
  expect(result.actuators).toHaveLength(9);
  result.actuators.forEach((a, i) => {
    expect(a.id).not.toBe(LAB_FLIGHT_ACTUATORS[i].id);
    expect(a.maxThrustN).toBe(LAB_FLIGHT_ACTUATORS[i].maxThrustN);
    expect(a.x).toBe(LAB_FLIGHT_ACTUATORS[i].x);
  });
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
      f.db.constructionFlightFitting.rows.delete(
        [...f.db.constructionFlightFitting.rows.keys()][0],
      ),
    (f: ReturnType<typeof fixture>) =>
      f.db.constructionFlightFitting.insert({
        ...f.db.constructionFlightFitting.rows.values().next().value,
        id: "extra",
      }),
    (f: ReturnType<typeof fixture>) =>
      (f.db.constructionFlightFitting.rows.values().next().value.availability =
        NaN),
  ]) {
    const f = fixture();
    installConstructionFlightAuthority(f.ctx, f.args, f.hooks);
    f.db.constructionFlightBinding.shipId.find(f.p.instanceId).lifecycle =
      "active";
    mutate(f);
    expect(resolveShipFlightDefinition(f.reader, f.p.instanceId).status).toBe(
      "invalid",
    );
  }
});

test("resolved fitting IDs drive existing IFCS solver and disabled authority produces no thrust", async () => {
  const { stepSystemSpace } = await import("../../sim/src/system-space");
  const f = fixture();
  installConstructionFlightAuthority(f.ctx, f.args, f.hooks);
  f.db.constructionFlightBinding.shipId.find(f.p.instanceId).lifecycle =
    "active";
  const d = resolveShipFlightDefinition(f.reader, f.p.instanceId);
  if (d.status !== "ready") throw Error("Unavailable definition");
  const body = {
    id: f.p.instanceId,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    heading: 0,
    omega: 0,
    massKg: d.mass.massKg,
    inertia: d.mass.inertiaKgM2,
    ...d.hull,
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
  const { stepSystemSpace } = await import("../../sim/src/system-space");
  const f = fixture();
  installConstructionFlightAuthority(f.ctx, f.args, f.hooks);
  const d = resolveShipFlightDefinition(f.reader, f.p.instanceId);
  if (d.status === "invalid") throw Error(d.reason);
  expect(d.status).toBe("dormant");
  expect(d.computer.powered).toBe(false);
  const a = {
    id: f.p.instanceId,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    heading: 0,
    omega: 0,
    massKg: d.mass.massKg,
    inertia: d.mass.inertiaKgM2,
    ...d.hull,
  };
  const b = { ...a, id: "another", x: 100, vx: 1 };
  const step = stepSystemSpace([a, b]);
  expect(step.exhausted).toBe(false);
  expect(step.changedBodyIds).toEqual(["another"]);
  expect(step.bodies.find((x) => x.id === "another")!.x).toBeCloseTo(100.05);
});

test("explicit activation qualifies native station but does not board, seat or change original ships", async () => {
  const { activateConstructionFlight } =
    await import("./construction-flight-activation");
  const f = fixture();
  installConstructionFlightAuthority(f.ctx, f.args, f.hooks);
  f.db.constructionDeck = table();
  f.db.constructionDeck.insert({
    id: f.p.spawn.deckId,
    instanceId: f.p.instanceId,
    elevation: 0,
  });
  f.db.worldSystem = table();
  f.db.worldSystem.insert({ id: "system" });
  f.db.constructionDoor = { by_deck: { filter: () => [] } };
  const actor = { shipId: "original", item: "pistol" };
  const args = {
    shipId: f.p.instanceId,
    expectedRevision: 1n,
    operationId: "activate",
  };
  activateConstructionFlight(f.ctx, args);
  const b = f.db.constructionFlightBinding.shipId.find(f.p.instanceId);
  expect(b.lifecycle).toBe("active");
  expect(b.revision).toBe(2n);
  expect(f.db.station.id.find(b.stationId).operational).toBe(true);
  expect(f.db.station.id.find(b.stationId).occupantId).toBeUndefined();
  expect(actor).toEqual({ shipId: "original", item: "pistol" });
  expect(f.db.ship.id.find("original").revision).toBe(8n);
  activateConstructionFlight(f.ctx, args);
  expect(
    f.db.constructionFlightBinding.shipId.find(f.p.instanceId).revision,
  ).toBe(2n);
  f.ctx.grants.delete("draft.read");
  expect(() => activateConstructionFlight(f.ctx, args)).toThrow("grant");
});
