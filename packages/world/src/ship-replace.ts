/** Explicit operator replacement of ONE owned prefab, with loss limited to its ship-held storage. */
import {
  SenderError,
  type InferSchema,
  type ReducerCtx,
} from "spacetimedb/server";
import type world from "./index";
import { readShipPrefab } from "@sidereal/content/ship-prefab";
import {
  isPrefabConstruction,
  PREFAB_DECK_ID,
} from "@sidereal/sim/prefab-construction";
import { prefabComponentCatalogFor } from "@sidereal/sim/prefab-catalog";
import { PREFAB_FLIGHT_DEFINITION } from "@sidereal/sim/prefab-flight";
import {
  archiveJson,
  archiveRow,
  PRESERVED_MAP_TABLES,
  priorOperation,
  requireShipOperator,
} from "./ship-operator";
import {
  currentComponentCatalog,
  currentComponentSnapshot,
  syncComponentSnapshots,
  effectivePrefabPin,
} from "./component-catalog";
import {
  installPrefabShip,
  trustedPrefabTemplateFor,
} from "./prefab-ship-authority";
import {
  PREFAB_UPGRADE_SOURCES,
  REGISTERED_PREFAB_PINS,
} from "./prefab-ship-pins";
import { WIPED_SHIP_TABLES } from "./ship-wipe";
import { GAME_OWNED_TEMPLATE_NAMESPACE } from "./game-ship-access-authority";
import { TRUSTED_PREFAB_BLUEPRINT_PREFIX } from "@sidereal/sim/game-ship-access";
import { prefabById } from "@sidereal/content/prefabs";
import { prefabCargoSockets } from "@sidereal/sim/prefab-cargo-sockets";
import { issueEmptySocketStorage } from "./ship-cargo-operator";
import { defaultPrefabComponentCatalog } from "@sidereal/content/ship-prefab-catalog";
import {
  snapshotPin,
  registerComponentCatalogSnapshot,
} from "@sidereal/sim/component-catalogs";

type Context = ReducerCtx<InferSchema<typeof world>>;
type Db = Context["db"];
type Row = Record<string, unknown>;
const ROW_BUDGET = 200_000;
export interface ReplacePrefabShipArgs {
  operationId: string;
  dryRun: boolean;
  characterId: string;
  shipId: string;
  expectedSourceBlueprintSha256: string;
  expectedInstanceRevision: bigint;
  targetPrefabId: string;
  expectedTargetCatalogRevision: string;
  expectedTargetBlueprintSha256: string;
  discardShipStorage: boolean;
}
function fail(reason: string): never {
  throw new SenderError("Prefab replacement: " + reason);
}
function rows(db: Db, table: keyof Db): Row[] {
  const out: Row[] = [];
  for (const row of (
    db[table] as unknown as { iter(): Iterable<Row> }
  ).iter()) {
    if (out.length >= ROW_BUDGET) fail(`${String(table)} scan budget exceeded`);
    out.push(row);
  }
  return out;
}
const rowFingerprint = (values: readonly unknown[]) =>
  JSON.stringify(values.map(archiveJson).sort());

const INVENTORY_TABLES = [
  "inventoryContainer",
  "inventoryItem",
  "inventoryContainerScope",
  "inventoryItemMembership",
  "inventoryHotbar",
  "storageBinding",
  "weaponEnergy",
  "inventoryItemPin",
] as const satisfies readonly (keyof Db)[];
const REF_FIELDS = [
  "shipId",
  "instanceId",
  "deckId",
  "objectId",
  "stationId",
  "bodyId",
] as const;

