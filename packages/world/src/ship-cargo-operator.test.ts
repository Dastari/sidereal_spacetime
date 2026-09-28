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
import { stockShipCargo, STOCKED_CARGO_GRID } from "./ship-cargo-operator";
import {
  moveScopedCargo,
  reachableCargoContainers,
  reachableCargoItems,
} from "./scoped-inventory-authority";
import { equipItem, inventoryItemsView } from "./inventory";
import {
  CREW_WARDROBE_KITS,
  CREW_WARDROBE_STARTER_DELIVERY,
} from "@sidereal/content/crew-wardrobe";
import {
  INVENTORY_DEFINITIONS,
  characterEquipmentFromInventory,
} from "@sidereal/content/inventory";
import { prefabCargoSockets } from "@sidereal/sim/prefab-cargo-sockets";
import { prefabById } from "@sidereal/content/prefabs";
import { readShipPrefab } from "@sidereal/content/ship-prefab";
import { prefabComponentCatalogFor } from "@sidereal/sim/prefab-catalog";
import { readFileSync } from "node:fs";

type Row = Record<string, any>;
let fixtureSequence = 0;
const PRIMARY: Record<string, string> = {
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

async function wrenOwner() {
  await import("./prefab-ship-spawners");
  const f = fixture();
  f.as(OWNER);
  // The live database already has its canonical system; a prefab spawn never creates map rows.
  ensureCanonicalSystem(f.db as never);
  const characterId = onboardNewCharacter(f.ctx, "Dastari");
  f.as(SHIP_OPERATOR);
  const wren = prefabShipSpawner("fed.s.wren")!;
  assignPrefabShip(f.ctx, {
    operationId: "assign-wren-01",
    characterId,
    prefabId: "fed.s.wren",
    expectedCatalogRevision: wren.catalogRevision,
    spawnPoseJson: "",
    expectedCharacterShipId: "",
    allowLegacy: false,
  });
  const shipId = f.db.character.id.find(characterId).shipId as string;
  return { f, characterId, shipId };
}

const stockArgs = (
  characterId: string,
  shipId: string,
  ids: readonly string[],
  patch: Partial<Parameters<typeof stockShipCargo>[1]> = {},
) => ({
  operationId: "stock-wren-wardrobe-01",
  dryRun: false,
  characterId,
  shipId,
  socketKey: "hold/cargo.standard.medium",
  containerName: "Storage crate",
  definitionIdsJson: JSON.stringify(ids),
  ...patch,
});

test("Wren exposes its hold crate and bunk locker as storage sockets with approach points", () => {
  const sockets = prefabCargoSockets(prefabById("fed.s.wren")!, 0);
  expect(sockets.map((s) => s.key)).toEqual([
    "bunks/shipyard.equipment.wall-locker",
    "hold/cargo.standard.medium",
  ]);
  const crate = sockets[1];
  expect(crate.centreM).toEqual([2.15, -1.7]);
  // Front (fore) first: ship-local +y from the crate face.
  expect(crate.approachesM[0]).toEqual([2.15, -0.75]);
});

test("live r2 Wren instances (catalog revision 1) expose the same hold crate socket", () => {
  const r2 = readShipPrefab(
    JSON.parse(
      readFileSync(
        new URL("./fixtures/fed-s-wren-r2.prefab.json", import.meta.url),
        "utf8",
      ),
    ),
  );
  const sockets = prefabCargoSockets(
    r2,
    0,
    prefabComponentCatalogFor("ship-components-v1@1"),
  );
  expect(sockets.map((s) => s.key)).toContain("hold/cargo.standard.medium");
  expect(sockets.map((s) => s.key)).toContain(
    "bunks/shipyard.equipment.wall-locker",
  );
});

test("starter wardrobe delivery is uniforms, three role sets and the tier 1-2 pieces", () => {
  expect(CREW_WARDROBE_STARTER_DELIVERY.filter((id) => id.startsWith("wardrobe-uniform-"))).toHaveLength(4);
  expect(CREW_WARDROBE_STARTER_DELIVERY.filter((id) => /^wardrobe-t[12]-/.test(id))).toHaveLength(14);
  expect(CREW_WARDROBE_STARTER_DELIVERY.filter((id) => id.startsWith("crew-medic-"))).toHaveLength(9);
  expect(new Set(CREW_WARDROBE_STARTER_DELIVERY).size).toBe(
    CREW_WARDROBE_STARTER_DELIVERY.length,
  );
});

test("only the deployment operator can stock ship cargo; game identities are refused", async () => {
  const { f, characterId, shipId } = await wrenOwner();
  for (const hex of [OWNER, STRANGER]) {
    f.as(hex);
    expect(() =>
      stockShipCargo(f.ctx, stockArgs(characterId, shipId, ["wardrobe-uniform-command"])),
    ).toThrow("Deployment operator required");
  }
  expect(f.db.instanceInventoryBinding.rows).toHaveLength(0);
});

test("dry run plans the crate and placements and writes only its ledger row", async () => {
  const { f, characterId, shipId } = await wrenOwner();
  f.as(SHIP_OPERATOR);
  const before = f.snapshot();
  stockShipCargo(
    f.ctx,
    stockArgs(characterId, shipId, ["wardrobe-uniform-command", "wardrobe-t1-chest"], {
      operationId: "stock-wren-dry-0001",
      dryRun: true,
    }),
  );
  const ledger = f.db.shipOperatorOperation.operationId.find("stock-wren-dry-0001");
  const summary = JSON.parse(ledger.summaryJson);
  expect(ledger.kind).toBe("stock-ship-cargo-dry-run");
  expect(summary).toMatchObject({
    characterId,
    shipId,
    socketKey: "hold/cargo.standard.medium",
    createdContainer: true,
  });
  expect(summary.items.map((i: Row) => i.definitionId).sort()).toEqual([
    "wardrobe-t1-chest",
    "wardrobe-uniform-command",
  ]);
  const rows = f.db.shipOperatorOperation.rows as Row[];
  rows.splice(rows.indexOf(ledger), 1);
  expect(f.snapshot()).toBe(before);
});

test("rejects unknown sockets, unknown items, another character's ship and overfull crates", async () => {
  const { f, characterId, shipId } = await wrenOwner();
  f.as(SHIP_OPERATOR);
  expect(() =>
    stockShipCargo(f.ctx, stockArgs(characterId, shipId, ["wardrobe-t1-chest"], { socketKey: "bridge/none" })),
  ).toThrow("Unknown storage socket");
  expect(() =>
    stockShipCargo(f.ctx, stockArgs(characterId, shipId, ["no-such-item"])),
  ).toThrow("Unknown item definition");
  expect(() =>
    stockShipCargo(f.ctx, stockArgs("someone-else", shipId, ["wardrobe-t1-chest"])),
  ).toThrow("Character not found");
  expect(() =>
    stockShipCargo(
      f.ctx,
      stockArgs(characterId, shipId, Array(60).fill("wardrobe-t2-chest")),
    ),
  ).toThrow("No room");
  expect(f.db.inventoryItem.rows.filter((i: Row) => i.definitionId.startsWith("wardrobe-"))).toHaveLength(0);
});

test("stocks Wren's crate additively; the owner takes a uniform and equips it (visual follows)", async () => {
  const { f, characterId, shipId } = await wrenOwner();
  const personalBefore = f.db.inventoryItem.rows
    .filter((i: Row) => i.characterId === characterId)
    .map((i: Row) => JSON.stringify(i));
  f.as(SHIP_OPERATOR);
  const first = CREW_WARDROBE_STARTER_DELIVERY.filter(
    (id) => id.startsWith("wardrobe-"),
  );
  stockShipCargo(f.ctx, stockArgs(characterId, shipId, first));
  // Replaying the same operation is a no-op; a second batch reuses the bound crate.
  stockShipCargo(f.ctx, stockArgs(characterId, shipId, first));
  stockShipCargo(
    f.ctx,
    stockArgs(characterId, shipId, ["crew-medic-chest"], {
      operationId: "stock-wren-wardrobe-02",
    }),
  );
  expect(f.db.instanceInventoryBinding.rows).toHaveLength(1);
  const binding = f.db.instanceInventoryBinding.rows[0];
  const crate = f.db.inventoryContainer.id.find(binding.containerId);
  expect(crate).toMatchObject({
    characterId: "",
    shipId,
    width: STOCKED_CARGO_GRID.width,
    height: STOCKED_CARGO_GRID.height,
    name: "Storage crate",
  });
  const stocked = f.db.inventoryItemMembership.rows.filter(
    (m: Row) => m.rootContainerId === crate.id,
  );
  expect(stocked).toHaveLength(first.length + 1);
  // Existing personal items are untouched.
  expect(
    f.db.inventoryItem.rows
      .filter((i: Row) => i.characterId === characterId)
      .map((i: Row) => JSON.stringify(i)),
  ).toEqual(personalBefore);
  // Backpacks carry their own nested storage under the same root.
  const packs = f.db.inventoryItem.rows.filter((i: Row) =>
    /^wardrobe-t[12]-back$/.test(i.definitionId),
  );
  for (const pack of packs)
    expect(
      f.db.inventoryContainer.rows.find((c: Row) => c.parentItemId === pack.id),
    ).toBeTruthy();

  // The owner walks to the approach point: the crate becomes reachable.
  f.as(OWNER);
  const scope = f.db.inventoryContainerScope.containerId.find(crate.id);
  const actor = f.db.character.id.find(characterId);
  f.db.character.id.update({ ...actor, localX: 4, localY: 4 });
  expect(reachableCargoContainers(f.ctx)).toEqual([]);
  f.db.character.id.update({
    ...actor,
    localX: scope.accessX,
    localY: scope.accessY,
  });
  // A current game session (the live client's authenticated connection).
  f.db.authSession.insert({
    id: "session-owner",
    owner: Identity.fromString(OWNER),
    game: true,
    expiresMicros: 10n ** 18n,
  });
  expect(reachableCargoContainers(f.ctx).map((c) => c.id)).toContain(crate.id);
  const uniform = reachableCargoItems(f.ctx).find(
    (i) => i.definitionId === "wardrobe-uniform-medical",
  )!;
  const pack = f.db.inventoryItem.rows.find(
    (i: Row) => i.characterId === characterId && i.equipmentSlot === "back",
  );
  const packStorage = f.db.inventoryContainer.rows.find(
    (c: Row) => c.parentItemId === pack.id,
  );
  const revision = (id: string) =>
    f.db.inventoryContainerScope.containerId.find(id).revision;
  // First free 2x3 cell block in the pack (the personal kit already uses part of it).
  const taken = f.db.inventoryItem.rows
    .filter((i: Row) => i.containerId === packStorage.id)
    .map((i: Row) => {
      const d = INVENTORY_DEFINITIONS.find((x) => x.id === i.definitionId)!;
      return i.rotated
        ? [i.x, i.y, d.height, d.width]
        : [i.x, i.y, d.width, d.height];
    });
  const free = (x: number, y: number) =>
    x + 2 <= packStorage.width &&
    y + 3 <= packStorage.height &&
    taken.every(
      ([tx, ty, w, h]: number[]) =>
        x >= tx + w || x + 2 <= tx || y >= ty + h || y + 3 <= ty,
    );
  let spot: [number, number] | undefined;
  for (let y = 0; y < packStorage.height && !spot; y++)
    for (let x = 0; x < packStorage.width && !spot; x++)
      if (free(x, y)) spot = [x, y];
  expect(spot).toBeTruthy();
  moveScopedCargo(f.ctx, {
    operationId: "take-uniform-01",
    itemId: uniform.id,
    expectedItemRevision: uniform.revision,
    sourceContainerId: crate.id,
    expectedSourceRevision: revision(crate.id),
    destinationContainerId: packStorage.id,
    expectedDestinationRevision: revision(packStorage.id),
    expectedCharacterRevision:
      f.db.inventoryState.characterId.find(characterId).revision,
    x: spot![0],
    y: spot![1],
    rotated: false,
  });
  expect(f.db.inventoryItem.id.find(uniform.id)).toMatchObject({
    characterId,
    containerId: packStorage.id,
  });
  equipItem(f.ctx, {
    itemId: uniform.id,
    expectedRevision: f.db.inventoryState.characterId.find(characterId).revision,
    operationId: "equip-uniform-01",
  });
  const items = inventoryItemsView(f.ctx);
  expect(items.find((i) => i.id === uniform.id)?.equipmentSlot).toBe("uniform");
  expect(characterEquipmentFromInventory(items)).toMatchObject({
    uniform: "wardrobe-uniform-medical",
  });
});

test("the two delivery kits fit Wren's hold crate and bunk locker", async () => {
  const { f, characterId, shipId } = await wrenOwner();
  f.as(SHIP_OPERATOR);
  stockShipCargo(
    f.ctx,
    stockArgs(characterId, shipId, CREW_WARDROBE_KITS["uniforms-and-tiers"], {
      operationId: "stock-wren-crate-01",
    }),
  );
  stockShipCargo(
    f.ctx,
    stockArgs(characterId, shipId, CREW_WARDROBE_KITS["role-sets"], {
      operationId: "stock-wren-locker-01",
      socketKey: "bunks/shipyard.equipment.wall-locker",
      containerName: "Wall locker",
    }),
  );
  expect(f.db.instanceInventoryBinding.rows).toHaveLength(2);
  expect(
    f.db.inventoryItemMembership.rows.filter((m: Row) =>
      f.db.instanceInventoryBinding.rows.some(
        (b: Row) => b.containerId === m.rootContainerId,
      ),
    ),
  ).toHaveLength(CREW_WARDROBE_STARTER_DELIVERY.length);
  for (const b of f.db.instanceInventoryBinding.rows) {
    const scope = f.db.inventoryContainerScope.containerId.find(b.containerId);
    expect([scope.accessX, scope.accessY].every(Number.isFinite)).toBe(true);
    expect(scope.accessZ).toBeCloseTo(0.1875, 6);
  }
});
