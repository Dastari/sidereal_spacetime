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
import { SHIP_OPERATOR } from "./ship-operator";
import { onboardNewCharacter } from "./ship-policy";
import { ensureCanonicalSystem } from "./shared-world";
import { assignPrefabShip, prefabShipSpawner } from "./ship-assign";
import { editShipFurnishing } from "./ship-furnishings";
import { readConstructionFlightInput } from "./construction-flight-input";
import type { FurnishingOverrides } from "@sidereal/content/wayfarer-furnishings";
import { furnishingState } from "./ship-furnishings-tables";
import { constructionCollision } from "./construction-doors";
import { canOccupyDeck } from "@sidereal/sim/construction-collision";
import { wallFurnishingPlacement } from "@sidereal/sim/furnishing-wall-placement";
import { readShipPrefab } from "@sidereal/content/ship-prefab";
import { prefabComponentCatalogFor } from "@sidereal/sim/prefab-catalog";
import { prefabShipObjects } from "@sidereal/sim/prefab-deck-objects";
import { prefabCargoSockets } from "@sidereal/sim/prefab-cargo-sockets";
import { prefabBedsOfDocument } from "@sidereal/sim/prefab-seats";
import { stockShipCargo } from "./ship-cargo-operator";
type Row = Record<string, any>;
let fixtureSequence = 0;
const PRIMARY: Record<string, string> = {
  shipFurnishingState: "shipId",
  authSession: "id",
  characterVitals: "characterId",
  personalStarterReceipt: "owner",
  gameShipAccess: "shipId",
  shipWorldMotion: "shipId",
  bodyWorldMotion: "bodyId",
  worldAdmission: "characterId",
  constructionFlightBinding: "shipId",
  constructionFlightCompiled: "shipId",
  constructionFlightDirty: "shipId",
  constructionFlightStation: "stationId",
  constructionLocation: "characterId",
  input: "characterId",
  inventoryState: "characterId",
  inventoryContainerScope: "containerId",
  inventoryItemMembership: "itemId",
  instanceInventoryBinding: "placedObjectId",
  constructionInteractionBinding: "objectId",
  constructionPilotSeat: "characterId",
  shipZoneState: "shipId",
  pilotLayoutReceipt: "shipId",
  legacyBodyAlias: "legacyBodyId",
  constructionStairWalk: "characterId",
  constructionStairReservation: "stairId",
  constructionTraversal: "characterId",
  constructionTraversalReservation: "linkId",
  couchSeat: "characterId",
  constructionPassengerVisit: "characterId",
  constructionFlightReview: "characterId",
  constructionReviewOrigin: "characterId",
  constructionCargoAssembly: "containerId",
  constructionCargoPlacement: "containerId",
  weaponEnergy: "itemId",
  inventoryItemPin: "itemId",
  combatActionPin: "characterId",
  contentDefinition: "definitionRef",
  contentDefinitionHead: "definitionKey",
  shipOperatorOperation: "operationId",
  characterUniformIssue: "characterId",
};
const FIELD: Record<string, string> = {
  by_owner: "owner",
  by_system: "systemId",
  by_ship: "shipId",
  by_root: "rootContainerId",
  by_deck: "deckId",
  by_instance: "instanceId",
  by_character: "characterId",
  by_principal: "principal",
  by_operation: "operationId",
  by_container: "containerId",
};