/** Read-only planning. A dry-run writes only the private operation ledger. */
export function planPrefabReplacement(
  ctx: Context,
  args: ReplacePrefabShipArgs,
) {
  const S = args.shipId,
    actor = ctx.db.character.id.find(args.characterId),
    ship = ctx.db.ship.id.find(S),
    instance = ctx.db.constructionInstance.id.find(S),
    motion = ctx.db.shipWorldMotion.shipId.find(S),
    access = ctx.db.gameShipAccess.shipId.find(S);
  if (!actor || !ship || !instance || !motion || !access)
    fail("complete character, ship, instance, motion and access required");
  if (
    actor.shipId !== S ||
    access.characterId !== actor.id ||
    actor.owner.toHexString() !== ship.owner.toHexString() ||
    access.owner.toHexString() !== actor.owner.toHexString()
  )
    fail("character, ship and access ownership differ");
  if (
    instance.workspaceId !== GAME_OWNED_TEMPLATE_NAMESPACE ||
    !instance.blueprintId.startsWith(TRUSTED_PREFAB_BLUEPRINT_PREFIX)
  )
    fail("trusted game-owned prefab required");
  const document = JSON.parse(instance.documentJson) as unknown;
  if (!isPrefabConstruction(document))
    fail("source is not a prefab construction");
  const sourcePrefab = readShipPrefab(document.prefab.document),
    sourceCatalog = prefabComponentCatalogFor(document.prefab.catalog);
  if (
    ![...PREFAB_UPGRADE_SOURCES, ...REGISTERED_PREFAB_PINS].some(
      (p) =>
        p.prefabId === sourcePrefab.id &&
        (p.blueprintSha256 === instance.blueprintSha256 ||
          effectivePrefabPin(p, sourceCatalog).blueprintSha256 ===
            instance.blueprintSha256),
    )
  )
    fail("unknown source blueprint pin");
  if (
    instance.blueprintSha256 !== args.expectedSourceBlueprintSha256 ||
    instance.revision !== args.expectedInstanceRevision
  )
    fail("source blueprint or revision changed; resolve again");
  const registered = REGISTERED_PREFAB_PINS.find(
    (p) => p.prefabId === args.targetPrefabId,
  );
  if (!registered) fail("target prefab is not registered");
  syncComponentSnapshots(ctx.db);
  const snapshot = currentComponentSnapshot(ctx.db);
  const catalog =
      !snapshot.components.length && !snapshot.removed.length
        ? defaultPrefabComponentCatalog()
        : (() => {
            const { pin, canonical } = snapshotPin(snapshot);
            registerComponentCatalogSnapshot(pin, canonical);
            return prefabComponentCatalogFor(pin);
          })(),
    target = effectivePrefabPin(registered, catalog),
    prefab = prefabById(target.prefabId);
  if (!prefab) fail("target prefab content missing");
  if (
    target.catalogRevision !== args.expectedTargetCatalogRevision ||
    target.blueprintSha256 !== args.expectedTargetBlueprintSha256
  )
    fail("target catalog or blueprint pin changed");
  if (target.blueprintSha256 === instance.blueprintSha256)
    fail("ship already has this target blueprint");
  if (!args.discardShipStorage)
    fail("explicit discardShipStorage authorization required");
  if (actor.connected)
    fail("target character must disconnect before replacement");
  if (access.lifecycle !== "active") fail("active game-ship access required");
  if (Math.hypot(motion.vx, motion.vy) > 0.05 || Math.abs(motion.omega) > 0.01)
    fail("ship must be stationary");
  const decks = [...ctx.db.constructionDeck.by_instance.filter(S)],
    deck = decks.find((d) => d.sourceDeckId === PREFAB_DECK_ID);
  if (!deck || decks.length !== 1) fail("exactly one prefab deck required");
  if (
    [...ctx.db.character.by_ship.filter(S)].some((a) => a.id !== actor.id) ||
    [...ctx.db.constructionLocation.by_instance.filter(S)].some(
      (a) => a.characterId !== actor.id,
    )
  )
    fail("other characters are aboard or visiting");
  const station = ctx.db.station.shipId.find(S);
  if (
    station?.occupantId ||
    ctx.db.constructionPilotSeat.characterId.find(actor.id)
  )
    fail("pilot seat occupied");
  const objects = new Set(
    rows(ctx.db, "interactionObject")
      .filter((r) => r.shipId === S)
      .map((r) => r.id),
  );
  if (rows(ctx.db, "couchSeat").some((r) => objects.has(r.objectId)))
    fail("seat occupied");
  // Do not interrupt another operation, visitor or traversal. Installed static ship hardware is disposable.
  for (const table of [
    "constructionStairWalk",
    "constructionStairReservation",
    "constructionTraversal",
    "constructionTraversalReservation",
    "constructionPassengerGrant",
    "constructionPassengerVisit",
    "constructionFlightReview",
    "constructionReviewOrigin",
    "evaBody",
    "evaAirlockCycle",
  ] as const) {
    if (
      rows(ctx.db, table).some(
        (r) =>
          r.shipId === S || r.instanceId === S || r.characterId === actor.id,
      )
    )
      fail(`${table} has active source-ship state`);
  }
  const scopes = rows(ctx.db, "inventoryContainerScope"),
    selectedScopes = scopes.filter((r) => r.instanceId === S);
  if (selectedScopes.some((r) => r.rootKind !== "instance"))
    fail("source ship inventory is not wholly instance-rooted");
  const roots = new Set(selectedScopes.map((r) => r.rootContainerId)),
    containers = new Set(selectedScopes.map((r) => r.containerId));
  if (
    scopes.some(
      (r) => roots.has(r.rootContainerId) && !containers.has(r.containerId),
    )
  )
    fail("storage root crosses instance scope");
  const memberships = rows(ctx.db, "inventoryItemMembership"),
    items = new Set(
      memberships
        .filter((r) => roots.has(r.rootContainerId))
        .map((r) => r.itemId),
    );
  if (
    memberships.some(
      (r) => containers.has(r.containerId) !== items.has(r.itemId),
    )
  )
    fail("storage membership crosses containment root");
  // Legacy dropped/private inventory remains character-owned, even when its
  // historical shipId matches this ship. It is not qualified ship-root storage.
  const personalScopes = scopes.filter(
      (r) =>
        (r.rootKind === "character" || r.rootKind === "legacy-private") &&
        !r.instanceId &&
        !!r.rootCharacterId,
    ),
    personalContainers = new Set(personalScopes.map((r) => r.containerId));
  if (
    rows(ctx.db, "inventoryContainer").some(
      (r) =>
        r.shipId === S &&
        !containers.has(r.id) &&
        !personalContainers.has(r.id),
    )
  )
    fail("unclassified source ship container");
  if (
    rows(ctx.db, "inventoryItem").some(
      (r) => containers.has(r.containerId) !== items.has(r.id),
    )
  )
    fail("item payload and scoped membership differ");
  const inventoryRows = new Map<keyof Db, Row[]>();
  for (const table of INVENTORY_TABLES)
    inventoryRows.set(
      table,
      rows(ctx.db, table).filter((r) =>
        table === "inventoryContainer"
          ? containers.has(r.id)
          : table === "inventoryItem"
            ? items.has(r.id)
            : table === "inventoryContainerScope" || table === "storageBinding"
              ? containers.has(r.containerId)
              : items.has(r.itemId),
      ),
    );
  const relatedIds = new Set<unknown>([
    S,
    deck.id,
    ...objects,
    ...(station ? [station.id] : []),
  ]);
  const shipRows = new Map<keyof Db, Row[]>();
  for (const table of WIPED_SHIP_TABLES)
    shipRows.set(
      table,
      rows(ctx.db, table).filter(
        (r) =>
          relatedIds.has(r.id) ||
          REF_FIELDS.some((k) => relatedIds.has(r[k])) ||
          ([
            "constructionLocation",
            "worldAdmission",
            "input",
            "couchSeat",
            "constructionPilotSeat",
          ].includes(table) &&
            r.characterId === actor.id),
      ),
    );
  // A foreign actor reference on any selected presence row is a fail-closed boundary.
  for (const [table, selected] of shipRows)
    if (
      selected.some(
        (r) =>
          typeof r.characterId === "string" &&
          r.characterId &&
          r.characterId !== actor.id,
      )
    )
      fail(`${String(table)} references another character`);
  return {
    actor,
    ship,
    instance,
    motion,
    deck,
    target,
    template: trustedPrefabTemplateFor(prefab, catalog),
    shipRows,
    inventoryRows,
    containers,
    items,
    summary: {
      characterId: actor.id,
      shipId: S,
      deckId: deck.id,
      sourceBlueprintSha256: instance.blueprintSha256,
      sourceInstanceRevision: instance.revision,
      targetPrefabId: target.prefabId,
      targetCatalogRevision: target.catalogRevision,
      targetBlueprintSha256: target.blueprintSha256,
      targetInstanceRevision: instance.revision + 1n,
      discardedContainers: containers.size,
      discardedItems: items.size,
      deletedRows: Object.fromEntries(
        [...shipRows, ...inventoryRows].map(([t, rs]) => [t, rs.length]),
      ),
    },
  };
}

