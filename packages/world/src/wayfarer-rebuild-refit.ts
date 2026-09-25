import type {
  ReducerCtx,
  ViewCtx,
  InferSchema,
  Infer,
} from "spacetimedb/server";
import type world from "./index";
import type { constructionDoor } from "./construction-tables";
import type { ConstructionDocument } from "../../content/src/construction";
import { WAYFARER_STARTER } from "../../content/src/wayfarer-starter";
import {
  readConstructionDraft,
  constructionHash,
} from "../../sim/src/construction-transactions";
import { planConstructionRefitIdentities } from "../../sim/src/construction-refit-identities";
import type { ConstructionInstanceMappings } from "../../sim/src/construction-instance";
import { requireGame } from "./auth";
import { ownedGameShipAccess } from "./game-ship-access-authority";

type Context = ReducerCtx<InferSchema<typeof world>>;
export type RebuildRefitReadContext = Pick<
  ViewCtx<InferSchema<typeof world>>,
  "db" | "sender"
>;
type Door = Infer<typeof constructionDoor.rowType>;
const encode = (value: unknown) =>
  JSON.stringify(value, (_, v) => (typeof v === "bigint" ? v.toString() : v));
function check(value: unknown, message: string): asserts value {
  if (!value) throw Error(`Wayfarer rebuild refit: ${message}`);
}
function bounded<T>(rows: Iterable<T>): T[] {
  const result: T[] = [];
  for (const row of rows) {
    check(result.length < 16384, "Conservation scan budget exceeded");
    result.push(row);
  }
  return result;
}
function ordered<T>(rows: Iterable<T>): T[] {
  return bounded(rows).sort((a, b) => encode(a).localeCompare(encode(b)));
}
export interface WayfarerRebuildRefitRequest {
  shipId: string;
  expectedInstanceRevision: bigint;
  expectedShipRevision: bigint;
  fingerprint: string;
  operationId: string;
}
/** Installed server code supplies these hooks; never accept them or a document from reducer args. */
export interface WayfarerRebuildRefitHooks {
  target: {
    canonical: string;
    sha256: string;
    blueprintId: string;
    removableStructuralSourceIds: readonly string[];
  };
  /** Must qualify exact native collision, preserved fitting/cargo interfaces and every actor's
   * unchanged position/body. Throws on any missing proof. No writes permitted. */
  qualify(
    document: ConstructionDocument,
    state: WayfarerRebuildRefitState,
  ): {
    definitionId: string;
    definitionSha256: string;
    doors: Door[];
  };
}
function owned(
  ctx: RebuildRefitReadContext,
  shipId: string,
  nowMicros?: bigint,
) {
  const actors = bounded(ctx.db.character.by_owner.filter(ctx.sender));
  const actor = actors[0],
    instance = ctx.db.constructionInstance.id.find(shipId),
    ship = ctx.db.ship.id.find(shipId);
  check(
    actors.length === 1 &&
      actor?.connected &&
      instance &&
      ship &&
      actor.shipId === shipId &&
      instance.owner.isEqual(ctx.sender) &&
      ship.owner.isEqual(ctx.sender),
    "Connected actual ship owner required",
  );
  const location = ctx.db.constructionLocation.characterId.find(actor.id);
  check(
    location?.instanceId === shipId,
    "Owner must be aboard the target instance",
  );
  check(
    ownedGameShipAccess(ctx, shipId, location.deckId, nowMicros).readInterior,
    "Current owned game ship admission required",
  );
  return { actor, instance, ship };
}
function state(
  ctx: RebuildRefitReadContext,
  shipId: string,
  nowMicros?: bigint,
) {
  const own = owned(ctx, shipId, nowMicros),
    { instance, ship, actor } = own;
  const locations = ordered(
    ctx.db.constructionLocation.by_instance.filter(shipId),
  );
  const actors = ordered(ctx.db.character.iter()).filter(
    (a) => a.shipId === shipId || locations.some((l) => l.characterId === a.id),
  );
  check(
    actors.length > 0 && actors.length <= 64,
    "Actor review budget exceeded",
  );
  const station = ctx.db.station.shipId.find(shipId),
    motion = ctx.db.shipWorldMotion.shipId.find(shipId),
    access = ctx.db.gameShipAccess.shipId.find(shipId),
    flight = ctx.db.constructionFlightBinding.shipId.find(shipId);
  check(
    station && motion && access && flight,
    "Complete existing game/flight/motion bindings required",
  );
  check(!station.occupantId, "Release all pilot controls before refit");
  check(
    access.instanceId === shipId &&
      access.instanceRevision === instance.revision &&
      flight.instanceId === shipId &&
      flight.instanceRevision === instance.revision &&
      access.templateSha256 === instance.blueprintSha256 &&
      flight.blueprintSha256 === instance.blueprintSha256,
    "Stale game or flight binding",
  );
  const commands = actors
    .map((a) => ctx.db.input.characterId.find(a.id))
    .filter((x) => !!x);
  for (const a of actors) {
    check(
      locations.some((l) => l.characterId === a.id),
      "Every actor must have an exact instance location",
    );
    check(
      !a.sprinting &&
        !ctx.db.couchSeat.characterId.find(a.id) &&
        !ctx.db.constructionPilotSeat.characterId.find(a.id) &&
        !ctx.db.constructionStairWalk.characterId.find(a.id) &&
        !ctx.db.constructionTraversal.characterId.find(a.id),
      "All actors must stand with controls released",
    );
    check(
      !ctx.db.constructionReviewOrigin.characterId.find(a.id) &&
        !ctx.db.constructionFlightReview.characterId.find(a.id),
      "Finish temporary review before refit",
    );
  }
  check(
    commands.every(
      (c) => !c.dx && !c.dy && !c.throttle && !c.turn && !c.sprint,
    ),
    "Stop all actor input before refit",
  );
  const decks = ordered(ctx.db.constructionDeck.by_instance.filter(shipId)),
    doors = ordered(ctx.db.constructionDoor.by_instance.filter(shipId));
  check(
    doors.every((d) => !d.moving),
    "Finish door movement before refit",
  );
  const scopes = ordered(ctx.db.inventoryContainerScope.iter()).filter(
    (s) =>
      s.instanceId === shipId || actors.some((a) => a.id === s.rootCharacterId),
  );
  const containers = ordered(ctx.db.inventoryContainer.iter()).filter(
    (c) =>
      c.shipId === shipId ||
      scopes.some((s) => s.containerId === c.id) ||
      actors.some((a) => a.id === c.characterId),
  );
  const items = ordered(ctx.db.inventoryItem.iter()).filter(
    (i) =>
      containers.some((c) => c.id === i.containerId) ||
      actors.some((a) => a.id === i.characterId),
  );
  const memberships = ordered(ctx.db.inventoryItemMembership.iter()).filter(
    (m) => items.some((i) => i.id === m.itemId),
  );
  const interactions = ordered(
    ctx.db.constructionInteractionBinding.by_instance.filter(shipId),
  );
  check(
    interactions.every(
      (i) =>
        i.instanceRevision === instance.revision &&
        !i.recoveryRequested &&
        !ctx.db.couchSeat.objectId.find(i.objectId),
    ),
    "Stale or occupied interaction binding",
  );
  check(
    scopes
      .filter((s) => s.instanceId === shipId)
      .every((s) => s.instanceRevision === instance.revision),
    "Stale inventory scope",
  );
  const inventoryBindings = ordered(
    ctx.db.instanceInventoryBinding.by_instance.filter(shipId),
  );
  const fittings = ordered(
    ctx.db.constructionFlightFitting.by_ship.filter(shipId),
  );
  const flightStation = ctx.db.constructionFlightStation.stationId.find(
    station.id,
  );
  check(
    flightStation?.shipId === shipId,
    "Preserved pilot station binding required",
  );
  const attachments = ordered(
    ctx.db.wayfarerRefitAttachment.by_instance.filter(shipId),
  );
  return {
    ...own,
    locations,
    actors,
    station,
    motion,
    access,
    flight,
    flightStation,
    decks,
    doors,
    scopes,
    containers,
    items,
    memberships,
    interactions,
    inventoryBindings,
    fittings,
    attachments,
    commands,
    aims: actors
      .map((a) => ctx.db.combatAim.characterId.find(a.id))
      .filter((a) => !!a),
    admissions: ordered(ctx.db.worldAdmission.iter()).filter((a) =>
      actors.some((c) => c.id === a.characterId),
    ),
    inventoryStates: actors.map((a) =>
      ctx.db.inventoryState.characterId.find(a.id),
    ),
    hotbar: ordered(ctx.db.inventoryHotbar.iter()).filter((h) =>
      actors.some((a) => a.id === h.characterId),
    ),
    storageBindings: ordered(ctx.db.storageBinding.iter()).filter((b) =>
      actors.some((a) => a.id === b.characterId),
    ),
    interactionObjects: ordered(
      ctx.db.interactionObject.by_ship.filter(shipId),
    ),
    outputs: ordered(ctx.db.actuatorOutput.by_ship.filter(shipId)),
  };
}
export type WayfarerRebuildRefitState = ReturnType<typeof state>;
function fingerprint(
  s: WayfarerRebuildRefitState,
  hooks: WayfarerRebuildRefitHooks,
) {
  // Intent is consumed, not conserved: state() rejects all active movement before this
  // comparison, and execution clears the latest aim/input rows without restoring an offer
  // snapshot. Idle heartbeats, sequence changes and expired aims must not invalidate a
  // geometry/inventory review. Actor positions and every installed/persistent row stay hashed.
  const { commands: _commands, aims: _aims, ...conserved } = s;
  // Tick counters advance while a review is open; no recorded transforms are ever restored.
  const { tick: _shipTick, ...ship } = s.ship;
  const { serverTick: _motionTick, ...motion } = s.motion;
  const outputs = s.outputs.map(({ tick: _tick, ...output }) => output);
  return constructionHash(
    encode({
      ...conserved,
      ship,
      motion,
      outputs,
      targetSha256: hooks.target.sha256,
    }),
  );
}
function proposed(
  s: WayfarerRebuildRefitState,
  hooks: WayfarerRebuildRefitHooks,
  allocate: () => string,
) {
  const source = readConstructionDraft(WAYFARER_STARTER.documentJson);
  check(
    s.instance.blueprintSha256 === WAYFARER_STARTER.sha256 &&
      source.sha256 === WAYFARER_STARTER.sha256,
    "Only exact authored Wayfarer r001 can be upgraded",
  );
  const mappings = JSON.parse(
    s.instance.idMapJson,
  ) as ConstructionInstanceMappings;
  const protectedObjectIds = [
    ...new Set([
      ...s.inventoryBindings.map((b) => b.placedObjectId),
      ...s.scopes
        .filter((b) => b.instanceId === s.instance.id && b.placedObjectId)
        .map((b) => b.placedObjectId),
      ...s.interactionObjects.map((o) => o.placementId),
      ...s.interactions.map((b) => b.placedObjectId),
      ...s.fittings.map((f) => f.placedObjectId),
      s.flightStation.seatPlacedObjectId,
      s.flightStation.consolePlacedObjectId,
    ]),
  ];
  const mappedObjects = new Set(mappings.objects.map((m) => m.instanceId));
  const externalAttachments = new Set(s.attachments.map((a) => a.id));
  check(
    protectedObjectIds.every(
      (id) => mappedObjects.has(id) || externalAttachments.has(id),
    ),
    "Unknown runtime object conservation binding",
  );
  const mappedProtectedObjectIds = protectedObjectIds.filter((id) =>
    mappedObjects.has(id),
  );
  const removableObjectIds = hooks.target.removableStructuralSourceIds.map(
    (id) => {
      const m = mappings.objects.find((m) => m.sourceId === id);
      check(m, "Unknown structural removal identity");
      return m.instanceId;
    },
  );
  const reservedIds = [
    ...s.actors.map((a) => a.id),
    ...s.containers.map((c) => c.id),
    ...s.items.map((i) => i.id),
    ...s.attachments.map((a) => a.id),
    s.station.id,
  ];
  return planConstructionRefitIdentities(
    {
      instanceId: s.instance.id,
      currentRevision: s.instance.revision,
      expectedRevision: s.instance.revision,
      sourceCanonical: source.canonical,
      expectedSourceSha256: source.sha256,
      sourceBlueprintRevisionId: s.instance.blueprintId,
      currentInstanceDocumentJson: s.instance.documentJson,
      candidateCanonical: hooks.target.canonical,
      expectedCandidateSha256: hooks.target.sha256,
      blueprintRevisionId: hooks.target.blueprintId,
      existingMappings: mappings,
      protectedObjectIds: mappedProtectedObjectIds,
      removableObjectIds,
      reservedIds,
    },
    allocate,
  );
}
function validateQualified(
  s: WayfarerRebuildRefitState,
  plan: ReturnType<typeof proposed>,
  hooks: WayfarerRebuildRefitHooks,
) {
  check(
    plan.mappings.decks.length === s.decks.length &&
      s.decks.every((d) =>
        plan.mappings.decks.some((m) => m.instanceId === d.id),
      ),
    "Deck additions need a separate installation adapter",
  );
  const currentDocument = JSON.parse(
    s.instance.documentJson,
  ) as ConstructionDocument;
  const currentObjects = [
    ...currentDocument.layout.fittings,
    ...(currentDocument.layout.assembly?.parts ?? []),
  ];
  const targetObjects = [
    ...plan.document.layout.fittings,
    ...(plan.document.layout.assembly?.parts ?? []),
  ];
  for (const object of targetObjects) {
    const existing = currentObjects.find((o) => o.id === object.id);
    check(
      !existing || encode(existing) === encode(object),
      "Retained object geometry cannot move during structural refit",
    );
  }
  check(
    s.decks.every(
      (deck) =>
        plan.document.layout.decks.find((d) => d.id === deck.id)!.elevation /
          32 ===
        deck.elevation,
    ),
    "Deck elevation cannot move under occupants",
  );
  const q = hooks.qualify(plan.document, s);
  check(
    q &&
      /^[a-zA-Z0-9:_./-]{1,160}$/.test(q.definitionId) &&
      /^[0-9a-f]{64}$/.test(q.definitionSha256),
    "Qualified flight definition required",
  );
  check(
    q.doors.length <= 512 &&
      new Set(q.doors.map((d) => d.id)).size === q.doors.length,
    "Invalid qualified door list",
  );
  const deckIds = new Set(plan.mappings.decks.map((d) => d.instanceId));
  for (const d of q.doors)
    check(
      d.instanceId === s.instance.id &&
        deckIds.has(d.deckId) &&
        !d.moving &&
        Number.isFinite(d.x) &&
        Number.isFinite(d.y) &&
        [0, 1, 2, 3].includes(d.quarterTurns) &&
        d.fraction >= 0 &&
        d.fraction <= 1,
      "Invalid qualified door state",
    );
  // Existing operational doors retain IDs, transform and actuator state exactly.
  for (const door of s.doors)
    check(
      q.doors.some((d) => encode(d) === encode(door)),
      "Existing door state/identity must be conserved",
    );
  return q;
}
/** Read-only concrete offer. Call only inside auth.gameView; that wrapper restricts the
 * requesting connection while ownedGameShipAccess validates private owner/admission rows.
 * The deterministic review allocator does not reserve live IDs. */
