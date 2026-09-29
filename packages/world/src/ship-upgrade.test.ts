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
import { readFileSync } from "node:fs";
import { readShipPrefab } from "@sidereal/content/ship-prefab";
import { CREW_WARDROBE_KITS } from "@sidereal/content/crew-wardrobe";
import { prefabComponentCatalogFor } from "@sidereal/sim/prefab-catalog";
import { prefabCargoSockets } from "@sidereal/sim/prefab-cargo-sockets";
import { canOccupyDeck } from "@sidereal/sim/construction-collision";
import { SHIP_OPERATOR } from "./ship-operator";
import { PRESERVED_MAP_TABLES, WIPED_SHIP_TABLES } from "./ship-wipe";
import { onboardNewCharacter } from "./ship-policy";
import {
  installPrefabShip,
  trustedPrefabTemplate,
  trustedPrefabTemplateFor,
} from "./prefab-ship-authority";
import { stockShipCargo } from "./ship-cargo-operator";
import {
  clearConstructionCollisionCache,
  constructionCollision,
} from "./construction-doors";
import { compileShipFlight } from "./construction-flight-compilation";
import { readConstructionFlightInput } from "./construction-flight-input";
import {
  FED_WREN_PIN,
  FED_WREN_R2_PIN,
  FED_WREN_R3_PIN,
  FED_WREN_R4_PIN,
  FED_WREN_R5_PIN,
  FED_WREN_R6_PIN,
  PREFAB_UPGRADE_SOURCES,
  type PinnedPrefabShip,
} from "./prefab-ship-pins";
import {
  UPGRADE_KEPT_SHIP_TABLES,
  UPGRADE_PRESENCE_TABLES,
  UPGRADE_REBUILT_SHIP_TABLES,
  UPGRADE_REFUSED_SHIP_TABLES,
  upgradePrefabShip,
} from "./ship-upgrade";
import { stepShipSystems } from "./ship-systems";

const HEAVY = { timeout: 120_000 };
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
  couchSeat: "characterId",
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

const OWNER = "04".repeat(32);
const legacy = (n: number) =>
  readShipPrefab(
    JSON.parse(
      readFileSync(
        new URL(`./fixtures/fed-s-wren-r${n}.prefab.json`, import.meta.url),
        "utf8",
      ),
    ),
  );

/** An owner aboard a Wren of the given pinned revision, hold crate and wall locker stocked. */
function liveWren(pin: PinnedPrefabShip, revision: number) {
  clearConstructionCollisionCache();
  const f = fixture();
  f.as(OWNER);
  const characterId = onboardNewCharacter(f.ctx, "Toby");
  f.as(SHIP_OPERATOR);
  const template = trustedPrefabTemplateFor(
    legacy(revision),
    prefabComponentCatalogFor(pin.catalogRevision),
  );
  expect(template.snapshot.sha256).toBe(pin.blueprintSha256);
  const { shipId, deckId } = installPrefabShip(
    f.ctx,
    f.db.character.id.find(characterId),
    { prefabId: "fed.s.wren", pose: { kind: "berth" } },
    { template },
  );
  // Personal containers follow their character aboard (as boardPrefabShip does).
  for (const c of f.db.inventoryContainer.rows)
    if (c.characterId === characterId) c.shipId = shipId;
  for (const [socketKey, kit, name] of [
    ["hold/cargo.standard.medium", "uniforms-and-tiers", "Storage crate"],
    ["bunks/shipyard.equipment.wall-locker", "role-sets", "Wall locker"],
  ] as const)
    stockShipCargo(f.ctx, {
      operationId: `stock-${kit}`,
      dryRun: false,
      characterId,
      shipId,
      socketKey,
      containerName: name,
      definitionIdsJson: JSON.stringify(CREW_WARDROBE_KITS[kit]),
    });
  return { f, characterId, shipId, deckId };
}

const heldInventory = (f: ReturnType<typeof fixture>, shipId: string) => {
  const containers = f.db.inventoryContainer.rows
    .filter((c: Row) => c.shipId === shipId)
    .map((c: Row) => c.id)
    .sort();
  const items = f.db.inventoryItem.rows
    .filter((i: Row) => containers.includes(i.containerId))
    .map((i: Row) => `${i.id}@${i.containerId}:${i.x},${i.y}`)
    .sort();
  return { containers, items };
};

const upgradeArgs = (
  shipId: string,
  pin: PinnedPrefabShip,
  over: Record<string, unknown> = {},
) => ({
  operationId: "upgrade-wren-r5-0001",
  dryRun: false,
  shipId,
  expectedSourceBlueprintSha256: pin.blueprintSha256,
  expectedInstanceRevision: 1n,
  targetPrefabId: "fed.s.wren",
  expectedTargetBlueprintSha256: FED_WREN_PIN.blueprintSha256,
  ...over,
});