export function replacePrefabShip(ctx: Context, args: ReplacePrefabShipArgs) {
  requireShipOperator(ctx);
  const kind = args.dryRun ? "replace-prefab-dry-run" : "replace-prefab",
    request = archiveJson({
      ...args,
      operationId: undefined,
      dryRun: undefined,
    });
  if (priorOperation(ctx.db, ctx.sender, args.operationId, kind, request))
    return;
  const p = planPrefabReplacement(ctx, args);
  const record = () =>
    ctx.db.shipOperatorOperation.insert({
      operationId: args.operationId,
      principal: ctx.sender,
      kind,
      request,
      summaryJson: archiveJson({ mode: kind, ...p.summary }),
      createdMicros: ctx.timestamp.microsSinceUnixEpoch,
    });
  if (args.dryRun) {
    record();
    return;
  }
  // Persist a composed catalog only on apply, never on a planning or dry-run path.
  if (currentComponentCatalog(ctx).revision !== p.target.catalogRevision)
    fail("current catalog changed");
  // Protect every nonselected row byte-for-byte within this transaction (no intervening world tick).
  const protectedRows = new Map<keyof Db, string>();
  for (const [table, selected] of [...p.shipRows, ...p.inventoryRows]) {
    const excluded = new Set(selected.map(archiveJson));
    protectedRows.set(
      table,
      rowFingerprint(
        rows(ctx.db, table).filter((r) => !excluded.has(archiveJson(r))),
      ),
    );
  }
  const personal = rowFingerprint(
    INVENTORY_TABLES.map((t) => {
      const removed = new Set(p.inventoryRows.get(t)!.map(archiveJson));
      return [
        t,
        rowFingerprint(
          rows(ctx.db, t).filter((r) => !removed.has(archiveJson(r))),
        ),
      ];
    }),
  );
  const otherActors = rowFingerprint(
      [...ctx.db.character.iter()].filter((a) => a.id !== p.actor.id),
    ),
    mapBefore = rowFingerprint(
      PRESERVED_MAP_TABLES.map((t) => [t, rowFingerprint(rows(ctx.db, t))]),
    ),
    seq = { next: 0 };
  for (const [table, selected] of [...p.inventoryRows, ...p.shipRows])
    for (const row of selected) {
      archiveRow(ctx.db, args.operationId, seq, String(table), "deleted", row);
      (ctx.db[table] as unknown as { delete(row: Row): boolean }).delete(row);
    }
  archiveRow(ctx.db, args.operationId, seq, "character", "updated", p.actor);
  const result = installPrefabShip(
    ctx,
    p.actor,
    {
      prefabId: p.target.prefabId,
      name: p.ship.name,
      pose: {
        kind: "at",
        systemId: p.motion.systemId,
        x: p.motion.x,
        y: p.motion.y,
        heading: p.motion.heading,
      },
    },
    {
      template: p.template,
      reuseIds: [p.ship.id, p.deck.id],
      instanceRevision: p.instance.revision + 1n,
    },
  );
  const next = ctx.db.constructionInstance.id.find(result.shipId),
    flight = ctx.db.constructionFlightBinding.shipId.find(result.shipId),
    actor = ctx.db.character.id.find(p.actor.id),
    ship = ctx.db.ship.id.find(result.shipId),
    motion = ctx.db.shipWorldMotion.shipId.find(result.shipId);
  if (
    result.shipId !== p.ship.id ||
    result.deckId !== p.deck.id ||
    next?.revision !== p.instance.revision + 1n ||
    next.blueprintSha256 !== p.target.blueprintSha256 ||
    flight?.definitionId !== PREFAB_FLIGHT_DEFINITION ||
    flight.definitionSha256 !== p.target.flightDefinitionSha256 ||
    flight.lifecycle !== "active" ||
    !actor ||
    actor.owner.toHexString() !== p.actor.owner.toHexString() ||
    actor.name !== p.actor.name ||
    !ship ||
    ship.owner.toHexString() !== p.ship.owner.toHexString() ||
    !motion ||
    motion.systemId !== p.motion.systemId ||
    motion.x !== p.motion.x ||
    motion.y !== p.motion.y ||
    motion.heading !== p.motion.heading
  )
    fail("reinstall did not preserve identity, pose and qualified target pins");
  if (ship.revision <= p.ship.revision)
    ctx.db.ship.id.update({ ...ship, revision: p.ship.revision + 1n });
  // Source identity sets still identify all newly created source-scoped rows; other rows must remain identical.
  const related = new Set<unknown>([p.ship.id, p.deck.id]);
  const newObjectIds = new Set(
    rows(ctx.db, "interactionObject")
      .filter((r) => r.shipId === p.ship.id)
      .map((r) => r.id),
  );
  const newStationIds = new Set(
    rows(ctx.db, "station")
      .filter((r) => r.shipId === p.ship.id)
      .map((r) => r.id),
  );
  for (const id of [...newObjectIds, ...newStationIds]) related.add(id);
  for (const [table, before] of protectedRows) {
    const after = rows(ctx.db, table).filter(
      (r) =>
        !related.has(r.id) &&
        !REF_FIELDS.some((k) => related.has(r[k])) &&
        !(
          [
            "constructionLocation",
            "worldAdmission",
            "input",
            "couchSeat",
            "constructionPilotSeat",
          ].includes(String(table)) && r.characterId === p.actor.id
        ),
    );
    // Personal containers may carry the retained ship id; compare inventory separately below.
    if (
      !INVENTORY_TABLES.includes(table as (typeof INVENTORY_TABLES)[number]) &&
      rowFingerprint(after) !== before
    )
      fail(`${String(table)} protected rows changed`);
  }
  if (
    rowFingerprint(
      INVENTORY_TABLES.map((t) => [t, rowFingerprint(rows(ctx.db, t))]),
    ) !== personal ||
    rowFingerprint(
      [...ctx.db.character.iter()].filter((a) => a.id !== p.actor.id),
    ) !== otherActors ||
    rowFingerprint(
      PRESERVED_MAP_TABLES.map((t) => [t, rowFingerprint(rows(ctx.db, t))]),
    ) !== mapBefore
  )
    fail("protected inventory, characters or world changed");
  if (p.target.issueEmptyStorage) {
    const prefab = prefabById(p.target.prefabId)!;
    for (const socket of prefabCargoSockets(
      prefab,
      0,
      prefabComponentCatalogFor(p.target.catalogRevision),
    ))
      issueEmptySocketStorage(ctx, p.ship.id, socket.key, "Storage crate");
  }
  const inv = ctx.db.inventoryState.characterId.find(p.actor.id);
  if (inv && p.items.size) {
    archiveRow(ctx.db, args.operationId, seq, "inventoryState", "updated", inv);
    ctx.db.inventoryState.characterId.update({
      ...inv,
      revision: inv.revision + 1n,
    });
  }
  record();
}
