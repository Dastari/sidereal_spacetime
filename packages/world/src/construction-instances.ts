import {
  installConstructionStair,
  requireNoConstructionStair,
  tryEnterConstructionStair,
  constructionStairPositionAllowed,
  type StairAuthorityHooks,
} from "./construction-stairs-authority";
import { installNativePressure } from "./construction-native-pressure";
import { nativeTraversalRoomInstallation } from "@sidereal/sim/construction-traversal-document";
import { NATIVE_TRAVERSAL_ROOM_PIN } from "@sidereal/content/construction-traversal-room";
import { nativeTraversalRegistry } from "./construction-traversal-registry";
import {
  installTraversalLink,
  requireStandingConstructionActor,
  constructionTraversalPositionAllowed,
} from "./construction-traversal";
import {
  compilePublishedNativePressureRoom,
  NATIVE_PRESSURE_FLOW_POLICY,
} from "@sidereal/sim/construction-native-room-published";
import { validateNativePressureRoomDocument } from "@sidereal/sim/construction-pressure-document";
import { installDoors, constructionCollision } from "./construction-doors";
import {
  SenderError,
  t,
  type ReducerCtx,
  type ViewCtx,
  type InferSchema,
} from "spacetimedb/server";
import type world from "./index";
import { compileConstruction } from "../../sim/src/construction-transactions";
import { planConstructionInstance } from "../../sim/src/construction-instance";
import { requireGrant, operation, receipt } from "./construction";
type Context = ReducerCtx<InferSchema<typeof world>>;
type ReadContext = Pick<ViewCtx<InferSchema<typeof world>>, "db" | "sender">;
/** Construction test instances are static until approved physical definitions exist.
 * No laboratory engines, inventory seed or Wayfarer geometry is implicitly installed. */
export function spawnBlueprint(
  ctx: Context,
  args: {
    blueprintId: string;
    expectedSha256: string;
    sourceDeckId: string;
    operationId: string;
  },
) {
  const blueprint = ctx.db.constructionBlueprint.id.find(args.blueprintId);
  if (!blueprint)
    throw new SenderError("Accessible published blueprint required");
  requireGrant(ctx, blueprint.workspaceId, "draft.read");
  requireGrant(ctx, blueprint.workspaceId, "instance.spawn");
  if (blueprint.sha256 !== args.expectedSha256)
    throw new SenderError("Blueprint SHA mismatch");
  const op = operation(
    ctx,
    args.operationId,
    { kind: "spawn", ...args },
    blueprint.sourceRevision,
    blueprint.sourceRevision,
  );
  if (op.replay) return;
  if ([...ctx.db.constructionInstance.by_owner.filter(ctx.sender)].length >= 16)
    throw new SenderError("Construction test instance limit reached");
  const legacyNativeBoundaries =
    (JSON.parse(blueprint.canonical) as ConstructionDocument).boundaryKit
      ?.revision === "r001";
  let plan;
  try {
    plan = planConstructionInstance(
      compileConstruction(blueprint.canonical),
      {
        blueprintRevisionId: blueprint.id,
        expectedBlueprintSha256: args.expectedSha256,
        sourceDeckId: args.sourceDeckId,
        bodyRadiusM: 0.3,
        bodyHeightM: 1.8,
        perimeterHalfWidthM: legacyNativeBoundaries ? 0.0625 : 0,
        partitionHalfWidthM: legacyNativeBoundaries ? 0.0625 : 0,
        objectCollisionBindings: [],
      },
      () => ctx.newUuidV4().toString(),
    );
  } catch (e) {
    throw new SenderError(String(e));
  }
  // Zero-thickness nominal boundary blocking is a walking review contract only;
  // it is not evidence of wall physical strength, pressure sealing or damage support.
  ctx.db.constructionInstance.insert({
    id: plan.instanceId,
    owner: ctx.sender,
    workspaceId: blueprint.workspaceId,
    blueprintId: blueprint.id,
    blueprintSha256: blueprint.sha256,
    name: plan.document.layout.name,
    revision: 1n,
    documentJson: JSON.stringify(plan.document),
    idMapJson: JSON.stringify(plan.mappings),
    spawnDeckId: plan.spawn.deckId,
    spawnX: plan.spawn.positionM[0],
    spawnY: plan.spawn.positionM[1],
    createdMicros: ctx.timestamp.microsSinceUnixEpoch,
  });
  for (const deck of plan.document.layout.decks) {
    const source = plan.mappings.decks.find((m) => m.instanceId === deck.id)!;
    ctx.db.constructionDeck.insert({
      id: deck.id,
      instanceId: plan.instanceId,
      sourceDeckId: source.sourceId,
      name: deck.name,
      elevation: deck.elevation / 32,
      ceiling: deck.ceiling / 32,
    });
  }
  installDoors(ctx, plan.instanceId, plan.document);
  if (plan.document.stairRoom) installConstructionStair(ctx, plan.instanceId);
  if (plan.document.traversalRoom) {
    installTraversalLink(
      ctx,
      {
        sourceLinkId: plan.mappings.traversalLinks[0].sourceId,
        adapterId: NATIVE_TRAVERSAL_ROOM_PIN.id,
        adapterRevision: NATIVE_TRAVERSAL_ROOM_PIN.revision,
        installation: nativeTraversalRoomInstallation(plan.document, 1n, 1n),
      },
      nativeTraversalRegistry,
    );
  }
  if (plan.document.pressureRoom) {
    const ids = validateNativePressureRoomDocument(plan.document);
    const native = compilePublishedNativePressureRoom({
      instanceId: plan.instanceId,
      ...ids,
      apertureFraction: 0,
      sealRetraction: 0,
      flowPolicy: NATIVE_PRESSURE_FLOW_POLICY,
    });
    installNativePressure(
      ctx,
      {
        instanceId: plan.instanceId,
        deckId: ids.deckId,
        doorId: ids.openingId,
        actualParts: native.installation,
      },
      compilePublishedNativePressureRoom,
    );
  }
  receipt(ctx, op.key, op.request, plan.instanceId, 1n);
}
export const instanceProjection = t.row("ConstructionInstanceStatus", {
  id: t.string().primaryKey(),
  workspaceId: t.string(),
  blueprintId: t.string(),
  blueprintSha256: t.string(),
  name: t.string(),
  revision: t.u64(),
  documentJson: t.string(),
  spawnDeckId: t.string(),
});
export function ownInstances(ctx: ReadContext) {
  return readableInstances(ctx).map(
    ({
      id,
      workspaceId,
      blueprintId,
      blueprintSha256,
      name,
      revision,
      documentJson,
      spawnDeckId,
    }) => ({
      id,
      workspaceId,
      blueprintId,
      blueprintSha256,
      name,
      revision,
      documentJson,
      spawnDeckId,
    }),
  );
}
export const deckProjection = t.row("ConstructionDeckStatus", {
  id: t.string().primaryKey(),
  instanceId: t.string(),
  sourceDeckId: t.string(),
  name: t.string(),
  elevation: t.f64(),
  ceiling: t.f64(),
});
export function ownDecks(ctx: ReadContext) {
  return readableInstances(ctx).flatMap((i) => [
    ...ctx.db.constructionDeck.by_instance.filter(i.id),
  ]);
}

