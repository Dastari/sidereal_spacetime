import { expect, test, vi } from "vitest";
import { Identity } from "spacetimedb";
import { readFileSync } from "node:fs";
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
import { readShipPrefab } from "@sidereal/content/ship-prefab";
import { prefabComponentCatalogFor } from "@sidereal/sim/prefab-catalog";
import { SHIP_OPERATOR } from "./ship-operator";
import { PRESERVED_MAP_TABLES, WIPED_SHIP_TABLES } from "./ship-wipe";
import { onboardNewCharacter } from "./ship-policy";
import {
  installPrefabShip,
  trustedPrefabTemplateFor,
} from "./prefab-ship-authority";
import {
  FED_WAYFARER_PIN,
  FED_WREN_PIN,
  FED_WREN_R8_PIN,
} from "./prefab-ship-pins";
import { clearConstructionCollisionCache } from "./construction-doors";
import { planPrefabReplacement, replacePrefabShip } from "./ship-replace";
import { installFactionFleet } from "./faction-fleet";
import { FEDERATION_FLEET_PIN_SET } from "./faction-fleet-pins";
import "./prefab-ship-spawners";
const HEAVY = { timeout: 120_000 };
type Row = Record<string, any>;
const PRIMARY: Record<string, string> = {
  shipFurnishingState: "shipId",
  shipPowerInstallation: "shipId",
  shipPowerState: "shipId",
  shipSystemsDirty: "shipId",
  shipSystemsState: "shipId",
  componentCatalogSnapshot: "pin",
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
  couchSeat: "characterId",
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
  by_container: "containerId",
};

/** In-memory tables with the SpacetimeDB accessor shape (copied from ship-wipe.test.ts). */
function fixture() {
  const tables = new Map<string, Row[]>();
  const key = (v: unknown) => String(v);
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
          delete: (row: Row) => {
            const at = rows.findIndex((r) => key(r[pk]) === key(row[pk]));
            if (at < 0) return false;
            rows.splice(at, 1);
            return true;
          },
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
            if (index === "count") return () => BigInt(rows.length);
            if (index === "by_cell")
              return {
                filter: ([systemId, cellX, cellY]: [string, bigint, bigint]) =>
                  rows.filter(
                    (r) =>
                      r.systemId === systemId &&
                      r.cellX === cellX &&
                      r.cellY === cellY,
                  ),
              };
            if (index === "by_revision")
              return {
                filter: () =>
                  [...rows].sort((a, b) =>
                    a.revision < b.revision
                      ? -1
                      : a.revision > b.revision
                        ? 1
                        : 0,
                  ),
              };
            const column = FIELD[index] ?? index;
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
  const raw = {
    db,
    sender: Identity.fromString("04".repeat(32)),
    live: true,
    timestamp: { microsSinceUnixEpoch: 123000000n },
    newUuidV4: () => ({
      toString: () =>
        `66666666-6666-4666-8666-${(sequence++).toString(16).padStart(12, "0")}`,
    }),
  };
  const as = (hex: string) => {
    raw.sender = Identity.fromString(hex);
  };
  for (const name of [...WIPED_SHIP_TABLES, ...PRESERVED_MAP_TABLES])
    void db[name];
  const json = (v: unknown) =>
    JSON.stringify(v, (_, x) =>
      typeof x === "bigint"
        ? x.toString()
        : x && typeof x.toHexString === "function"
          ? x.toHexString()
          : x,
    );
  const snapshot = (skip: readonly string[] = []) =>
    json(
      [...tables]
        .filter(([name, rows]) => rows.length && !skip.includes(name))
        .sort(([a], [b]) => a.localeCompare(b)),
    );
  return { ctx: raw as any, db, as, snapshot, json };
}

