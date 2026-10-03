import {
  SenderError,
  type InferSchema,
  type ReducerCtx,
} from "spacetimedb/server";
import type world from "./index";
import { requireGame } from "./auth";
import { ownedGameShipAccess } from "./game-ship-access-authority";
import {
  furnishingState,
  emptyFurnishingStorage,
} from "./ship-furnishings-tables";
import { operation, receipt } from "./construction";
import { constructionCollision } from "./construction-doors";
import { markShipFlightDirty } from "./construction-flight-dirty";
import {
  planFurnishingEdit,
  validateFurnishingPlacement,
  deckRouteGroups,
  furnishingDoorwayAnchors,
  type FurnishingEdit,
} from "@sidereal/sim/ship-furnishings";
import { prefabCargoSockets } from "@sidereal/sim/prefab-cargo-sockets";
import {
  prefabBedsOfDocument,
  qualifyPrefabBed,
} from "@sidereal/sim/prefab-seats";
import { prefabComponentCatalogFor } from "@sidereal/sim/prefab-catalog";
import { prefabShipObjects } from "@sidereal/sim/prefab-deck-objects";
import { canOccupyDeck } from "@sidereal/sim/construction-collision";
import { readShipPrefab } from "@sidereal/content/ship-prefab";
import {
  assertWayfarerPrefabContract,
  isWayfarerGameplay,
  WAYFARER_STORAGE_OBJECTS,
} from "@sidereal/content/wayfarer-authored-gameplay";
import { furnishingRestriction } from "@sidereal/content/wayfarer-furnishings";
type Context = ReducerCtx<InferSchema<typeof world>>;
function fail(message: string): never {
  throw new SenderError(message);
}
export function editShipFurnishing(
  ctx: Context,
  args: FurnishingEdit & {
    instanceId: string;
    expectedRevision: bigint;
    operationId: string;
  },
) {
  requireGame(ctx);
  const actors = [...ctx.db.character.by_owner.filter(ctx.sender)],
    actor = actors[0];
  const instance = ctx.db.constructionInstance.id.find(args.instanceId);
  const visit = actor && ctx.db.constructionLocation.characterId.find(actor.id);
  if (
    actors.length !== 1 ||
    !actor?.connected ||
    !instance ||
    !instance.owner.isEqual(ctx.sender) ||
    !visit ||
    visit.instanceId !== instance.id ||
    visit.deckId !== instance.spawnDeckId ||
    actor.shipId !== instance.id ||
    !ownedGameShipAccess(
      ctx,
      instance.id,
      visit.deckId,
      ctx.timestamp.microsSinceUnixEpoch,
    ).useObjects
  )
    fail("Stand aboard your admitted ship to edit furniture");
  const document = JSON.parse(instance.documentJson) as {
    prefab?: { document?: unknown; catalog?: string };
  };
  if (!document.prefab?.catalog)
    fail("Trusted authored furniture source required");
  const doc = readShipPrefab(document.prefab.document);
  if (!isWayfarerGameplay(doc))
    fail("Furniture editing is not available for this ship");
  assertWayfarerPrefabContract(doc);
  const catalog = prefabComponentCatalogFor(document.prefab.catalog),
    state = furnishingState(ctx.db, instance.id);
  if (
    ![args.dx, args.dy, args.yaw].every(Number.isFinite) ||
    Math.abs(args.dx) > 32 ||
    Math.abs(args.dy) > 32 ||
    Math.abs(args.yaw) > Math.PI * 2 ||
    typeof args.snap !== "boolean" ||
    !["move", "delete", "snap"].includes(args.action)
  )
    fail("Invalid furnishing edit");
  const op = operation(
    ctx,
    args.operationId,
    {
      kind: "ship-furnishing",
      ...args,
      expectedRevision: args.expectedRevision.toString(),
    },
    args.expectedRevision,
    state.revision,
  );
  // Receipt is checked before looking for a deleted object or reapplying the change.
  if (op.replay) return;
  // Canonical combat authority treats absent vitals as a fresh undamaged character.
  // Existing malformed/dead rows cannot use that implicit fresh state.
  const vitals = ctx.db.characterVitals.characterId.find(actor.id);
  if (
    (vitals &&
      (vitals.state !== "active" ||
        !Number.isFinite(vitals.health) ||
        !Number.isFinite(vitals.maxHealth) ||
        vitals.health <= 0 ||
        vitals.maxHealth <= 0 ||
        vitals.health > vitals.maxHealth)) ||
    ctx.db.couchSeat.characterId.find(actor.id) ||
    ctx.db.constructionPilotSeat.characterId.find(actor.id) ||
    ctx.db.constructionTraversal.characterId.find(actor.id) ||
    ctx.db.constructionStairWalk.characterId.find(actor.id) ||
    ctx.db.evaBody.characterId.find(actor.id)
  )
    fail("A living standing crew member is required");
  const restriction = furnishingRestriction(args.sourceObjectId);
  if (restriction) fail(restriction);
  const object = prefabShipObjects(doc, catalog, state.overrides).find(
    (row) => row.sourceId === args.sourceObjectId,
  );
  if (!object) fail("This furniture has been deleted");
  const px = actor.localY,
    py = -actor.localX,
    dx = Math.max(object.min[0] - px, 0, px - object.max[0]),
    dy = Math.max(object.min[1] - py, 0, py - object.max[1]);
  if (Math.hypot(dx, dy) > 3) fail("Move within 3 m of this furniture");
  const before = constructionCollision(ctx, instance, visit.deckId);
  if (
    !canOccupyDeck(
      before,
      {
        shipId: instance.id,
        deckId: visit.deckId,
        position: [actor.localX, actor.localY],
      },
      0.3,
    )
  )
    fail("Stand on clear supported deck before editing");
  const overrides = planFurnishingEdit(doc, state.overrides, args);
  const seatId = `${instance.id}:seat:prefab:socket:${args.sourceObjectId}`,
    seatBinding = ctx.db.constructionInteractionBinding.objectId.find(seatId);
  if (
    args.action !== "snap" &&
    (ctx.db.couchSeat.objectId.find(seatId) || seatBinding?.recoveryRequested)
  )
    fail("Stand from this occupied seat before moving or deleting it");
  const placedObjectId = `${instance.id}:${visit.deckId}:${args.sourceObjectId}`,
    binding =
      ctx.db.instanceInventoryBinding.placedObjectId.find(placedObjectId);
  const root =
      binding && ctx.db.inventoryContainer.id.find(binding.containerId),
    scope =
      binding &&
      ctx.db.inventoryContainerScope.containerId.find(binding.containerId);
  if (
    binding &&
    (!root ||
      !scope ||
      binding.instanceId !== instance.id ||
      binding.deckId !== visit.deckId ||
      scope.lifecycle !== "active" ||
      scope.rootContainerId !== root.id ||
      scope.rootKind !== "instance" ||
      scope.instanceRevision !== instance.revision ||
      scope.placedObjectId !== binding.placedObjectId)
  )
    fail("Current qualified storage binding required");
  if (
    args.action === "delete" &&
    binding &&
    !emptyFurnishingStorage(ctx.db, binding.containerId)
  )
    fail(
      "Empty this storage, including nested items and liquids, before deleting it",
    );
  const after = constructionCollision(ctx, instance, visit.deckId, {
    revision: state.revision + 1n,
    overrides,
  });
  const crew = [...ctx.db.character.by_ship.filter(instance.id)]
    .filter(
      (a) =>
        ctx.db.constructionLocation.characterId.find(a.id)?.deckId ===
        visit.deckId,
    )
    .map((a) => [a.localX, a.localY] as [number, number]);
  if (crew.length > 128)
    fail("Furnishing edit crew validation budget exceeded");
  const oldBeds = prefabBedsOfDocument(instance.documentJson, state.overrides),
    newBeds = prefabBedsOfDocument(instance.documentJson, overrides);
  const oldSockets = prefabCargoSockets(doc, 0, catalog, state.overrides),
    newSockets = prefabCargoSockets(doc, 0, catalog, overrides);
  const anchors: [number, number][] = [
    ...furnishingDoorwayAnchors(doc, before),
    [0, 6.85],
    [0, 5.5],
    [0, -9.5],
  ];
  for (const socket of oldSockets.filter(
    (s) => s.key !== args.sourceObjectId,
  )) {
    const b = ctx.db.instanceInventoryBinding.placedObjectId.find(
        `${instance.id}:${visit.deckId}:${socket.key}`,
      ),
      s = b && ctx.db.inventoryContainerScope.containerId.find(b.containerId);
    if (s?.lifecycle === "active") anchors.push([s.accessX, s.accessY]);
  }
  for (const bed of oldBeds.filter(
    (b) => b.placementId !== `prefab:socket:${args.sourceObjectId}`,
  ))
    if (qualifyPrefabBed(before, bed))
      anchors.push([bed.approachX, bed.approachY]);
  if (args.action !== "snap")
    validateFurnishingPlacement(
      args.sourceObjectId,
      overrides,
      before,
      after,
      crew,
      anchors,
    );
  const socket = newSockets.find((s) => s.key === args.sourceObjectId);
  const bed = newBeds.find(
    (b) => b.placementId === `prefab:socket:${args.sourceObjectId}`,
  );
  let approach: [number, number] | undefined;
  if (binding && args.action !== "delete") {
    if (!socket) fail("Current furnishing storage socket required");
    approach = socket.approachesM.find((p) =>
      canOccupyDeck(
        after,
        { shipId: instance.id, deckId: visit.deckId, position: p },
        0.3,
      ),
    );
    if (!approach) fail("Storage needs an accessible standing approach");
  }
  if (bed && !qualifyPrefabBed(after, bed))
    fail("Bed needs clear supported seating access");
  if (args.action === "move" && (approach || bed)) {
    const target = approach ?? [bed!.approachX, bed!.approachY];
    const groups = deckRouteGroups(after, [...crew, target]);
    if (
      groups[crew.length] < 0 ||
      !groups
        .slice(0, crew.length)
        .some((g) => g > 0 && g === groups[crew.length])
    )
      fail("Furniture approach must be reachable by crew");
  }
  // Every qualification precedes these atomic writes. UUIDs and payload rows stay intact.
  const row = {
    shipId: instance.id,
    revision: state.revision + 1n,
    overridesJson: JSON.stringify(overrides),
  };
  if (ctx.db.shipFurnishingState.shipId.find(instance.id))
    ctx.db.shipFurnishingState.shipId.update(row);
  else ctx.db.shipFurnishingState.insert(row);
  if (root && scope && binding && args.action !== "snap") {
    if (args.action === "delete")
      ctx.db.inventoryContainerScope.containerId.update({
        ...scope,
        lifecycle: "retired",
        revision: scope.revision + 1n,
      });
    else {
      ctx.db.inventoryContainer.id.update({
        ...root,
        localX: socket!.centreM[0],
        localY: socket!.centreM[1],
      });
      ctx.db.inventoryContainerScope.containerId.update({
        ...scope,
        accessX: approach![0],
        accessY: approach![1],
        revision: scope.revision + 1n,
      });
    }
    markShipFlightDirty(ctx, instance.id);
  }
  if (seatBinding && args.action !== "snap") {
    const interaction = ctx.db.interactionObject.id.find(seatId);
    if (interaction)
      ctx.db.interactionObject.id.update({
        ...interaction,
        enabled: args.action !== "delete",
        revision: interaction.revision + 1n,
      });
  }
  receipt(
    ctx,
    op.key,
    op.request,
    `${instance.id}:furnishing:${args.sourceObjectId}`,
    row.revision,
  );
}
