import { WAYFARER_STARTER } from "@sidereal/content/wayfarer-starter";
import { LAB_FLIGHT_ACTUATORS } from "@sidereal/content/flight";
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
vi.mock("./auth", () => ({
  requireGame: (ctx: { live: boolean }) => {
    if (!ctx.live) throw Error("Live game required");
  },
  canReadGame: (ctx: { live: boolean }) => ctx.live,
}));
import {
  createWayfarerStarterAuthority,
  type WayfarerStarterContext,
} from "./wayfarer-starter-authority";
import { ownedGameShipAccess } from "./game-ship-access-authority";
import {
  issueWayfarerPersonalKit,
  preserveWayfarerStarterKit,
} from "./wayfarer-personal-kit";

type Row = Record<string, any>;
function baseFixture() {
  const tables = new Map<string, Row[]>();
  const primary: Record<string, string> = {
    wayfarerRefitReceipt: "shipId",
    personalStarterReceipt: "owner",
    gameShipAccess: "shipId",
    shipWorldMotion: "shipId",
    bodyWorldMotion: "bodyId",
    worldAdmission: "characterId",
    constructionFlightBinding: "shipId",
    constructionFlightStation: "stationId",
    constructionLocation: "characterId",
    input: "characterId",
    inventoryState: "characterId",
    inventoryContainerScope: "containerId",
    inventoryItemMembership: "itemId",
    instanceInventoryBinding: "placedObjectId",
    constructionInteractionBinding: "objectId",
  };
  const field: Record<string, string> = {
    by_root: "rootContainerId",
    by_owner: "owner",
    by_system: "systemId",
    by_ship: "shipId",
    by_deck: "deckId",
    by_instance: "instanceId",
    by_character: "characterId",
    by_principal: "principal",
  };
  const key = (v: unknown) => String(v);
  const db = new Proxy({} as Record<string, any>, {
    get(target, name: string) {
      if (target[name]) return target[name];
      const rows: Row[] = [];
      tables.set(name, rows);
      const pk = primary[name] ?? "id";
      target[name] = new Proxy(
        {
          rows,
          iter: () => rows.values(),
          insert: (row: Row) => {
            if (rows.some((r) => key(r[pk]) === key(row[pk])))
              throw Error("Duplicate row:" + name);
            rows.push({ ...row });
            return row;
          },
        },
        {
          get(t, index: string) {
            if (index in t) return (t as any)[index];
            const column = field[index] ?? index;
            return {
              find: (value: unknown) =>
                rows.find((r) => key(r[column]) === key(value)),
              filter: (value: unknown) =>
                rows.filter((r) => key(r[column]) === key(value)),
              update: (row: Row) => {
                const at = rows.findIndex((r) => key(r[pk]) === key(row[pk]));
                if (at < 0) throw Error("Missing row");
                rows[at] = { ...row };
              },
              delete: (value: unknown) => {
                const at = rows.findIndex((r) => key(r[column]) === key(value));
                if (at >= 0) rows.splice(at, 1);
              },
            };
          },
        },
      );
      return target[name];
    },
  });
  let sequence = 1;
  const owner = Identity.fromString("04".repeat(32));
  const raw = {
    db,
    sender: owner,
    live: true,
    timestamp: { microsSinceUnixEpoch: 123000000n },
    newUuidV4: () => ({
      toString: () =>
        `44444444-4444-4444-8444-${(sequence++).toString(16).padStart(12, "0")}`,
    }),
  };
  db.authSession.insert({
    id: "session",
    owner,
    game: true,
    expiresMicros: 999999999999n,
  });
  const ctx = raw as unknown as WayfarerStarterContext;
  const snapshot = () =>
    JSON.stringify([...tables], (_, v) =>
      typeof v === "bigint" ? v.toString() : v,
    );
  return { ctx, raw, db, tables, snapshot };
}