function sourceShip() {
  clearConstructionCollisionCache();
  const f = fixture();
  const characterId = onboardNewCharacter(f.ctx, "Owner");
  f.as(SHIP_OPERATOR);
  const old = readShipPrefab(
    JSON.parse(
      readFileSync(
        new URL("./fixtures/fed-s-wren-r8.prefab.json", import.meta.url),
        "utf8",
      ),
    ),
  );
  const template = trustedPrefabTemplateFor(
    old,
    prefabComponentCatalogFor(FED_WREN_R8_PIN.catalogRevision),
  );
  const { shipId, deckId } = installPrefabShip(
    f.ctx,
    f.db.character.id.find(characterId),
    { prefabId: old.id, pose: { kind: "berth" } },
    { template },
  );
  f.db.character.id.update({
    ...f.db.character.id.find(characterId),
    connected: false,
  });
  const args = {
    operationId: "replace-test-0001",
    dryRun: false,
    characterId,
    shipId,
    expectedSourceBlueprintSha256: FED_WREN_R8_PIN.blueprintSha256,
    expectedInstanceRevision: 1n,
    targetPrefabId: FED_WREN_PIN.prefabId,
    expectedTargetCatalogRevision: FED_WREN_PIN.catalogRevision,
    expectedTargetBlueprintSha256: FED_WREN_PIN.blueprintSha256,
    discardShipStorage: true,
  };
  return { f, args, shipId, deckId, characterId };
}
test(
  "additive install preserves current actor, admission, pilot/input and personal inventory",
  HEAVY,
  () => {
    const { f, characterId, shipId } = sourceShip();
    const tables = [
      "character",
      "constructionLocation",
      "worldAdmission",
      "input",
      "inputControl",
      "constructionPilotSeat",
      "couchSeat",
      "inventoryItem",
      "inventoryContainer",
      "personalStarterReceipt",
    ];
    const before = f.json(tables.map((name) => [...f.db[name].iter()]));
    const source = f.json(f.db.ship.id.find(shipId));
    const result = installPrefabShip(
      f.ctx,
      f.db.character.id.find(characterId),
      {
        prefabId: FED_WREN_PIN.prefabId,
        pose: {
          kind: "at",
          systemId: f.db.shipWorldMotion.shipId.find(shipId).systemId,
          x: 200,
          y: 200,
          heading: 0.5,
        },
      },
      { boardActor: false },
    );
    expect(result.shipId).not.toBe(shipId);
    expect(f.json(tables.map((name) => [...f.db[name].iter()]))).toBe(before);
    expect(f.json(f.db.ship.id.find(shipId))).toBe(source);
    expect(f.db.gameShipAccess.shipId.find(result.shipId).characterId).toBe(
      characterId,
    );
    expect(
      f.db.ship.id
        .find(result.shipId)
        .owner.isEqual(f.db.character.id.find(characterId).owner),
    ).toBe(true);
  },
);
test(
  "six-ship fleet installs atomically without boarding; exact replay creates no duplicates",
  HEAVY,
  () => {
    const { f, characterId, shipId } = sourceShip();
    const before = f.json({
      actor: f.db.character.id.find(characterId),
      location: f.db.constructionLocation.characterId.find(characterId),
      admission: f.db.worldAdmission.characterId.find(characterId),
      input: f.db.input.characterId.find(characterId),
    });
    const count = f.db.ship.rows.length;
    const request = {
      operationId: "fleet-test-0001",
      characterId,
      expectedShipId: shipId,
      expectedInstanceRevision: 1n,
      expectedFleetPinSet: FEDERATION_FLEET_PIN_SET,
    };
    installFactionFleet(f.ctx, request);
    expect(f.db.ship.rows.length).toBe(count + 6);
    expect(
      f.json({
        actor: f.db.character.id.find(characterId),
        location: f.db.constructionLocation.characterId.find(characterId),
        admission: f.db.worldAdmission.characterId.find(characterId),
        input: f.db.input.characterId.find(characterId),
      }),
    ).toBe(before);
    const snapshot = f.snapshot();
    installFactionFleet(f.ctx, request);
    expect(f.snapshot()).toBe(snapshot);
    expect(() =>
      installFactionFleet(f.ctx, { ...request, expectedInstanceRevision: 2n }),
    ).toThrow("different");
  },
);
test(
  "replacement preserves personal kit, unrelated actor/world, ship/deck ids, and replay is a no-op",
  HEAVY,
  () => {
    const { f, args, shipId, deckId, characterId } = sourceShip();
    f.db.character.insert({
      id: "unrelated",
      owner: Identity.fromString("ab".repeat(32)),
      name: "Other",
      shipId: "",
      localX: 0,
      localY: 0,
      connected: false,
      sprinting: false,
    });
    // Historical dropped roots retain a shipId but remain private character
    // inventory; they must survive rather than becoming disposable ship cargo.
    f.db.inventoryContainer.insert({
      ...f.db.inventoryContainer.rows[0],
      id: "legacy-private-root",
      shipId,
      characterId,
      parentItemId: "",
      kind: "grid",
      carried: false,
    });
    f.db.inventoryContainerScope.insert({
      containerId: "legacy-private-root",
      rootContainerId: "legacy-private-root",
      rootKind: "legacy-private",
      rootCharacterId: characterId,
      instanceId: "",
    });
    const legacyPrivate = f.json(
      f.db.inventoryContainer.id.find("legacy-private-root"),
    );
    const personal = f.json(f.db.inventoryItem.rows),
      actors = f.json(
        f.db.character.rows.filter((r: Row) => r.id !== characterId),
      );
    replacePrefabShip(f.ctx, args);
    expect(f.db.character.id.find(characterId).shipId).toBe(shipId);
    expect(f.db.constructionDeck.id.find(deckId).instanceId).toBe(shipId);
    expect(f.db.constructionInstance.id.find(shipId)).toMatchObject({
      revision: 2n,
      blueprintSha256: FED_WREN_PIN.blueprintSha256,
    });
    expect(f.json(f.db.inventoryItem.rows)).toBe(personal);
    expect(f.json(f.db.inventoryContainer.id.find("legacy-private-root"))).toBe(
      legacyPrivate,
    );
    expect(
      f.json(f.db.character.rows.filter((r: Row) => r.id !== characterId)),
    ).toBe(actors);
    const done = f.snapshot();
    replacePrefabShip(f.ctx, args);
    expect(f.snapshot()).toBe(done);
    expect(() =>
      replacePrefabShip(f.ctx, { ...args, discardShipStorage: false }),
    ).toThrow("different ship maintenance request");
  },
);
test(
  "dry-run only records the plan and validates explicit loss, source revision, target pin, and disconnect",
  HEAVY,
  () => {
    const { f, args } = sourceShip();
    const before = f.snapshot(["shipOperatorOperation"]);
    replacePrefabShip(f.ctx, { ...args, dryRun: true });
    expect(f.snapshot(["shipOperatorOperation"])).toBe(before);
    for (const override of [
      { discardShipStorage: false },
      { expectedInstanceRevision: 2n },
      { expectedTargetBlueprintSha256: "0".repeat(64) },
    ])
      expect(() =>
        planPrefabReplacement(f.ctx, { ...args, ...override }),
      ).toThrow();
    f.db.character.id.update({
      ...f.db.character.id.find(args.characterId),
      connected: true,
    });
    expect(() => planPrefabReplacement(f.ctx, args)).toThrow("disconnect");
  },
);
test(
  "operator replacement refuses unauthorized sender and other passengers before changing state",
  HEAVY,
  () => {
    const { f, args, shipId } = sourceShip();
    f.as("ab".repeat(32));
    const before = f.snapshot();
    expect(() => replacePrefabShip(f.ctx, args)).toThrow("Deployment operator");
    expect(f.snapshot()).toBe(before);
    f.as(SHIP_OPERATOR);
    f.db.character.insert({
      id: "passenger",
      owner: Identity.fromString("ab".repeat(32)),
      name: "Other",
      shipId,
      localX: 0,
      localY: 0,
      connected: false,
      sprinting: false,
    });
    const occupied = f.snapshot();
    expect(() => replacePrefabShip(f.ctx, args)).toThrow("other characters");
    expect(f.snapshot()).toBe(occupied);
  },
);
test(
  "only source-instance storage is discarded, including nested items, while carried roots stay exact",
  HEAVY,
  () => {
    const { f, args, shipId, deckId } = sourceShip();
    f.db.inventoryContainer.insert({
      id: "cargo",
      shipId,
      characterId: "",
      parentItemId: "",
      revision: 1n,
    });
    f.db.inventoryContainer.insert({
      id: "nested",
      shipId,
      characterId: "",
      parentItemId: "bag",
      revision: 1n,
    });
    for (const id of ["cargo", "nested"])
      f.db.inventoryContainerScope.insert({
        containerId: id,
        rootContainerId: "cargo",
        rootKind: "instance",
        rootCharacterId: "",
        instanceId: shipId,
        deckId,
      });
    for (const [id, containerId] of [
      ["bag", "cargo"],
      ["nested-item", "nested"],
    ]) {
      f.db.inventoryItem.insert({
        id,
        containerId,
        characterId: "",
        definitionId: "test",
        revision: 1n,
      });
      f.db.inventoryItemMembership.insert({
        itemId: id,
        containerId,
        rootContainerId: "cargo",
        rootCharacterId: "",
      });
      f.db.inventoryItemPin.insert({ itemId: id, definitionRef: "test@1" });
    }
    f.db.instanceInventoryBinding.insert({
      placedObjectId: "cargo-placement",
      containerId: "cargo",
      instanceId: shipId,
      deckId,
    });
    const p = planPrefabReplacement(f.ctx, args);
    expect(p.summary.discardedContainers).toBe(2);
    expect(p.summary.discardedItems).toBe(2);
    replacePrefabShip(f.ctx, args);
    expect(f.db.inventoryContainer.id.find("cargo")).toBeUndefined();
    expect(f.db.inventoryContainer.id.find("nested")).toBeUndefined();
    expect(f.db.inventoryItem.id.find("bag")).toBeUndefined();
    expect(f.db.inventoryItemPin.itemId.find("bag")).toBeUndefined();
    expect(
      f.db.shipWipeArchive.rows.some(
        (r: Row) => r.tableName === "inventoryItem",
      ),
    ).toBe(true);
  },
);

