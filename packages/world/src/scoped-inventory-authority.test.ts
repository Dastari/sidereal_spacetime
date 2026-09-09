import { readFileSync } from "node:fs";
import { expect, it, vi } from "vitest";
import { Identity } from "spacetimedb";
vi.mock("spacetimedb/server", () => ({
  SenderError: class extends Error {},
  table: () => ({}),
  t: new Proxy(
    {},
    {
      get: () => () => ({
        primaryKey() { return this; }, unique() { return this; },
      }),
    },
  ),
}));
vi.mock("./combat", () => ({ clearAim: vi.fn() }));
import { installQualifiedInstanceCargo } from "./scoped-inventory-installation";
import {
  synchronizeLegacyInventory,
  legacyInventorySnapshot,
  moveScopedCargo,
  reachableCargoContainers,
  reachableCargoItems,
} from "./scoped-inventory-authority";
import {
  createWayfarerConversionCandidate,
  type WayfarerPinnedInputs,
} from "../../sim/src/wayfarer-conversion-candidate";
import { WAYFARER_CONVERSION_PIN as PIN } from "../../content/src/wayfarer-conversion-candidate";
import { qualifiedWayfarerWalkingBindings } from "../../sim/src/wayfarer-walking-bindings";
import { planConstructionInstance } from "../../sim/src/construction-instance";
// Ordinary indexed ctx.db emulator. Real transactional behavior is separately
// required in the isolated authority journey; mocks never claim rollback proof.
function table(primary = "id", indices: Record<string, string[]> = {}) {
  const rows = new Map<string, any>();
  const t: any = {
    rows,
    insert: (r: any) => {
      if (rows.has(r[primary])) throw Error("duplicate");
      rows.set(r[primary], { ...r });
      return r;
    },
  };
  t[primary] = {
    find: (id: string) => rows.get(id),
    update: (r: any) => {
      if (!rows.has(r[primary])) throw Error("missing");
      rows.set(r[primary], { ...r });
    },
    delete: (id: string) => rows.delete(id),
  };
  for (const [name, fields] of Object.entries(indices))
    t[name] = {
      filter: (key: any) =>
        [...rows.values()].filter((row) =>
          fields.every(
            (f, i) =>
              String(row[f]) === String(fields.length === 1 ? key : key[i]),
          ),
        ),
      find: (key: any) =>
        [...rows.values()].find((row) =>
          fields.every(
            (f, i) =>
              String(row[f]) === String(fields.length === 1 ? key : key[i]),
          ),
        ),
    };
  return t;
}
function fixture() {
  let n = 0;
  const uuid = () =>
    `00000000-0000-4000-8000-${(++n).toString(16).padStart(12, "0")}`;
  const owner = Identity.fromString("1".repeat(64));
  const candidate = createWayfarerConversionCandidate(
    Object.fromEntries(
      Object.keys(PIN.sources).map((p) => [p, readFileSync(p, "utf8")]),
    ) as WayfarerPinnedInputs,
  );
  const plan = planConstructionInstance(
    candidate.snapshot,
    {
      blueprintRevisionId: "blueprint",
      expectedBlueprintSha256: candidate.snapshot.sha256,
      sourceDeckId: PIN.deckId,
      bodyRadiusM: 0.3,
      bodyHeightM: 1.8,
      perimeterHalfWidthM: 0,
      partitionHalfWidthM: 0,
      objectCollisionBindings: qualifiedWayfarerWalkingBindings(
        candidate.snapshot,
        0.3,
        1.8,
      ),
    },
    uuid,
  );
  const db: any = {
    character: table("id", { by_owner: ["owner"] }),
    constructionLocation: table("characterId"),
    constructionInstance: table(),
    constructionDeck: table(),
    constructionGrant: table("id", { by_principal: ["principal"] }),
    constructionDoor: table("id", { by_deck: ["deckId"] }),
    constructionTraversal: table("characterId"),
    constructionStairWalk: table("characterId"),
    couchSeat: table("characterId"),
    station: table("shipId"),
    inventoryItem: table("id", { by_character: ["characterId"] }),
    inventoryContainer: table("id", { by_character: ["characterId"] }),
    inventoryState: table("characterId"),
    inventoryItemMembership: table("itemId", {
      by_root: ["rootContainerId"],
      by_character: ["rootCharacterId"],
    }),
    inventoryContainerScope: table("containerId", {
      by_root: ["rootContainerId"],
      by_character: ["rootCharacterId"],
      by_instance_deck: ["instanceId", "deckId"],
    }),
    instanceInventoryBinding: table("placedObjectId"),
    scopedInventoryReceipt: table(),
    inventoryHotbar: table("id", { by_character: ["characterId"] }),
  };
  db.constructionInstance.insert({
    id: plan.instanceId,
    owner,
    workspaceId: "workspace",
    revision: 1n,
    blueprintSha256: plan.blueprintSha256,
    documentJson: JSON.stringify(plan.document),
    idMapJson: JSON.stringify(plan.mappings),
  });
  db.constructionDeck.insert({
    id: plan.spawn.deckId,
    instanceId: plan.instanceId,
    elevation: 0,
  });
  db.character.insert({
    id: "actor",
    owner,
    connected: true,
    shipId: plan.instanceId,
    localX: -3.5,
    localY: 2.75,
  });
  db.constructionLocation.insert({
    characterId: "actor",
    visitId: "accepted-owner-review",
    instanceId: plan.instanceId,
    deckId: plan.spawn.deckId,
  });
  db.constructionGrant.insert({
    id: "grant",
    principal: owner,
    workspaceId: "workspace",
    capability: "instance.spawn",
    expiresMicros: 1000n,
    revoked: false,
  });
  db.inventoryContainer.insert({
    id: "pockets",
    characterId: "actor",
    parentItemId: "",
    kind: "grid",
    name: "Pockets",
    width: 4,
    height: 2,
    maxMassKg: 6,
    capacityLitres: 0,
    amountLitres: 0,
    liquidType: "",
    carried: true,
    shipId: "legacy-ship",
    localX: 0,
    localY: 0,
  });
  db.inventoryItem.insert({
    id: "pistol",
    characterId: "actor",
    definitionId: "compact-pistol",
    containerId: "pockets",
    equipmentSlot: "",
    x: 0,
    y: 0,
    rotated: false,
  });
  db.inventoryState.insert({
    characterId: "actor",
    revision: 1n,
    kitGranted: true,
  });
  db.inventoryHotbar.insert({
    id: "slot-0",
    characterId: "actor",
    slot: 0,
    itemId: "pistol",
  });
  const ctx = {
    db,
    sender: owner,
    timestamp: { microsSinceUnixEpoch: 10n },
    newUuidV4: uuid,
  } as unknown as Parameters<typeof installQualifiedInstanceCargo>[0];
  synchronizeLegacyInventory(
    ctx,
    "actor",
    legacyInventorySnapshot(ctx, "actor"),
  );
  const request = (containerId: string) => ({
    operationId: "store",
    itemId: "pistol",
    expectedItemRevision: 1n,
    sourceContainerId: "pockets",
    expectedSourceRevision: 1n,
    destinationContainerId: containerId,
    expectedDestinationRevision: 1n,
    expectedCharacterRevision: 1n,
    x: 0,
    y: 0,
    rotated: false,
  });
  return { ctx, db, plan, request };
}
it("installs four empty UUID-bound native containers without rewriting carried or legacy inventory", () => {
  const f = fixture(),
    old = f.db.inventoryItem.id.find("pistol");
  installQualifiedInstanceCargo(f.ctx, f.plan);
  expect(f.db.instanceInventoryBinding.rows.size).toBe(4);
  expect(f.db.inventoryContainer.rows.size).toBe(5);
  expect(f.db.inventoryItem.rows.size).toBe(1);
  expect(f.db.inventoryItem.id.find("pistol")).toEqual(old);
  expect(() => installQualifiedInstanceCargo(f.ctx, f.plan)).toThrow(
    "already bound",
  );
});
it("actual ctx.db transfer removes old owner lookup, preserves identity, withdraws it and revokes views", () => {
  const f = fixture();
  installQualifiedInstanceCargo(f.ctx, f.plan);
  const reachable = reachableCargoContainers(f.ctx);
  expect(reachable.length).toBeGreaterThan(0);
  const target = reachable[0].id,
    request = f.request(target);
  moveScopedCargo(f.ctx, request);
  expect(f.db.inventoryItem.id.find("pistol").characterId).toBe("");
  expect(legacyInventorySnapshot(f.ctx, "actor").items).toHaveLength(0);
  expect(reachableCargoItems(f.ctx).map((i) => i.id)).toEqual(["pistol"]);
  expect(f.db.inventoryHotbar.id.find("slot-0").itemId).toBe("");
  moveScopedCargo(f.ctx, request);
  expect(f.db.inventoryContainerScope.containerId.find(target).revision).toBe(
    2n,
  );
  moveScopedCargo(f.ctx, {
    ...request,
    operationId: "retrieve",
    expectedItemRevision: 2n,
    expectedCharacterRevision: 2n,
    sourceContainerId: target,
    expectedSourceRevision: 2n,
    destinationContainerId: "pockets",
    expectedDestinationRevision: 2n,
  });
  expect(f.db.inventoryItem.id.find("pistol")).toMatchObject({
    id: "pistol",
    characterId: "actor",
    containerId: "pockets",
  });
  expect(legacyInventorySnapshot(f.ctx, "actor").items).toHaveLength(1);
  f.db.constructionGrant.id.update({
    ...f.db.constructionGrant.id.find("grant"),
    revoked: true,
  });
  expect(reachableCargoContainers(f.ctx)).toEqual([]);
  expect(() => moveScopedCargo(f.ctx, request)).toThrow("grant-denied");
});