import {
  refitExistingWayfarer,
  ownWayfarerRefitOffer,
  type RefitContext,
} from "./wayfarer-refit-authority";
import {
  transferWayfarerLiquid,
  type LiquidContext,
} from "./wayfarer-liquid-transfer";
import { addWayfarerRefitCollision } from "./wayfarer-refit-collision";
import { constructionCollision } from "./construction-doors";
import { canOccupyDeck } from "@sidereal/sim/construction-collision";

function legacyFixture() {
  const f = baseFixture(),
    result = createWayfarerStarterAuthority(f.ctx, "Legacy", WAYFARER_STARTER);
  const actor = f.db.character.id.find(result.actor.id),
    ship = f.db.ship.id.find(actor.shipId),
    station = f.db.station.shipId.find(ship.id),
    instance = f.db.constructionInstance.id.find(ship.id),
    mappings = JSON.parse(instance.idMapJson);
  const reverse = new Map(
    mappings.objects.map((m: Row) => [m.instanceId, m.sourceId]),
  );
  for (const b of f.db.instanceInventoryBinding.rows) {
    const c = f.db.inventoryContainer.id.find(b.containerId);
    f.db.inventoryContainer.id.update({
      ...c,
      characterId: actor.id,
      width: 6,
      height: 6,
    });
    f.db.storageBinding.insert({
      id: actor.id + ":" + reverse.get(b.placedObjectId),
      characterId: actor.id,
      containerId: c.id,
      placementId: reverse.get(b.placedObjectId),
    });
  }
  for (const o of [...f.db.interactionObject.rows])
    f.db.interactionObject.id.update({
      ...o,
      placementId: reverse.get(o.placementId),
    });
  for (const name of [
    "personalStarterReceipt",
    "gameShipAccess",
    "constructionInstance",
    "constructionDeck",
    "constructionDoor",
    "constructionLocation",
    "constructionFlightBinding",
    "constructionFlightFitting",
    "constructionFlightStation",
    "constructionInteractionBinding",
    "instanceInventoryBinding",
    "inventoryContainerScope",
    "inventoryItemMembership",
  ])
    f.db[name].rows.length = 0;
  const fuelId = "66666666-6666-4666-8666-666666666666";
  f.db.inventoryContainer.insert({
    id: fuelId,
    characterId: actor.id,
    parentItemId: "",
    carried: false,
    kind: "liquid",
    name: "Engineering fuel tank",
    width: 0,
    height: 0,
    maxMassKg: 80,
    capacityLitres: 100,
    amountLitres: 20,
    liquidType: "fuel",
    shipId: ship.id,
    localX: -3.1,
    localY: -6,
  });
  const gun = f.db.inventoryItem.rows.find(
      (i: Row) => i.definitionId === "carbine",
    ),
    root = f.db.inventoryContainer.rows.find(
      (c: Row) => c.name === "Storage supply crate",
    );
  f.db.inventoryItem.id.update({
    ...gun,
    containerId: root.id,
    x: 0,
    y: 0,
    equipmentSlot: "",
  });
  const ctx = f.raw as unknown as RefitContext;
  const args = () => {
    const offer = ownWayfarerRefitOffer(ctx)[0]!;
    if (offer.status !== "ready") throw Error(offer.status);
    return {
      shipId: ship.id,
      expectedShipRevision: offer.expectedShipRevision,
      expectedInventoryRevision: offer.expectedInventoryRevision,
      fingerprint: offer.fingerprint,
      operationId: "77777777-7777-4777-8777-777777777777",
    };
  };
  return {
    ...f,
    ctx,
    actor,
    ship,
    station,
    fuelId,
    gunId: gun.id,
    rootId: root.id,
    args,
  };
}