test(
  "foreign containment scope and moving source refuse without deleting anything",
  HEAVY,
  () => {
    const { f, args, shipId, deckId } = sourceShip();
    f.db.inventoryContainerScope.insert({
      containerId: "foreign-root",
      rootContainerId: "foreign-root",
      rootKind: "character",
      rootCharacterId: "other",
      instanceId: shipId,
      deckId,
    });
    const before = f.snapshot();
    expect(() => replacePrefabShip(f.ctx, args)).toThrow("instance-rooted");
    expect(f.snapshot()).toBe(before);
    f.db.inventoryContainerScope.containerId.delete("foreign-root");
    f.db.shipWorldMotion.shipId.update({
      ...f.db.shipWorldMotion.shipId.find(shipId),
      vx: 1,
    });
    const moving = f.snapshot();
    expect(() => replacePrefabShip(f.ctx, args)).toThrow("stationary");
    expect(f.snapshot()).toBe(moving);
  },
);

test(
  "trusted empty storage binding has qualified access, no items, and an idempotent binding",
  HEAVY,
  async () => {
    const { f, shipId } = sourceShip();
    const { issueEmptySocketStorage } = await import("./ship-cargo-operator");
    const before = f.db.inventoryItem.rows.length;
    const id = issueEmptySocketStorage(
      f.ctx,
      shipId,
      "hold/cargo.standard.medium",
      "Small crate",
    );
    const once = f.snapshot();
    expect(
      issueEmptySocketStorage(
        f.ctx,
        shipId,
        "hold/cargo.standard.medium",
        "Small crate",
      ),
    ).toBe(id);
    expect(f.snapshot()).toBe(once);
    expect(f.db.inventoryItem.rows.length).toBe(before);
    expect(f.db.inventoryContainerScope.containerId.find(id)).toMatchObject({
      instanceId: shipId,
      rootKind: "instance",
      lifecycle: "active",
    });
  },
);