test("upgrade table lists classify wiped per-ship tables once; the rest refuse", () => {
  const listed = [
    ...UPGRADE_REBUILT_SHIP_TABLES.map(([t]) => t),
    ...UPGRADE_REFUSED_SHIP_TABLES.map(([t]) => t),
    ...UPGRADE_KEPT_SHIP_TABLES,
    ...UPGRADE_PRESENCE_TABLES,
  ];
  expect(new Set(listed).size).toBe(listed.length);
  // Every classified table is a wiped per-ship table. A wiped table added later without a
  // classification refuses the upgrade when it holds rows for the ship (planPrefabUpgrade).
  for (const t of listed) expect(WIPED_SHIP_TABLES, t).toContain(t);

  expect(PREFAB_UPGRADE_SOURCES).toEqual([
    FED_WREN_R2_PIN,
    FED_WREN_R3_PIN,
    FED_WREN_R4_PIN,
    FED_WREN_R5_PIN,
    FED_WREN_R6_PIN,
  ]);
  expect(trustedPrefabTemplate("fed.s.wren").snapshot.sha256).toBe(
    FED_WREN_PIN.blueprintSha256,
  );
});

// Construction collision caches by instance id + revision, and every fixture mints the same ids
// for different source revisions, so each liveWren starts from an empty cache.
const upgradeCase = (pin: PinnedPrefabShip, revision: number) =>
  test(
    `a live Wren r${revision} upgrades to r7 in place: same ship, deck, pose, containers and items`,
    HEAVY,
    () => {
      const { f, characterId, shipId, deckId } = liveWren(pin, revision);
      const before = heldInventory(f, shipId);
      // 18 + 27 stocked items and the owner's carried kit, in the crate, locker and pockets.
      const bound = f.db.instanceInventoryBinding.rows.map((b: Row) => ({
        ...b,
      }));
      expect(bound.map((b: Row) => b.placedObjectId).sort()).toEqual([
        `${shipId}:${deckId}:bunks/shipyard.equipment.wall-locker`,
        `${shipId}:${deckId}:hold/cargo.standard.medium`,
      ]);
      const stocked = (containerId: string) =>
        f.db.inventoryItem.rows.filter(
          (i: Row) => i.containerId === containerId,
        ).length;
      expect(bound.map((b: Row) => stocked(b.containerId)).sort()).toEqual([
        18, 27,
      ]);
      const motion = { ...f.db.shipWorldMotion.shipId.find(shipId) };
      const shipBefore = { ...f.db.ship.id.find(shipId) };

      // Dry run: a ledger row with the plan and nothing else.
      const quiet = f.snapshot(["shipOperatorOperation"]);
      upgradePrefabShip(
        f.ctx,
        upgradeArgs(shipId, pin, {
          operationId: "upgrade-dry-0001",
          dryRun: true,
        }),
      );
      expect(f.snapshot(["shipOperatorOperation"])).toBe(quiet);
      const plan = JSON.parse(
        f.db.shipOperatorOperation.operationId.find("upgrade-dry-0001")
          .summaryJson,
      );
      expect(plan.refusals).toEqual([]);
      expect(plan.sockets.map((s: Row) => s.socketKey).sort()).toEqual([
        "bunks/shipyard.equipment.wall-locker",
        "hold/cargo.standard.medium",
      ]);
      expect(plan.sockets.every((s: Row) => s.toAccessM)).toBe(true);

      // Apply.
      upgradePrefabShip(f.ctx, upgradeArgs(shipId, pin));
      const instance = f.db.constructionInstance.id.find(shipId);
      expect(instance.blueprintSha256).toBe(FED_WREN_PIN.blueprintSha256);
      expect(instance.blueprintId).toBe("trusted-prefab:fed.s.wren:r7");
      expect(instance.revision).toBe(2n);
      expect(f.db.constructionDeck.rows.map((d: Row) => d.id)).toEqual([
        deckId,
      ]);
      expect(f.db.constructionFlightBinding.shipId.find(shipId)).toMatchObject({
        definitionSha256: FED_WREN_PIN.flightDefinitionSha256,
        instanceRevision: 2n,
        lifecycle: "active",
      });
      const ship = f.db.ship.id.find(shipId);
      expect(ship.name).toBe(shipBefore.name);
      expect(ship.owner.toHexString()).toBe(OWNER);
      expect(ship.revision).toBeGreaterThan(shipBefore.revision);
      expect(f.db.ship.rows).toHaveLength(1);
      const after = f.db.shipWorldMotion.shipId.find(shipId);
      for (const k of ["systemId", "x", "y", "heading"])
        expect(after[k], k).toBe(motion[k]);
      expect(f.db.gameShipAccess.shipId.find(shipId)).toMatchObject({
        characterId,
        instanceRevision: 2n,
        templateSha256: FED_WREN_PIN.blueprintSha256,
        lifecycle: "active",
      });
      expect(f.db.station.shipId.find(shipId).operational).toBe(true);
      expect(f.db.constructionFlightCompiled.shipId.find(shipId)).toMatchObject(
        { status: "ready", reason: "" },
      );

      // Every container and item kept its identity, container and grid position.
      expect(heldInventory(f, shipId)).toEqual(before);
      expect(
        f.db.instanceInventoryBinding.rows.map((b: Row) => ({ ...b })),
      ).toEqual(bound);
      // ...and the storage roots now sit at the r7 sockets with a qualified approach.
      const sockets = new Map(
        prefabCargoSockets(
          readShipPrefab(JSON.parse(instance.documentJson).prefab.document),
          0,
        ).map((s) => [s.key, s]),
      );
      const frame = constructionCollision(f.ctx, instance, deckId);
      for (const b of bound) {
        const key = b.placedObjectId.split(":").slice(2).join(":");
        const container = f.db.inventoryContainer.id.find(b.containerId);
        expect([container.localX, container.localY]).toEqual(
          sockets.get(key)!.centreM,
        );
        for (const scope of f.db.inventoryContainerScope.rows.filter(
          (s: Row) => s.rootContainerId === b.containerId,
        )) {
          expect(scope).toMatchObject({
            instanceId: shipId,
            deckId,
            placedObjectId: b.placedObjectId,
            instanceRevision: 2n,
            lifecycle: "active",
          });
          expect(
            canOccupyDeck(
              frame,
              {
                shipId,
                deckId,
                position: [scope.accessX, scope.accessY],
              },
              0.3,
            ),
          ).toBe(true);
        }
      }
      // The owner stands at the r7 spawn with the next-revision game-ship access allowed.
      const actor = f.db.character.id.find(characterId);
      expect(actor.shipId).toBe(shipId);
      expect(
        canOccupyDeck(
          frame,
          { shipId, deckId, position: [actor.localX, actor.localY] },
          0.3,
        ),
      ).toBe(true);
      expect(
        f.db.constructionLocation.characterId.find(characterId),
      ).toMatchObject({ instanceId: shipId, deckId });
      // Before-images of everything deleted or updated are archived under the operation.
      const archived = f.db.shipWipeArchive.rows.filter(
        (r: Row) => r.operationId === "upgrade-wren-r5-0001",
      );
      expect(archived.map((r: Row) => r.tableName)).toEqual(
        expect.arrayContaining([
          "constructionInstance",
          "ship",
          "inventoryContainer",
          "inventoryContainerScope",
          "character",
        ]),
      );
      // Replaying the operation is a no-op; reusing its ID for another request is refused.
      const done = f.snapshot();
      upgradePrefabShip(f.ctx, upgradeArgs(shipId, pin));
      expect(f.snapshot()).toBe(done);
      expect(() =>
        upgradePrefabShip(
          f.ctx,
          upgradeArgs(shipId, pin, { expectedInstanceRevision: 2n }),
        ),
      ).toThrow("different ship maintenance request");
      // A second upgrade to the same target is refused: the ship already has it.
      expect(() =>
        upgradePrefabShip(
          f.ctx,
          upgradeArgs(shipId, pin, {
            operationId: "upgrade-wren-r5-0002",
            expectedInstanceRevision: 2n,
          }),
        ),
      ).toThrow("already has the target revision");
    },
  );

