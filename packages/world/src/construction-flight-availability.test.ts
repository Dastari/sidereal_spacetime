import { expect, test, vi } from "vitest";
vi.mock("spacetimedb/server", () => ({ Range: class {} }));
vi.mock("./auth", () => ({
  requireGame: (ctx: { live: boolean }) => {
    if (!ctx.live) throw Error("Live game required");
  },
}));
import { Identity } from "spacetimedb";
import {
  changeFlightFittingDisposition,
  queueFlightDamage,
  consumeFlightDamage,
} from "./construction-flight-availability";
import { compileFlightDefinition } from "@sidereal/sim/flight-definition";
import { prefabById } from "@sidereal/content/prefabs";
import { defaultPrefabComponentCatalog } from "@sidereal/content/ship-prefab-catalog";
import { prefabConstructionDocument } from "@sidereal/sim/prefab-construction";
import {
  prefabFlightInput,
  prefabFlightModel,
  prefabPlacedObjectId,
} from "@sidereal/sim/prefab-flight";
const WREN = prefabById("fed.s.wren")!;
const catalog = defaultPrefabComponentCatalog();
const source = JSON.stringify(prefabConstructionDocument(WREN, catalog));
const model = prefabFlightModel(WREN, catalog);
const drive = model.fittings.find((x) => x.role === "actuator")!;
const PREFAB_SHA = "b".repeat(64);
function table(primary = "id") {
  const rows = new Map<string, any>();
  return {
    rows,
    count: () => BigInt(rows.size),
    insert: (r: any) => {
      if (rows.has(r[primary])) throw Error("duplicate");
      rows.set(r[primary], r);
    },
    [primary]: {
      find: (id: string) => rows.get(id),
      update: (r: any) => {
        if (!rows.has(r[primary])) throw Error("missing");
        rows.set(r[primary], r);
      },
      delete: (id: string) => rows.delete(id),
    },
    by_created: {
      filter: () =>
        [...rows.values()].sort((a, b) =>
          Number(a.createdMicros - b.createdMicros),
        ),
    },
  } as any;
}
function fixture() {
  const owner = Identity.fromString("1".repeat(64)),
    server = Identity.fromString("2".repeat(64));
  const placedObjectId = prefabPlacedObjectId("ship", drive.sourceId);
  const db: any = {
    constructionFlightBinding: table("shipId"),
    constructionInstance: table(),
    constructionFlightFitting: table(),
    constructionFlightReceipt: table(),
    constructionFlightDirty: table("shipId"),
    constructionFlightDamageEvent: table(),
  };
  db.constructionFlightBinding.insert({
    shipId: "ship",
    instanceId: "ship",
    owner,
    lifecycle: "active",
    instanceRevision: 1n,
    blueprintSha256: PREFAB_SHA,
    revision: 1n,
    stationId: "seat",
  });
  db.constructionInstance.insert({
    id: "ship",
    owner,
    revision: 1n,
    blueprintSha256: PREFAB_SHA,
    documentJson: source,
    idMapJson: "{}",
  });
  db.constructionFlightFitting.insert({
    id: "engine",
    shipId: "ship",
    placedObjectId,
    sourceDeviceId: drive.sourceId,
    definitionId: drive.definitionId,
    definitionRevision: drive.definitionRevision,
    kind: "actuator",
    installed: true,
    powered: true,
    availability: 1,
    revision: 1n,
  });
  const ctx: any = {
    db,
    sender: owner,
    databaseIdentity: server,
    live: true,
    timestamp: { microsSinceUnixEpoch: 10n },
  };
  const args = {
    shipId: "ship",
    fittingId: "engine",
    action: "remove",
    expectedRevision: 1n,
    expectedFittingRevision: 1n,
    operationId: "edit",
  };
  const event = {
    id: "impact",
    shipId: "ship",
    fittingId: "engine",
    expectedFittingRevision: 1n,
    lossFraction: 0.5,
    sourceEventId: "server-impact",
  };
  const compiled = () => {
    const f = db.constructionFlightFitting.id.find("engine");
    const {
      id,
      placedObjectId,
      definitionId,
      definitionRevision,
      installed,
      powered,
      availability,
    } = f;
    const c = compileFlightDefinition(
      prefabFlightInput(
        model,
        (sourceId) => prefabPlacedObjectId("ship", sourceId),
        {
          fittings: [
            {
              id,
              placedObjectId,
              definitionId,
              definitionRevision,
              installed,
              powered,
              availability,
            },
          ],
        },
      ),
    );
    if (c.status !== "ready") throw Error(c.reason);
    return c;
  };
  return { ctx, db, args, event, server, compiled };
}
test("fitting disposition fails closed for prefab ships until they are qualified", () => {
  const f = fixture(),
    before = structuredClone(f.db.constructionFlightFitting.id.find("engine"));
  for (const action of ["remove", "detach"])
    expect(() =>
      changeFlightFittingDisposition(f.ctx, { ...f.args, action }),
    ).toThrow("Current active qualified flight fitting required");
  expect(f.db.constructionFlightFitting.id.find("engine")).toEqual(before);
  expect(f.db.constructionFlightReceipt.rows.size).toBe(0);
  expect(f.db.constructionFlightDirty.rows.size).toBe(0);
});
test("only server events can cause damage, with replay conservation and consumption revision checks", () => {
  const f = fixture(),
    before = f.compiled();
  expect(() => queueFlightDamage(f.ctx, f.event)).toThrow("Server");
  const ctx = { ...f.ctx, sender: f.server };
  queueFlightDamage(ctx, f.event);
  const reordered = Object.fromEntries(
    Object.entries(f.event).reverse(),
  ) as typeof f.event;
  queueFlightDamage(ctx, reordered);
  queueFlightDamage(ctx, f.event);
  expect(f.db.constructionFlightDamageEvent.rows.size).toBe(1);
  expect(() => consumeFlightDamage(f.ctx)).toThrow("Server");
  expect(consumeFlightDamage(ctx)).toBe(1);
  expect(f.compiled().mass.massKg).toBe(before.mass.massKg);
  expect(f.compiled().actuators[0].availability).toBe(0.5);
  queueFlightDamage(ctx, f.event);
  expect(consumeFlightDamage(ctx)).toBe(0);
  queueFlightDamage(ctx, reordered);
  expect(() =>
    queueFlightDamage(ctx, { ...reordered, lossFraction: 0.25 }),
  ).toThrow("payload conflict");
  queueFlightDamage(ctx, { ...f.event, id: "stale" });
  consumeFlightDamage(ctx);
  expect(f.compiled().actuators[0].availability).toBe(0.5);
  expect(f.db.constructionFlightReceipt.rows.size).toBe(2);
});
test("damage cannot turn invalid existing availability into committed force state", () => {
  for (const availability of [NaN, -1, 2]) {
    const f = fixture(),
      ctx = { ...f.ctx, sender: f.server };
    f.db.constructionFlightFitting.id.update({
      ...f.db.constructionFlightFitting.id.find("engine"),
      availability,
    });
    queueFlightDamage(ctx, f.event);
    consumeFlightDamage(ctx);
    expect(f.db.constructionFlightFitting.id.find("engine").revision).toBe(1n);
    expect(f.db.constructionFlightDirty.rows.size).toBe(0);
  }
});
test("damage work is bounded and a fitting change before consumption cannot redirect damage", () => {
  const f = fixture(),
    ctx = { ...f.ctx, sender: f.server };
  for (let i = 0; i < 10; i++)
    queueFlightDamage(ctx, { ...f.event, id: String(i) });
  // A concurrent authoritative fitting change (removal) advances the fitting revision.
  f.db.constructionFlightFitting.id.update({
    ...f.db.constructionFlightFitting.id.find("engine"),
    installed: false,
    revision: 2n,
  });
  expect(consumeFlightDamage(ctx)).toBe(8);
  expect(f.db.constructionFlightDamageEvent.rows.size).toBe(2);
  expect(f.db.constructionFlightFitting.id.find("engine").revision).toBe(2n);
  expect(consumeFlightDamage(ctx)).toBe(2);
  expect(f.db.constructionFlightFitting.id.find("engine").installed).toBe(
    false,
  );
});