test(
  "a second real installed ship and its actor remain byte-identical",
  HEAVY,
  () => {
    const { f, args } = sourceShip();
    f.as("ab".repeat(32));
    const otherActor = onboardNewCharacter(f.ctx, "Other owner");
    f.as(SHIP_OPERATOR);
    const other = installPrefabShip(f.ctx, f.db.character.id.find(otherActor), {
      prefabId: FED_WREN_PIN.prefabId,
      pose: { kind: "berth" },
    });
    const otherIds = new Set([
      other.shipId,
      other.deckId,
      otherActor,
      ...f.db.station.rows
        .filter((r: Row) => r.shipId === other.shipId)
        .map((r: Row) => r.id),
      ...f.db.interactionObject.rows
        .filter((r: Row) => r.shipId === other.shipId)
        .map((r: Row) => r.id),
    ]);
    const snapshotOther = () =>
      f.json(
        [...WIPED_SHIP_TABLES, "character"].map((t) => [
          t,
          f.db[t].rows.filter((r: Row) =>
            Object.values(r).some((v) => otherIds.has(v as string)),
          ),
        ]),
      );
    const before = snapshotOther();
    replacePrefabShip(f.ctx, args);
    expect(snapshotOther()).toBe(before);
  },
);

test(
  "actual cross-prefab Wren to authored Wayfarer install is active with eight empty usable inventories",
  HEAVY,
  () => {
    const { f, args, shipId, deckId } = sourceShip();
    replacePrefabShip(f.ctx, {
      ...args,
      targetPrefabId: FED_WAYFARER_PIN.prefabId,
      expectedTargetCatalogRevision: FED_WAYFARER_PIN.catalogRevision,
      expectedTargetBlueprintSha256: FED_WAYFARER_PIN.blueprintSha256,
    });
    expect(f.db.constructionInstance.id.find(shipId)).toMatchObject({
      revision: 2n,
      blueprintSha256: FED_WAYFARER_PIN.blueprintSha256,
    });
    expect(f.db.constructionFlightBinding.shipId.find(shipId)).toMatchObject({
      lifecycle: "active",
      definitionSha256: FED_WAYFARER_PIN.flightDefinitionSha256,
    });
    const bindings = f.db.instanceInventoryBinding.rows.filter(
      (r: Row) => r.instanceId === shipId,
    );
    expect(bindings).toHaveLength(8);
    for (const binding of bindings) {
      expect(binding.deckId).toBe(deckId);
      expect(
        f.db.inventoryContainer.id.find(binding.containerId),
      ).toMatchObject({ shipId, characterId: "" });
      expect(
        f.db.inventoryItem.rows.filter(
          (r: Row) => r.containerId === binding.containerId,
        ),
      ).toHaveLength(0);
    }
  },
);