test("actual refit writes preserve old ship/station/item/root UUIDs, world pose and gameplay state", () => {
  const f = legacyFixture(),
    items = f.db.inventoryItem.rows.map((i: Row) => ({ ...i })),
    containers = f.db.inventoryContainer.rows.map((c: Row) => ({ ...c })),
    interactions = f.db.interactionObject.rows.map((o: Row) => ({ ...o })),
    args = f.args();
  refitExistingWayfarer(f.ctx, args);
  expect(f.db.ship.rows).toHaveLength(1);
  expect(f.db.station.rows).toHaveLength(1);
  expect(f.db.station.rows[0].id).toBe(f.station.id);
  expect(f.db.character.rows[0]).toEqual(f.actor);
  expect(f.db.ship.rows[0]).toEqual({
    ...f.ship,
    revision: f.ship.revision + 1n,
  });
  expect(f.db.personalStarterReceipt.rows).toHaveLength(0);
  expect(f.db.constructionGrant.rows).toHaveLength(0);
  expect(f.db.inventoryItem.rows.map((i: Row) => i.id).sort()).toEqual(
    items.map((i: Row) => i.id).sort(),
  );
  for (const i of items)
    expect(f.db.inventoryItem.id.find(i.id)).toEqual({
      ...i,
      characterId: i.id === f.gunId ? "" : i.characterId,
    });
  for (const c of containers) {
    const current = f.db.inventoryContainer.id.find(c.id);
    for (const key of [
      "width",
      "height",
      "maxMassKg",
      "capacityLitres",
      "amountLitres",
      "liquidType",
    ])
      expect(current[key]).toBe(c[key]);
  }
  for (const o of interactions) {
    const current = f.db.interactionObject.id.find(o.id);
    expect(current.enabled).toBe(o.enabled);
    expect(current.revision).toBe(o.revision);
    expect(current.placementId).not.toBe(o.placementId);
  }
  const receipt = f.db.wayfarerRefitReceipt.shipId.find(f.ship.id);
  expect(receipt.operationId).toBe(args.operationId);
  const revisions = f.db.inventoryState.rows.map((r: Row) => ({ ...r }));
  refitExistingWayfarer(f.ctx, args);
  expect(f.db.inventoryState.rows).toEqual(revisions);
  expect(preserveWayfarerStarterKit(f.ctx)).toBe(true);
  expect(f.db.inventoryContainer.rows).toHaveLength(containers.length);
  expect(f.db.inventoryItem.id.find(f.gunId).characterId).toBe("");
});

test("stale preview, occupied station, unsupported actor and foreign owner fail before conversion", () => {
  const f = legacyFixture(),
    args = f.args();
  f.db.station.id.update({ ...f.station, occupantId: f.actor.id });
  expect(() => refitExistingWayfarer(f.ctx, args)).toThrow("stand");
  f.db.station.id.update(f.station);
  expect(() =>
    refitExistingWayfarer(f.ctx, { ...args, fingerprint: "0".repeat(64) }),
  ).toThrow("changed");
  f.db.character.id.update({ ...f.actor, localX: 0, localY: 10.25 });
  expect(() => refitExistingWayfarer(f.ctx, args)).toThrow("supported");
  f.db.character.id.update(f.actor);
  f.raw.sender = Identity.fromString("05".repeat(32));
  expect(() => refitExistingWayfarer(f.ctx, args)).toThrow("Owned");
  expect(f.db.constructionInstance.rows).toHaveLength(0);
  expect(f.db.inventoryContainer.id.find(f.fuelId).amountLitres).toBe(20);
});

test("late receipt failure propagates for enclosing database rollback, with emulator conservation proof", () => {
  const f = legacyFixture(),
    args = f.args(),
    before = new Map(
      [...f.tables].map(([k, rows]) => [k, rows.map((r) => ({ ...r }))]),
    );
  f.db.wayfarerRefitReceipt.insert = () => {
    throw Error("late write failure");
  };
  expect(() => {
    try {
      refitExistingWayfarer(f.ctx, args);
    } catch (e) {
      for (const [k, rows] of f.tables) {
        rows.splice(0, rows.length, ...(before.get(k) ?? []));
      }
      throw e;
    }
  }).toThrow("late write");
  expect(f.db.ship.id.find(f.ship.id)).toEqual(f.ship);
  expect(f.db.inventoryContainer.id.find(f.fuelId).amountLitres).toBe(20);
  expect(f.db.gameShipAccess.rows).toHaveLength(0);
});

