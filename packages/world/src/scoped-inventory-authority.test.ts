import { expect, it, vi } from "vitest";
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
vi.mock("./combat", () => ({ clearAim: vi.fn() }));
import { SHIP_OPERATOR } from "./ship-operator";
import { onboardNewCharacter } from "./ship-policy";
import { ensureCanonicalSystem } from "./shared-world";
import { assignPrefabShip, prefabShipSpawner } from "./ship-assign";
import { stockShipCargo } from "./ship-cargo-operator";
import {
  legacyInventorySnapshot,
  moveScopedCargo,
  reachableCargoContainers,
  reachableCargoItems,
} from "./scoped-inventory-authority";
import { INVENTORY_DEFINITIONS } from "@sidereal/content/inventory";

// Ordinary indexed ctx.db emulator (as ship-cargo-operator.test.ts). Real transactional
// behaviour is separately required in the isolated authority journey; mocks never claim
// rollback proof.
type Row = Record<string, any>;
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
let fixtureSequence = 0;
function fixture() {
  const key = (v: unknown) =>
    v && typeof (v as { toHexString?: unknown }).toHexString === "function"
      ? (v as { toHexString(): string }).toHexString()
      : String(v);
  const db = new Proxy({} as Record<string, any>, {
    get(target, name: string) {
      if (target[name]) return target[name];
      const rows: Row[] = [];
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
        `77777777-7777-4777-8777-${(sequence++).toString(16).padStart(12, "0")}`,
    }),
  };
  const as = (hex: string) => {
    raw.sender = Identity.fromString(hex);
  };
  return { ctx: raw as any, db, as };
}

const OWNER = "04".repeat(32);

/** The owner aboard a prefab Wren with its personal kit, standing at the stocked hold
 * crate's qualified approach point, with a current game session. */
async function ownerAtCrate() {
  await import("./prefab-ship-spawners");
  const f = fixture();
  f.as(OWNER);
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
  stockShipCargo(f.ctx, {
    operationId: "stock-crate-01",
    dryRun: false,
    characterId,
    shipId,
    socketKey: "hold/cargo.standard.medium",
    containerName: "Storage crate",
    definitionIdsJson: JSON.stringify(["crew-medic-chest"]),
  });
  f.as(OWNER);
  const crate = f.db.inventoryContainer.id.find(
    f.db.instanceInventoryBinding.rows[0].containerId,
  );
  const scope = f.db.inventoryContainerScope.containerId.find(crate.id);
  f.db.character.id.update({
    ...f.db.character.id.find(characterId),
    localX: scope.accessX,
    localY: scope.accessY,
  });
  f.db.authSession.insert({
    id: "session-owner",
    owner: Identity.fromString(OWNER),
    game: true,
    expiresMicros: 10n ** 18n,
  });
  const item = (definitionId: string) =>
    f.db.inventoryItem.rows.find(
      (i: Row) =>
        i.characterId === characterId && i.definitionId === definitionId,
    );
  const revision = (id: string) =>
    f.db.inventoryContainerScope.containerId.find(id).revision as bigint;
  const itemRevision = (id: string) =>
    f.db.inventoryItemMembership.itemId.find(id).revision as bigint;
  const characterRevision = () =>
    f.db.inventoryState.characterId.find(characterId).revision as bigint;
  /** First free cell block for a definition in a grid container. */
  const freeSpot = (containerId: string, definitionId: string) => {
    const c = f.db.inventoryContainer.id.find(containerId);
    const d = INVENTORY_DEFINITIONS.find((x) => x.id === definitionId)!;
    const taken = f.db.inventoryItem.rows
      .filter((i: Row) => i.containerId === containerId)
      .map((i: Row) => {
        const t = INVENTORY_DEFINITIONS.find((x) => x.id === i.definitionId)!;
        return i.rotated
          ? [i.x, i.y, t.height, t.width]
          : [i.x, i.y, t.width, t.height];
      });
    for (let y = 0; y + d.height <= c.height; y++)
      for (let x = 0; x + d.width <= c.width; x++)
        if (
          taken.every(
            ([tx, ty, w, h]: number[]) =>
              x >= tx + w ||
              x + d.width <= tx ||
              y >= ty + h ||
              y + d.height <= ty,
          )
        )
          return [x, y] as const;
    throw Error("No free cell block");
  };
  return {
    f,
    characterId,
    crate,
    item,
    revision,
    itemRevision,
    characterRevision,
    freeSpot,
  };
}