test(
  "source replacement cycle clears furnishing overrides while retaining ship identity and archives",
  HEAVY,
  () => {
    const { f, args, shipId } = sourceShip();
    const change = (pin: typeof FED_WAYFARER_PIN, op: string) => {
      const source = f.db.constructionInstance.id.find(shipId);
      replacePrefabShip(f.ctx, {
        ...args,
        operationId: op,
        expectedSourceBlueprintSha256: source.blueprintSha256,
        expectedInstanceRevision: source.revision,
        targetPrefabId: pin.prefabId,
        expectedTargetCatalogRevision: pin.catalogRevision,
        expectedTargetBlueprintSha256: pin.blueprintSha256,
      });
    };
    change(FED_WAYFARER_PIN, "source-cycle-wayfarer-1");
    const overlay = {
      shipId,
      revision: 9n,
      overridesJson: JSON.stringify({
        Lounge_coffee_table: {
          dx: 1,
          dy: 0,
          yaw: 0,
          snap: false,
          deleted: false,
        },
      }),
    };
    f.db.shipFurnishingState.insert(overlay);
    change(FED_WREN_PIN, "source-cycle-wren");
    expect(f.db.shipFurnishingState.shipId.find(shipId)).toBeUndefined();
    expect(
      f.db.shipWipeArchive.rows.some(
        (r: Row) =>
          r.tableName === "shipFurnishingState" &&
          r.rowJson.includes("Lounge_coffee_table"),
      ),
    ).toBe(true);
    change(FED_WAYFARER_PIN, "source-cycle-wayfarer-2");
    expect(f.db.shipFurnishingState.shipId.find(shipId)).toBeUndefined();
    expect(f.db.constructionInstance.id.find(shipId).revision).toBe(4n);
  },
);