function fixture() {
  const tables = new Map<string, Row[]>();
  const key = (v: unknown) =>
    v && typeof (v as { toHexString?: unknown }).toHexString === "function"
      ? (v as { toHexString(): string }).toHexString()
      : String(v);
  const db = new Proxy({} as Record<string, any>, {
    get(target, name: string) {
      if (target[name]) return target[name];
      const rows: Row[] = [];
      tables.set(name, rows);
      const pk = PRIMARY[name] ?? "id";
      target[name] = new Proxy(
        {
          rows,
          iter: () => rows.values(),
          count: () => BigInt(rows.length),
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
            const column = FIELD[index] ?? index;
            return {
              find: (value: unknown) =>
                rows.find((r) => key(r[column]) === key(value)),
              filter: (value: unknown) =>
                Array.isArray(value)
                  ? rows.filter(
                      (r) =>
                        key(r.instanceId) === key(value[0]) &&
                        key(r.deckId) === key(value[1]),
                    )
                  : rows.filter((r) => key(r[column]) === key(value)),
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
  let sequence = 1 + ++fixtureSequence * 100000;
  const raw = {
    db,
    sender: Identity.fromString("04".repeat(32)),
    live: true,
    timestamp: { microsSinceUnixEpoch: 123000000n },
    newUuidV4: () => ({
      toString: () =>
        `55555555-5555-4555-8555-${(sequence++).toString(16).padStart(12, "0")}`,
    }),
  };
  const as = (hex: string) => {
    raw.sender = Identity.fromString(hex);
  };
  const snapshot = () =>
    JSON.stringify(
      [...tables].filter(([, rows]) => rows.length),
      (_, v) =>
        typeof v === "bigint"
          ? v.toString()
          : v && typeof v.toHexString === "function"
            ? v.toHexString()
            : v,
    );
  return { ctx: raw as any, db, as, snapshot };
}

const OWNER = "04".repeat(32);
const STRANGER = "07".repeat(32);

async function wayfarerOwner() {
  await import("./prefab-ship-spawners");
  const f = fixture();
  f.as(OWNER);
  ensureCanonicalSystem(f.db as never);
  const characterId = onboardNewCharacter(f.ctx, "Furniture owner");
  f.as(SHIP_OPERATOR);
  const pin = prefabShipSpawner("fed.m.wayfarer")!;
  assignPrefabShip(f.ctx, {
    operationId: "assign-furniture",
    characterId,
    prefabId: pin.prefabId,
    expectedCatalogRevision: pin.catalogRevision,
    spawnPoseJson: "",
    expectedCharacterShipId: "",
    allowLegacy: false,
  });
  f.as(OWNER);
  f.db.authSession.insert({
    id: "test-auth",
    owner: f.ctx.sender,
    game: true,
    expiresMicros: 999999999999n,
  });
  const actor = f.db.character.id.find(characterId),
    shipId = actor.shipId,
    instance = f.db.constructionInstance.id.find(shipId),
    visit = f.db.constructionLocation.characterId.find(characterId);
  const binding = JSON.parse(instance.documentJson).prefab,
    doc = readShipPrefab(binding.document),
    catalog = prefabComponentCatalogFor(binding.catalog);
  return { f, characterId, shipId, instance, visit, doc, catalog };
}
function standNear(
  w: Awaited<ReturnType<typeof wayfarerOwner>>,
  sourceObjectId: string,
  proposal?: FurnishingOverrides,
) {
  const state = furnishingState(w.f.db, w.shipId),
    o = prefabShipObjects(w.doc, w.catalog, state.overrides).find(
      (o) => o.sourceId === sourceObjectId,
    )!;
  const frame = constructionCollision(w.f.ctx, w.instance, w.visit.deckId);
  const destination = proposal
    ? constructionCollision(w.f.ctx, w.instance, w.visit.deckId, {
        revision: state.revision + 1n,
        overrides: proposal,
      })
    : frame;
  for (let x = -6.25; x <= 6.25; x += 0.25)
    for (let y = -10.75; y <= 12.75; y += 0.25) {
      const distance = Math.hypot(
        Math.max(o.min[0] - y, 0, y - o.max[0]),
        Math.max(o.min[1] + x, 0, -x - o.max[1]),
      );
      if (
        distance <= 1.2 &&
        canOccupyDeck(
          frame,
          { shipId: w.shipId, deckId: w.visit.deckId, position: [x, y] },
          0.3,
        ) &&
        canOccupyDeck(
          destination,
          { shipId: w.shipId, deckId: w.visit.deckId, position: [x, y] },
          0.3,
        )
      ) {
        w.f.db.character.id.update({
          ...w.f.db.character.id.find(w.characterId),
          localX: x,
          localY: y,
        });
        return;
      }
    }
  throw Error("No test approach for " + sourceObjectId);
}
const request = (
  w: Awaited<ReturnType<typeof wayfarerOwner>>,
  sourceObjectId = "Lounge_coffee_table",
  patch: Record<string, unknown> = {},
) =>
  ({
    instanceId: w.shipId,
    sourceObjectId,
    action: "snap",
    dx: 0,
    dy: 0,
    yaw: 0,
    snap: false,
    expectedRevision: 0n,
    operationId: "furniture-01",
    ...patch,
  }) as Parameters<typeof editShipFurnishing>[1];

test("wall dragging commits supported auto-facing poses and rejects detached or reversed requests atomically", async () => {
  const w = await wayfarerOwner(),
    id = "Cockpit_wall_light_cyan_v";
  const pose = wallFurnishingPlacement(w.doc, id, [0.5, 5.5], false)!;
  expect(pose).toBeDefined();
  standNear(w, id, { [id]: pose });
  const initial = w.f.snapshot();
  const args = request(w, id, { action: "move", ...pose });
  expect(() =>
    editShipFurnishing(w.f.ctx, {
      ...args,
      operationId: "detached",
      dx: pose.dx + 0.1,
      dy: pose.dy - 0.1,
    }),
  ).toThrow(/wall contact/);
  expect(w.f.snapshot()).toBe(initial);
  expect(() =>
    editShipFurnishing(w.f.ctx, {
      ...args,
      operationId: "reversed",
      yaw: pose.yaw + Math.PI,
    }),
  ).toThrow(/wall contact/);
  expect(w.f.snapshot()).toBe(initial);
  editShipFurnishing(w.f.ctx, args);
  const state = furnishingState(w.f.db, w.shipId);
  expect(state.revision).toBe(1n);
  expect(state.overrides[id]).toEqual(pose);
  expect(w.f.db.constructionInstance.id.find(w.shipId)).toEqual(w.instance);
  const accepted = w.f.snapshot();
  editShipFurnishing(w.f.ctx, args);
  expect(w.f.snapshot()).toBe(accepted);
  expect(() =>
    editShipFurnishing(w.f.ctx, { ...args, operationId: "stale-wall" }),
  ).toThrow(/revision/);
  expect(w.f.snapshot()).toBe(accepted);
}, 30000);

test("an unchanged authored recessed lamp remains admitted without opening a wall-contact bypass", async () => {
  const w = await wayfarerOwner(),
    id = "Cockpit_wall_light_cyan_v";
  standNear(w, id);
  editShipFurnishing(w.f.ctx, request(w, id, { action: "move" }));
  expect(furnishingState(w.f.db, w.shipId).overrides[id]).toMatchObject({
    dx: 0,
    dy: 0,
    yaw: 0,
  });
  const accepted = w.f.snapshot();
  expect(() =>
    editShipFurnishing(
      w.f.ctx,
      request(w, id, {
        action: "move",
        dx: 0.01,
        operationId: "recess-bypass",
        expectedRevision: 1n,
      }),
    ),
  ).toThrow(/wall contact/);
  expect(w.f.snapshot()).toBe(accepted);
}, 30000);

test("furnishing state revision is independent, exact replay survives tombstones and reload", async () => {
  const w = await wayfarerOwner();
  standNear(w, "Lounge_coffee_table");
  const before = w.f.snapshot(),
    args = request(w, "Lounge_coffee_table", { action: "delete" });
  editShipFurnishing(w.f.ctx, args);
  const state = furnishingState(w.f.db, w.shipId);
  expect(state.revision).toBe(1n);
  expect(state.overrides.Lounge_coffee_table.deleted).toBe(true);
  expect(w.f.db.constructionInstance.id.find(w.shipId)).toEqual(w.instance);
  const accepted = w.f.snapshot();
  editShipFurnishing(w.f.ctx, args);
  expect(w.f.snapshot()).toBe(accepted);
  expect(() => editShipFurnishing(w.f.ctx, { ...args, dx: 1 })).toThrow(
    /reused/,
  );
  expect(() =>
    editShipFurnishing(w.f.ctx, { ...args, operationId: "stale" }),
  ).toThrow(/revision/);
  expect(() =>
    editShipFurnishing(w.f.ctx, {
      ...args,
      operationId: "resurface",
      action: "move",
      expectedRevision: 1n,
    }),
  ).toThrow(/deleted/);
  expect(
    prefabShipObjects(w.doc, w.catalog, JSON.parse(state.overridesJson)).some(
      (o) => o.sourceId === "Lounge_coffee_table",
    ),
  ).toBe(false);
  expect(before).not.toBe(accepted);
}, 30000);

test("owner, standing, reach, finite data and fixed structure checks leave all rows unchanged", async () => {
  const w = await wayfarerOwner();
  standNear(w, "Lounge_coffee_table");
  const args = request(w),
    baseline = w.f.snapshot();
  for (const patch of [
    { dx: NaN },
    { sourceObjectId: "PART_lounge_front" },
    { dx: 100 },
  ]) {
    expect(() => editShipFurnishing(w.f.ctx, { ...args, ...patch })).toThrow();
    expect(w.f.snapshot()).toBe(baseline);
  }
  w.f.as(STRANGER);
  expect(() => editShipFurnishing(w.f.ctx, args)).toThrow(/aboard/);
  w.f.as(OWNER);
  const actor = w.f.db.character.id.find(w.characterId);
  w.f.db.character.id.update({ ...actor, localX: 0, localY: 6.875 });
  expect(() => editShipFurnishing(w.f.ctx, args)).toThrow(/3 m/);
  w.f.db.character.id.update(actor);
  w.f.db.characterVitals.insert({
    characterId: w.characterId,
    state: "dead",
    health: 0,
  });
  expect(() => editShipFurnishing(w.f.ctx, args)).toThrow(/living/);
  for (const invalid of [
    { state: "active", health: NaN, maxHealth: 100 },
    { state: "unknown", health: 100, maxHealth: 100 },
    { state: "active", health: 100, maxHealth: 0 },
  ]) {
    w.f.db.characterVitals.characterId.update({
      characterId: w.characterId,
      ...invalid,
    });
    expect(() => editShipFurnishing(w.f.ctx, args)).toThrow(/living/);
  }
  w.f.db.characterVitals.characterId.delete(w.characterId);
  w.f.db.couchSeat.insert({
    characterId: w.characterId,
    objectId: "other-seat",
  });
  expect(() => editShipFurnishing(w.f.ctx, args)).toThrow(/standing/);
  w.f.db.couchSeat.characterId.delete(w.characterId);
  expect(w.f.snapshot()).toBe(baseline);
});

test("empty storage deletion preserves identity and flight, payload or liquid storage refuses deletion", async () => {
  const w = await wayfarerOwner(),
    id = "Cargo_crate_small_white";
  standNear(w, id);
  const placed = `${w.shipId}:${w.visit.deckId}:${id}`,
    binding = w.f.db.instanceInventoryBinding.placedObjectId.find(placed),
    root = w.f.db.inventoryContainer.id.find(binding.containerId),
    scope = w.f.db.inventoryContainerScope.containerId.find(root.id);
  w.f.db.inventoryContainer.id.update({ ...root, amountLitres: 1 });
  const withLiquid = w.f.snapshot();
  expect(() =>
    editShipFurnishing(w.f.ctx, request(w, id, { action: "delete" })),
  ).toThrow(/Empty this storage/);
  expect(w.f.snapshot()).toBe(withLiquid);
  w.f.db.inventoryContainer.id.update(root);
  w.f.db.inventoryItemMembership.insert({
    itemId: "nested-payload",
    containerId: root.id,
    rootContainerId: root.id,
  });
  const withItem = w.f.snapshot();
  expect(() =>
    editShipFurnishing(w.f.ctx, request(w, id, { action: "delete" })),
  ).toThrow(/Empty this storage/);
  expect(w.f.snapshot()).toBe(withItem);
  w.f.db.inventoryItemMembership.itemId.delete("nested-payload");
  editShipFurnishing(w.f.ctx, request(w, id, { action: "delete" }));
  expect(w.f.db.inventoryContainer.id.find(root.id)).toEqual(root);
  expect(w.f.db.instanceInventoryBinding.placedObjectId.find(placed)).toEqual(
    binding,
  );
  expect(w.f.db.inventoryContainerScope.containerId.find(root.id)).toEqual({
    ...scope,
    lifecycle: "retired",
    revision: scope.revision + 1n,
  });
  expect(() => readConstructionFlightInput(w.f.ctx, w.shipId)).not.toThrow();
  w.f.db.inventoryContainer.id.update({ ...root, amountLitres: 1 });
  expect(() => readConstructionFlightInput(w.f.ctx, w.shipId)).toThrow(
    /cargo-root/,
  );
}, 30000);

test("occupied beds reject movement/deletion without rewriting UUIDs", async () => {
  const w = await wayfarerOwner(),
    id = "Quarters_A_bed_single";
  standNear(w, id);
  const seatId = `${w.shipId}:seat:prefab:socket:${id}`;
  w.f.db.couchSeat.insert({ characterId: "passenger", objectId: seatId });
  const baseline = w.f.snapshot();
  expect(() =>
    editShipFurnishing(w.f.ctx, request(w, id, { action: "delete" })),
  ).toThrow(/occupied/);
  expect(w.f.snapshot()).toBe(baseline);
});

test("free movement commits one accepted pose and off-floor or crew-overlap proposals roll back", async () => {
  const w = await wayfarerOwner(),
    id = "Lounge_coffee_table";
  standNear(w, id, {
    [id]: { dx: 0.05, dy: 1.123, yaw: 0.21, snap: false, deleted: false },
  });
  const original = w.f.db.constructionInstance.id.find(w.shipId),
    args = request(w, id, {
      action: "move",
      dx: 0.05,
      dy: 1.123,
      yaw: 0.21,
      snap: false,
    });
  editShipFurnishing(w.f.ctx, args);
  expect(furnishingState(w.f.db, w.shipId).overrides[id]).toMatchObject({
    dx: 0.05,
    dy: 1.123,
    yaw: 0.21,
    snap: false,
  });
  expect(w.f.db.constructionInstance.id.find(w.shipId)).toEqual(original);
  const baseline = w.f.snapshot();
  expect(() =>
    editShipFurnishing(w.f.ctx, {
      ...args,
      operationId: "outside",
      expectedRevision: 1n,
      dx: 31,
    }),
  ).toThrow(/supported|overlap/);
  expect(w.f.snapshot()).toBe(baseline);
  const object = prefabShipObjects(
      w.doc,
      w.catalog,
      furnishingState(w.f.db, w.shipId).overrides,
    ).find((o) => o.sourceId === id)!,
    actor = w.f.db.character.id.find(w.characterId),
    cx = (object.min[0] + object.max[0]) / 2,
    cy = (object.min[1] + object.max[1]) / 2;
  expect(() =>
    editShipFurnishing(w.f.ctx, {
      ...args,
      operationId: "crew",
      expectedRevision: 1n,
      dx: args.dx + actor.localY - cx,
      dy: args.dy - actor.localX - cy,
    }),
  ).toThrow(/crew|overlap/);
  expect(w.f.snapshot()).toBe(baseline);
}, 30000);

test("uncertain furnishing operation cannot replay as a replacement source instance", async () => {
  const w = await wayfarerOwner();
  standNear(w, "Lounge_coffee_table");
  const args = request(w);
  editShipFurnishing(w.f.ctx, args);
  w.f.db.constructionInstance.id.update({
    ...w.instance,
    revision: w.instance.revision + 1n,
  });
  const access = w.f.db.gameShipAccess.shipId.find(w.shipId);
  w.f.db.gameShipAccess.shipId.update({
    ...access,
    instanceRevision: w.instance.revision + 1n,
  });
  w.f.db.shipFurnishingState.shipId.delete(w.shipId);
  expect(() => editShipFurnishing(w.f.ctx, args)).toThrow(
    /Operation ID|operation/,
  );
});