it("preserves nested liquid payloads, projects their actual contents and rejects solid moves into reservoirs", () => {
  const f = fixture();
  installQualifiedInstanceCargo(f.ctx, f.plan);
  const before = legacyInventorySnapshot(f.ctx, "actor");
  f.db.inventoryItem.insert({
    id: "canister",
    characterId: "actor",
    definitionId: "resource-canister",
    containerId: "pockets",
    equipmentSlot: "",
    x: 3,
    y: 0,
    rotated: false,
  });
  f.db.inventoryContainer.insert({
    id: "reservoir",
    characterId: "actor",
    parentItemId: "canister",
    kind: "liquid",
    name: "Canister reservoir",
    width: 0,
    height: 0,
    maxMassKg: 4,
    capacityLitres: 5,
    amountLitres: 2,
    liquidType: "fuel",
    carried: false,
    shipId: "legacy-ship",
    localX: 0,
    localY: 0,
  });
  synchronizeLegacyInventory(f.ctx, "actor", before);
  const root = reachableCargoContainers(f.ctx)[0];
  moveScopedCargo(f.ctx, {
    ...f.request(root.id),
    itemId: "canister",
    expectedSourceRevision:
      f.db.inventoryContainerScope.containerId.find("pockets").revision,
  });
  expect(
    reachableCargoContainers(f.ctx).find((c) => c.id === "reservoir"),
  ).toMatchObject({
    parentItemId: "canister",
    kind: "liquid",
    capacityLitres: 5,
    amountLitres: 2,
    liquidType: "fuel",
  });
  const characterRevision =
    f.db.inventoryState.characterId.find("actor").revision;
  expect(() =>
    moveScopedCargo(f.ctx, {
      ...f.request("reservoir"),
      operationId: "invalid-liquid",
      expectedCharacterRevision: characterRevision,
      expectedSourceRevision:
        f.db.inventoryContainerScope.containerId.find("pockets").revision,
      expectedDestinationRevision:
        f.db.inventoryContainerScope.containerId.find("reservoir").revision,
    }),
  ).toThrow("liquid-container");
  expect(f.db.inventoryState.characterId.find("actor").revision).toBe(
    characterRevision,
  );
  moveScopedCargo(f.ctx, {
    ...f.request("pockets"),
    operationId: "retrieve-canister",
    itemId: "canister",
    expectedItemRevision: 2n,
    sourceContainerId: root.id,
    expectedSourceRevision: f.db.inventoryContainerScope.containerId.find(
      root.id,
    ).revision,
    expectedDestinationRevision:
      f.db.inventoryContainerScope.containerId.find("pockets").revision,
    expectedCharacterRevision: characterRevision,
    x: 3,
  });
  expect(f.db.inventoryContainer.id.find("reservoir")).toMatchObject({
    id: "reservoir",
    characterId: "actor",
    parentItemId: "canister",
    capacityLitres: 5,
    amountLitres: 2,
    liquidType: "fuel",
  });
});