upgradeCase(FED_WREN_R3_PIN, 3);
upgradeCase(FED_WREN_R2_PIN, 2);

test(
  "S4-1: install queues a systems compile; the in-place upgrade rebuilds it at the new revision",
  HEAVY,
  () => {
    const { f, shipId } = liveWren(FED_WREN_R4_PIN, 4);
    expect(f.db.shipSystemsDirty.shipId.find(shipId)).toMatchObject({
      reason: "install",
    });
    stepShipSystems(f.ctx);
    const r4 = { ...f.db.shipSystemsState.shipId.find(shipId) };
    expect(r4).toMatchObject({
      prefabRevision: 4,
      instanceRevision: 1n,
      catalog: FED_WREN_R4_PIN.catalogRevision,
    });
    upgradePrefabShip(f.ctx, upgradeArgs(shipId, FED_WREN_R4_PIN));
    // The rebuilt row was archived and deleted; the reinstall queued a refit compile.
    expect(f.db.shipSystemsState.shipId.find(shipId)).toBeUndefined();
    expect(f.db.shipSystemsDirty.shipId.find(shipId)).toMatchObject({
      reason: "refit",
    });
    stepShipSystems(f.ctx);
    const r5 = f.db.shipSystemsState.shipId.find(shipId);
    expect(r5).toMatchObject({
      prefabRevision: trustedPrefabTemplate("fed.s.wren").prefab.revision,
      instanceRevision: 2n,
      catalog: FED_WREN_PIN.catalogRevision,
    });
    expect(r5.inputHash).not.toBe(r4.inputHash);
  },
);