test("conserved mounted fuel has solid collision and liquid transfer enforces reach, CAS, replay and capacity", () => {
  const f = legacyFixture();
  refitExistingWayfarer(f.ctx, f.args());
  const instance = f.db.constructionInstance.id.find(f.ship.id),
    v = f.db.constructionLocation.characterId.find(f.actor.id);
  const frame = addWayfarerRefitCollision(
    f.ctx,
    instance,
    v.deckId,
    constructionCollision(f.ctx, instance, v.deckId),
  );
  expect(
    canOccupyDeck(
      frame,
      { shipId: f.ship.id, deckId: v.deckId, position: [-3, 7] },
      0.3,
    ),
  ).toBe(false);
  const other = f.db.inventoryContainer.rows.find(
      (c: Row) => c.parentItemId && c.kind === "liquid",
    ),
    args = {
      sourceId: f.fuelId,
      destinationId: other.id,
      litres: 1,
      expectedSourceRevision: f.db.inventoryContainerScope.containerId.find(
        f.fuelId,
      ).revision,
      expectedDestinationRevision:
        f.db.inventoryContainerScope.containerId.find(other.id).revision,
      expectedInventoryRevision: f.db.inventoryState.characterId.find(
        f.actor.id,
      ).revision,
      operationId: "88888888-8888-4888-8888-888888888888",
    };
  expect(() => transferWayfarerLiquid(f.ctx as LiquidContext, args)).toThrow(
    "reach",
  );
  f.db.character.id.update({ ...f.actor, localX: -1.875, localY: 7 });
  transferWayfarerLiquid(f.ctx as LiquidContext, args);
  expect(f.db.inventoryContainer.id.find(f.fuelId).amountLitres).toBe(19);
  expect(f.db.inventoryContainer.id.find(other.id).amountLitres).toBe(3);
  transferWayfarerLiquid(f.ctx as LiquidContext, args);
  expect(f.db.inventoryContainer.id.find(f.fuelId).amountLitres).toBe(19);
  expect(() =>
    transferWayfarerLiquid(f.ctx as LiquidContext, {
      ...args,
      operationId: "99999999-9999-4999-8999-999999999999",
    }),
  ).toThrow("revision");
});

test("refit replaces legacy telemetry with exactly nine current zeroed native outputs", () => {
  const f = legacyFixture();
  // Derive the actual legacy labels from the pinned flight content.
  for (const actuator of LAB_FLIGHT_ACTUATORS)
    f.db.actuatorOutput.insert({
      id: `${f.ship.id}:${actuator.id}`,
      shipId: f.ship.id,
      actuatorId: actuator.id,
      throttle: 0.75,
      tick: 7n,
    });
  refitExistingWayfarer(f.ctx, f.args());
  const fittings = f.db.constructionFlightFitting.rows.filter(
    (r: Row) => r.kind === "actuator",
  );
  expect(f.db.actuatorOutput.rows).toHaveLength(9);
  expect(f.db.actuatorOutput.rows.map((r: Row) => r.actuatorId).sort()).toEqual(
    fittings.map((r: Row) => r.id).sort(),
  );
  expect(f.db.actuatorOutput.rows.every((r: Row) => r.throttle === 0)).toBe(
    true,
  );
  expect(fittings.map((r: Row) => r.sourceDeviceId).sort()).toEqual(
    LAB_FLIGHT_ACTUATORS.map((a) => a.id).sort(),
  );
  const bad = legacyFixture();
  bad.db.actuatorOutput.insert({
    id: "unknown",
    shipId: bad.ship.id,
    actuatorId: "unknown",
    throttle: 0,
    tick: 0n,
  });
  expect(() => refitExistingWayfarer(bad.ctx, bad.args())).toThrow(
    "telemetry mapping",
  );
  expect(bad.db.constructionInstance.rows).toHaveLength(0);
});