it("storing into a prefab ship's bound crate removes the owner lookup, preserves identity, withdraws and revokes views", async () => {
  const s = await ownerAtCrate(),
    { f } = s;
  expect(reachableCargoContainers(f.ctx).map((c) => c.id)).toContain(
    s.crate.id,
  );
  const pistol = s.item("compact-pistol"),
    origin = { containerId: pistol.containerId, x: pistol.x, y: pistol.y };
  const [x, y] = s.freeSpot(s.crate.id, "compact-pistol");
  const request = {
    operationId: "store",
    itemId: pistol.id,
    expectedItemRevision: s.itemRevision(pistol.id),
    sourceContainerId: origin.containerId,
    expectedSourceRevision: s.revision(origin.containerId),
    destinationContainerId: s.crate.id,
    expectedDestinationRevision: s.revision(s.crate.id),
    expectedCharacterRevision: s.characterRevision(),
    x,
    y,
    rotated: false,
  };
  moveScopedCargo(f.ctx, request);
  expect(f.db.inventoryItem.id.find(pistol.id)).toMatchObject({
    id: pistol.id,
    characterId: "",
    containerId: s.crate.id,
  });
  expect(
    legacyInventorySnapshot(f.ctx, s.characterId).items.map((i) => i.id),
  ).not.toContain(pistol.id);
  expect(reachableCargoItems(f.ctx).map((i) => i.id)).toContain(pistol.id);
  // An exact replay writes nothing.
  const stored = s.revision(s.crate.id);
  moveScopedCargo(f.ctx, request);
  expect(s.revision(s.crate.id)).toBe(stored);
  moveScopedCargo(f.ctx, {
    ...request,
    operationId: "retrieve",
    expectedItemRevision: s.itemRevision(pistol.id),
    sourceContainerId: s.crate.id,
    expectedSourceRevision: s.revision(s.crate.id),
    destinationContainerId: origin.containerId,
    expectedDestinationRevision: s.revision(origin.containerId),
    expectedCharacterRevision: s.characterRevision(),
    x: origin.x,
    y: origin.y,
  });
  expect(f.db.inventoryItem.id.find(pistol.id)).toMatchObject({
    id: pistol.id,
    characterId: s.characterId,
    containerId: origin.containerId,
  });
  expect(
    legacyInventorySnapshot(f.ctx, s.characterId).items.map((i) => i.id),
  ).toContain(pistol.id);
  // Losing the game session revokes cargo views and moves.
  f.db.authSession.rows.splice(0);
  expect(reachableCargoContainers(f.ctx)).toEqual([]);
  expect(() =>
    moveScopedCargo(f.ctx, { ...request, operationId: "store-again" }),
  ).toThrow();
  expect(f.db.inventoryItem.id.find(pistol.id).containerId).toBe(
    origin.containerId,
  );
});

it("preserves nested liquid payloads, projects their actual contents and rejects solid moves into reservoirs", async () => {
  const s = await ownerAtCrate(),
    { f } = s;
  const canister = s.item("resource-canister"),
    reservoir = f.db.inventoryContainer.rows.find(
      (c: Row) => c.parentItemId === canister.id,
    ),
    origin = {
      containerId: canister.containerId,
      x: canister.x,
      y: canister.y,
    };
  const [x, y] = s.freeSpot(s.crate.id, "resource-canister");
  moveScopedCargo(f.ctx, {
    operationId: "store-canister",
    itemId: canister.id,
    expectedItemRevision: s.itemRevision(canister.id),
    sourceContainerId: origin.containerId,
    expectedSourceRevision: s.revision(origin.containerId),
    destinationContainerId: s.crate.id,
    expectedDestinationRevision: s.revision(s.crate.id),
    expectedCharacterRevision: s.characterRevision(),
    x,
    y,
    rotated: false,
  });
  expect(
    reachableCargoContainers(f.ctx).find((c) => c.id === reservoir.id),
  ).toMatchObject({
    parentItemId: canister.id,
    kind: "liquid",
    capacityLitres: 5,
    amountLitres: 2,
    liquidType: "fuel",
  });
  const pistol = s.item("compact-pistol"),
    characterRevision = s.characterRevision();
  expect(() =>
    moveScopedCargo(f.ctx, {
      operationId: "invalid-liquid",
      itemId: pistol.id,
      expectedItemRevision: s.itemRevision(pistol.id),
      sourceContainerId: pistol.containerId,
      expectedSourceRevision: s.revision(pistol.containerId),
      destinationContainerId: reservoir.id,
      expectedDestinationRevision: s.revision(reservoir.id),
      expectedCharacterRevision: characterRevision,
      x: 0,
      y: 0,
      rotated: false,
    }),
  ).toThrow("liquid-container");
  expect(s.characterRevision()).toBe(characterRevision);
  moveScopedCargo(f.ctx, {
    operationId: "retrieve-canister",
    itemId: canister.id,
    expectedItemRevision: s.itemRevision(canister.id),
    sourceContainerId: s.crate.id,
    expectedSourceRevision: s.revision(s.crate.id),
    destinationContainerId: origin.containerId,
    expectedDestinationRevision: s.revision(origin.containerId),
    expectedCharacterRevision: characterRevision,
    x: origin.x,
    y: origin.y,
    rotated: false,
  });
  expect(f.db.inventoryContainer.id.find(reservoir.id)).toMatchObject({
    id: reservoir.id,
    characterId: s.characterId,
    parentItemId: canister.id,
    capacityLitres: 5,
    amountLitres: 2,
    liquidType: "fuel",
  });
});