import { sweepDeckCircle } from "../../sim/src/construction-collision";
import type { ConstructionDocument } from "../../content/src/construction";
import { WALK_SPEED_MPS, SPRINT_SPEED_MPS } from "../../sim/src/index";
import { clearAim } from "./combat";
const actorFor = (ctx: ReadContext) =>
  [...ctx.db.character.by_owner.filter(ctx.sender)][0];
function clearControls(ctx: Context, characterId: string) {
  const input = ctx.db.input.characterId.find(characterId);
  if (input)
    ctx.db.input.characterId.update({
      ...input,
      dx: 0,
      dy: 0,
      throttle: 0,
      turn: 0,
      sprint: false,
      updatedMicros: 0n,
    });
  clearAim(ctx, characterId);
}
export function enterReview(
  ctx: Context,
  args: { instanceId: string; expectedShipId: string; operationId: string },
) {
  const actor = actorFor(ctx),
    instance = ctx.db.constructionInstance.id.find(args.instanceId);
  if (!actor?.connected || !instance?.owner.isEqual(ctx.sender))
    throw new SenderError(
      "Owned review instance and connected character required",
    );
  requireGrant(ctx, instance.workspaceId, "instance.spawn");
  const op = operation(
    ctx,
    args.operationId,
    { kind: "enter-construction-review", ...args },
    0n,
    0n,
  );
  if (op.replay) return;
  if (
    actor.shipId !== args.expectedShipId ||
    ctx.db.constructionLocation.characterId.find(actor.id)
  )
    throw new SenderError("Character location changed");
  if (
    ctx.db.station.shipId.find(actor.shipId)?.occupantId === actor.id ||
    ctx.db.couchSeat.characterId.find(actor.id)
  )
    throw new SenderError("Stand up before entering construction review");
  if (!ctx.db.ship.id.find(actor.shipId))
    throw new SenderError("Valid return ship required");
  ctx.db.constructionLocation.insert({
    characterId: actor.id,
    visitId: ctx.newUuidV4().toString(),
    instanceId: instance.id,
    deckId: instance.spawnDeckId,
    returnShipId: actor.shipId,
    returnX: actor.localX,
    returnY: actor.localY,
    revision: 1n,
  });
  ctx.db.character.id.update({
    ...actor,
    shipId: instance.id,
    localX: instance.spawnX,
    localY: instance.spawnY,
    sprinting: false,
  });
  clearControls(ctx, actor.id);
  receipt(ctx, op.key, op.request, instance.id, 1n);
}
export function leaveReview(
  ctx: Context,
  args: {
    expectedVisitId: string;
    expectedRevision: bigint;
    operationId: string;
  },
) {
  const actor = actorFor(ctx);
  if (!actor?.connected) throw new SenderError("Connected character required");
  requireStandingConstructionActor(ctx, actor.id);
  requireNoConstructionStair(ctx, actor.id);
  const location = ctx.db.constructionLocation.characterId.find(actor.id);
  const op = operation(
    ctx,
    args.operationId,
    {
      kind: "leave-construction-review",
      ...args,
      expectedRevision: args.expectedRevision.toString(),
    },
    args.expectedRevision,
    location?.revision ?? 0n,
  );
  if (op.replay) return;
  if (
    !location ||
    location.visitId !== args.expectedVisitId ||
    actor.shipId !== location.instanceId ||
    !ctx.db.ship.id.find(location.returnShipId)
  )
    throw new SenderError("Valid review return location required");
  // Returning must remain possible after a workspace grant expires.
  ctx.db.character.id.update({
    ...actor,
    shipId: location.returnShipId,
    localX: location.returnX,
    localY: location.returnY,
    sprinting: false,
  });
  ctx.db.constructionLocation.characterId.delete(actor.id);
  clearControls(ctx, actor.id);
  receipt(
    ctx,
    op.key,
    op.request,
    location.returnShipId,
    args.expectedRevision,
  );
}
export const locationProjection = t.row("ConstructionLocationStatus", {
  characterId: t.string().primaryKey(),
  visitId: t.string(),
  instanceId: t.string(),
  deckId: t.string(),
  revision: t.u64(),
});
export function ownLocation(ctx: ReadContext) {
  const actor = actorFor(ctx),
    location = actor && ctx.db.constructionLocation.characterId.find(actor.id);
  return location
    ? [
        {
          characterId: location.characterId,
          visitId: location.visitId,
          instanceId: location.instanceId,
          deckId: location.deckId,
          revision: location.revision,
        },
      ]
    : [];
}
export function stepActor(
  ctx: Context,
  actor: NonNullable<ReturnType<typeof actorFor>>,
  command: { dx: number; dy: number; sprint: boolean },
  stairHooks: StairAuthorityHooks,
) {
  const location = ctx.db.constructionLocation.characterId.find(actor.id);
  if (!location) return false;
  if (
    ctx.db.constructionTraversal.characterId.find(actor.id) ||
    ctx.db.constructionStairWalk.characterId.find(actor.id)
  )
    return true;
  const instance = ctx.db.constructionInstance.id.find(location.instanceId);
  if (!instance || actor.shipId !== instance.id) return true;
  // A retained review visit does not restore workspace interaction after revocation.
  if (!stairHooks.mayEnter(actor.owner, instance.workspaceId)) return true;
  if (tryEnterConstructionStair(ctx, stairHooks, actor.id)) return true;
  const frame = constructionCollision(ctx, instance, location.deckId);
  const norm = Math.max(1, Math.hypot(command.dx, command.dy)),
    distance = (command.sprint ? SPRINT_SPEED_MPS : WALK_SPEED_MPS) * 0.05;
  const next = sweepDeckCircle(
    frame,
    {
      shipId: instance.id,
      deckId: location.deckId,
      position: [actor.localX, actor.localY],
    },
    [(command.dx / norm) * distance, (command.dy / norm) * distance],
    0.3,
  );
  if (
    !constructionTraversalPositionAllowed(
      ctx,
      actor.id,
      instance.id,
      location.deckId,
      next.position[0],
      next.position[1],
    ) ||
    !constructionStairPositionAllowed(
      ctx,
      actor.id,
      instance.id,
      location.deckId,
      next.position[0],
      next.position[1],
    )
  )
    return true;
  const moved =
    next.position[0] !== actor.localX || next.position[1] !== actor.localY;
  const sprinting = command.sprint && moved;
  if (moved || actor.sprinting !== sprinting)
    ctx.db.character.id.update({
      ...actor,
      localX: next.position[0],
      localY: next.position[1],
      sprinting,
    });
  return true;
}

/** View contexts have no clock; expiry is materialized by expireGrants. Reducers
 * still check the exact current timestamp before every use. */
export function readableInstances(ctx: ReadContext) {
  const workspaces = new Set(
    [...ctx.db.constructionGrant.by_principal.filter(ctx.sender)]
      .filter((g) => !g.revoked && g.capability === "draft.read")
      .map((g) => g.workspaceId),
  );
  return [...ctx.db.constructionInstance.by_owner.filter(ctx.sender)].filter(
    (instance) => workspaces.has(instance.workspaceId),
  );
}