test(
  "a stocked prefab ship compiles flight with its storage payload at the sockets",
  HEAVY,
  () => {
    const { f, shipId } = liveWren(FED_WREN_R3_PIN, 3);
    const bare = { ...f.db.constructionFlightCompiled.shipId.find(shipId) };
    expect(bare.status).toBe("ready");
    compileShipFlight(f.db as never, shipId, (id) =>
      readConstructionFlightInput(f.ctx, id),
    );
    const stocked = f.db.constructionFlightCompiled.shipId.find(shipId);
    expect(stocked.reason).toBe("");
    expect(stocked.status).toBe("ready");
    // 45 wardrobe items now fly with the ship.
    expect(stocked.massKg).toBeGreaterThan(bare.massKg);
    const input = readConstructionFlightInput(f.ctx, shipId) as unknown as {
      cargo?: { containerId: string; position: readonly number[] }[];
    };
    const containers = new Map(
      f.db.inventoryContainer.rows.map((c: Row) => [c.id, c]),
    );
    for (const b of f.db.instanceInventoryBinding.rows) {
      const c = containers.get(b.containerId) as Row;
      const mass = JSON.stringify(input).includes(b.containerId);
      expect(mass, b.placedObjectId).toBe(true);
      expect(c.shipId).toBe(shipId);
    }
  },
);

test("refuses unsafe upgrades and changes nothing", HEAVY, () => {
  const { f, characterId, shipId } = liveWren(FED_WREN_R3_PIN, 3);
  const refused = (
    mutate: () => void,
    undo: () => void,
    reason: string,
    over: Record<string, unknown> = {},
  ) => {
    mutate();
    const before = f.snapshot();
    expect(() =>
      upgradePrefabShip(f.ctx, upgradeArgs(shipId, FED_WREN_R3_PIN, over)),
    ).toThrow(reason);
    expect(f.snapshot()).toBe(before);
    undo();
  };
  const station = f.db.station.shipId.find(shipId);
  refused(
    () => f.db.station.id.update({ ...station, occupantId: characterId }),
    () => f.db.station.id.update(station),
    "pilot station is occupied",
  );
  const motion = f.db.shipWorldMotion.shipId.find(shipId);
  refused(
    () => f.db.shipWorldMotion.shipId.update({ ...motion, vx: 3 }),
    () => f.db.shipWorldMotion.shipId.update(motion),
    "ship is moving",
  );
  refused(
    () => undefined,
    () => undefined,
    "instance revision is 1, not 7",
    { expectedInstanceRevision: 7n },
  );
  refused(
    () => undefined,
    () => undefined,
    "source blueprint differs",
    { expectedSourceBlueprintSha256: FED_WREN_R2_PIN.blueprintSha256 },
  );
  const [binding] = f.db.instanceInventoryBinding.rows;
  const renamed = binding.placedObjectId.replace(
    "hold/cargo.standard.medium",
    "hold/cargo.standard.medium#9",
  );
  refused(
    () => {
      f.db.instanceInventoryBinding.delete(binding);
      f.db.instanceInventoryBinding.insert({
        ...binding,
        placedObjectId: renamed,
      });
    },
    () => {
      f.db.instanceInventoryBinding.placedObjectId.delete(renamed);
      f.db.instanceInventoryBinding.insert(binding);
    },
    "has no equivalent in the target revision",
  );
  f.db.character.insert({
    id: "passenger",
    owner: Identity.fromString("07".repeat(32)),
    name: "Guest",
    shipId,
    localX: 0,
    localY: 0,
    connected: false,
  });
  refused(
    () => undefined,
    () => f.db.character.id.delete("passenger"),
    "other characters are aboard",
  );
  // Only the deployment operator may upgrade.
  f.as(OWNER);
  expect(() =>
    upgradePrefabShip(f.ctx, upgradeArgs(shipId, FED_WREN_R3_PIN)),
  ).toThrow("Deployment operator required");
});

upgradeCase(FED_WREN_R4_PIN, 4);
upgradeCase(FED_WREN_R5_PIN, 5);
upgradeCase(FED_WREN_R6_PIN, 6);