export function offerWayfarerRebuildRefit(
  ctx: RebuildRefitReadContext,
  shipId: string,
  hooks: WayfarerRebuildRefitHooks,
) {
  const s = state(ctx, shipId);
  let counter = 0;
  const plan = proposed(
    s,
    hooks,
    () =>
      `ffffffff-ffff-4fff-8fff-${(++counter).toString(16).padStart(12, "0")}`,
  );
  validateQualified(s, plan, hooks);
  return {
    shipId,
    expectedInstanceRevision: s.instance.revision,
    expectedShipRevision: s.ship.revision,
    fingerprint: fingerprint(s, hooks),
    sourceSha256: s.instance.blueprintSha256,
    targetSha256: hooks.target.sha256,
    removed: plan.removed,
    retainedObjects: plan.mappings.objects,
    counts: {
      actors: s.actors.length,
      containers: s.containers.length,
      items: s.items.length,
      liquidContainers: s.containers.filter((c) => c.capacityLitres > 0).length,
    },
    serverQualificationAccepted: true as const,
  };
}
/** Inactive adapter: call only from an explicitly registered reducer transaction after owner
 * review. Exceptions, including late receipt failure, must escape for atomic DB rollback. */
export function refitWayfarerRebuild(
  ctx: Context,
  args: WayfarerRebuildRefitRequest,
  hooks: WayfarerRebuildRefitHooks,
) {
  requireGame(ctx);
  owned(ctx, args.shipId, ctx.timestamp.microsSinceUnixEpoch);
  check(
    /^[a-zA-Z0-9:_-]{1,80}$/.test(args.operationId) &&
      /^[0-9a-f]{64}$/.test(args.fingerprint),
    "Invalid operation identity/fingerprint",
  );
  const key = `${ctx.sender.toHexString()}:wayfarer-rebuild:${args.operationId}`,
    request = encode({
      shipId: args.shipId,
      expectedInstanceRevision: args.expectedInstanceRevision,
      expectedShipRevision: args.expectedShipRevision,
      fingerprint: args.fingerprint,
      operationId: args.operationId,
      kind: "wayfarer-rebuild-r002",
      targetSha256: hooks.target.sha256,
    });
  const previous = ctx.db.constructionReceipt.id.find(key);
  if (previous) {
    check(
      previous.principal.isEqual(ctx.sender) &&
        JSON.parse(previous.request).request === request,
      "Operation ID reused with different request",
    );
    return {
      shipId: previous.resultId,
      revision: previous.revision,
      replayed: true,
    };
  }
  check(
    bounded(ctx.db.constructionReceipt.by_principal.filter(ctx.sender)).length <
      4096,
    "Operation ledger full",
  );
  const s = state(ctx, args.shipId, ctx.timestamp.microsSinceUnixEpoch);
  check(
    s.instance.revision === args.expectedInstanceRevision &&
      s.ship.revision === args.expectedShipRevision,
    "Revision conflict",
  );
  check(
    fingerprint(s, hooks) === args.fingerprint,
    "Conservation offer changed; review again",
  );
  const plan = proposed(s, hooks, () => ctx.newUuidV4().toString()),
    q = validateQualified(s, plan, hooks),
    revision = plan.nextRevision;
  // All qualification and conservation checks precede writes. Preserve live state by updates
  // to revision bindings, never rebuild containers, fittings, characters or motion from design.
  ctx.db.constructionInstance.id.update({
    ...s.instance,
    blueprintId: hooks.target.blueprintId,
    blueprintSha256: hooks.target.sha256,
    revision,
    documentJson: JSON.stringify(plan.document),
    idMapJson: JSON.stringify(plan.mappings),
  });
  for (const deck of s.decks) {
    const d = plan.document.layout.decks.find((d) => d.id === deck.id);
    check(d, "Missing preserved deck");
    ctx.db.constructionDeck.id.update({
      ...deck,
      name: d.name,
      elevation: d.elevation / 32,
      ceiling: d.ceiling / 32,
    });
  }
  ctx.db.ship.id.update({ ...s.ship, revision: s.ship.revision + 1n });
  ctx.db.gameShipAccess.shipId.update({
    ...s.access,
    instanceRevision: revision,
    templateSha256: hooks.target.sha256,
  });
  ctx.db.constructionFlightBinding.shipId.update({
    ...s.flight,
    instanceRevision: revision,
    blueprintSha256: hooks.target.sha256,
    definitionId: q.definitionId,
    definitionSha256: q.definitionSha256,
    revision: s.flight.revision + 1n,
  });
  for (const scope of s.scopes.filter(
    (scope) => scope.instanceId === args.shipId,
  ))
    ctx.db.inventoryContainerScope.containerId.update({
      ...scope,
      instanceRevision: revision,
      revision: scope.revision + 1n,
    });
  for (const b of s.interactions)
    ctx.db.constructionInteractionBinding.objectId.update({
      ...b,
      instanceRevision: revision,
    });
  for (const door of q.doors)
    if (!s.doors.some((d) => d.id === door.id))
      ctx.db.constructionDoor.insert(door);
  for (const command of s.commands)
    ctx.db.input.characterId.update({
      ...command,
      dx: 0,
      dy: 0,
      throttle: 0,
      turn: 0,
      sprint: false,
      updatedMicros: ctx.timestamp.microsSinceUnixEpoch,
    });
  for (const aim of s.aims)
    if (aim.active)
      ctx.db.combatAim.characterId.update({ ...aim, active: false });
  for (const output of s.outputs)
    ctx.db.actuatorOutput.id.update({ ...output, throttle: 0 });
  ctx.db.constructionReceipt.insert({
    id: key,
    principal: ctx.sender,
    request: encode({
      request,
      audit: {
        sourceSha256: s.instance.blueprintSha256,
        targetSha256: hooks.target.sha256,
        removedStructuralIdentities: plan.removed,
        allocatedIds: plan.allocatedIds,
        beforeFingerprint: args.fingerprint,
        completedMicros: ctx.timestamp.microsSinceUnixEpoch,
      },
    }),
    resultId: args.shipId,
    revision,
  });
  return { shipId: args.shipId, revision, replayed: false };
}
