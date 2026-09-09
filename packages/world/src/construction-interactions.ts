import {
  ownedGameShipAccess,
  GAME_OWNED_TEMPLATE_NAMESPACE,
} from "./game-ship-access-authority";
import {
  SenderError,
  table,
  t,
  type ReducerCtx,
  type ViewCtx,
  type InferSchema,
} from "spacetimedb/server";
import type world from "./index";
import { requireGame } from "./auth";
import { requireGrant } from "./construction";
import { clearAim } from "./combat";
import { consumeInputControl } from "./input-control";
import { LAB_INTERACTIONS } from "../../content/src/interactions";
import { validateInteraction } from "../../sim/src/interactions";
import { planQualifiedWayfarerFunctionalSeeds } from "../../sim/src/construction-functional-instances";
import type { ConstructionInstancePlan } from "../../sim/src/construction-instance";
import {
  QUALIFIED_WAYFARER_SHA256,
  qualifiedWayfarerInstanceObstacles,
} from "../../sim/src/wayfarer-walking-bindings";
import {
  canOccupyDeck,
  sweepDeckCircle,
  type DeckCollisionFrame,
} from "../../sim/src/construction-collision";
import { constructionCollision } from "./construction-doors";
import { stableStringify } from "../../sim/src/layout-geometry";

/** Private binding only. Canonical interaction state and unique seat occupancy
 * continue to use interactionObject/couchSeat, never a second occupancy store. */
export const constructionInteractionBinding = table(
  {
    name: "construction_interaction_binding",
    indexes: [
      { accessor: "by_instance", algorithm: "btree", columns: ["instanceId"] },
      {
        accessor: "by_recovery",
        algorithm: "btree",
        columns: ["recoveryRequested"],
      },
    ],
  },
  {
    objectId: t.string().primaryKey(),
    placedObjectId: t.string().unique(),
    instanceId: t.string(),
    deckId: t.string(),
    sourceId: t.string(),
    instanceRevision: t.u64(),
    recoveryRequested: t.bool(),
    recoveryReason: t.string(),
  },
);
export interface ConstructionInteractionBinding {
  objectId: string;
  placedObjectId: string;
  instanceId: string;
  deckId: string;
  sourceId: string;
  instanceRevision: bigint;
  recoveryRequested: boolean;
  recoveryReason: string;
}
export type ConstructionInteractionContext = ReducerCtx<
  InferSchema<typeof world>
>;
type ReadContext = Pick<ViewCtx<InferSchema<typeof world>>, "db" | "sender">;
const actorFor = (ctx: ReadContext) =>
  ctx.db.character.by_owner.filter(ctx.sender)[Symbol.iterator]().next().value;
const loc = (b: ConstructionInteractionBinding, x: number, y: number) => ({
  shipId: b.instanceId,
  deckId: b.deckId,
  position: [x, y] as [number, number],
});
const approach = (
  sourceId: string,
  definition: (typeof LAB_INTERACTIONS)[number],
) =>
  sourceId === "room-hydroponics-tray--0.6"
    ? ([-2.375, -0.875] as const)
    : ([definition.approachX, definition.approachY] as const);
const verifiedSources = new Map<
  string,
  { documentJson: string; idMapJson: string }
>();
function qualified(ctx: ReadContext, binding: ConstructionInteractionBinding) {
  const instance = ctx.db.constructionInstance.id.find(binding.instanceId),
    object = ctx.db.interactionObject.id.find(binding.objectId),
    definition = LAB_INTERACTIONS.find(
      (d) => d.placementId === binding.sourceId,
    ),
    deck = ctx.db.constructionDeck.id.find(binding.deckId);
  if (
    !instance ||
    !object ||
    !definition ||
    !deck ||
    deck.instanceId !== instance.id ||
    deck.elevation !== 0 ||
    instance.blueprintSha256 !== QUALIFIED_WAYFARER_SHA256 ||
    instance.revision !== binding.instanceRevision ||
    object.shipId !== instance.id ||
    object.placementId !== binding.placedObjectId
  )
    throw new SenderError("Qualified instance interaction binding required");
  const map = JSON.parse(instance.idMapJson) as {
    objects: { sourceId: string; instanceId: string }[];
  };
  if (
    !map.objects.some(
      (m) =>
        m.sourceId === binding.sourceId &&
        m.instanceId === binding.placedObjectId,
    )
  )
    throw new SenderError("Interaction placed identity changed");
  const key = instance.id + ":" + binding.deckId,
    prior = verifiedSources.get(key);
  if (
    !prior ||
    prior.documentJson !== instance.documentJson ||
    prior.idMapJson !== instance.idMapJson
  ) {
    qualifiedWayfarerInstanceObstacles(instance, binding.deckId);
    if (verifiedSources.size >= 32) verifiedSources.clear();
    verifiedSources.set(key, {
      documentJson: instance.documentJson,
      idMapJson: instance.idMapJson,
    });
  }
  const frame = constructionCollision(ctx, instance, binding.deckId),
    point = approach(binding.sourceId, definition);
  if (!canOccupyDeck(frame, loc(binding, ...point), 0.3))
    throw new SenderError("Interaction approach has no standing support");
  return { instance, object, definition, frame, approach: point };
}
const clearInput = (
  ctx: ConstructionInteractionContext,
  characterId: string,
) => {
  const input = ctx.db.input.characterId.find(characterId);
  if (
    input &&
    (input.dx || input.dy || input.throttle || input.turn || input.sprint)
  )
    ctx.db.input.characterId.update({
      ...input,
      dx: 0,
      dy: 0,
      throttle: 0,
      turn: 0,
      sprint: false,
    });
  clearAim(ctx, characterId);
};
function scope(
  ctx: ReadContext,
  actor: NonNullable<ReturnType<typeof actorFor>>,
  binding: ConstructionInteractionBinding,
) {
  const visit = ctx.db.constructionLocation.characterId.find(actor.id);
  return (
    !!visit &&
    visit.characterId === actor.id &&
    visit.instanceId === binding.instanceId &&
    visit.deckId === binding.deckId &&
    actor.shipId === binding.instanceId
  );
}
function unobstructed(
  frame: DeckCollisionFrame,
  binding: ConstructionInteractionBinding,
  from: readonly [number, number],
  to: readonly [number, number],
) {
  const swept = sweepDeckCircle(
    frame,
    loc(binding, ...from),
    [to[0] - from[0], to[1] - from[1]],
    0.3,
  );
  return (
    Math.hypot(swept.position[0] - to[0], swept.position[1] - to[1]) < 1e-5
  );
}
function seatTransitionFrame(
  frame: DeckCollisionFrame,
  binding: ConstructionInteractionBinding,
): DeckCollisionFrame {
  const own = frame.obstacles.filter((o) =>
    o.id.startsWith(binding.placedObjectId + ":"),
  );
  if (own.length !== 1)
    throw new SenderError("Exact native sofa collider required");
  const ownSegments = new Set(
    own.flatMap((o) =>
      o.vertices.map((_, i) => `obstacle:${JSON.stringify([o.id, i])}`),
    ),
  );
  return {
    ...frame,
    obstacles: frame.obstacles.filter((o) => !own.includes(o)),
    segments: frame.segments.filter((s) => !ownSegments.has(s.id)),
  };
}
function freeExit(
  ctx: ReadContext,
  actorId: string,
  binding: ConstructionInteractionBinding,
  frame: DeckCollisionFrame,
  point: readonly [number, number],
) {
  if (!canOccupyDeck(frame, loc(binding, ...point), 0.3)) return false;
  for (const v of ctx.db.constructionLocation.by_instance.filter(
    binding.instanceId,
  )) {
    if (v.characterId === actorId || v.deckId !== binding.deckId) continue;
    const other = ctx.db.character.id.find(v.characterId);
    if (
      other?.shipId === binding.instanceId &&
      Math.hypot(other.localX - point[0], other.localY - point[1]) < 0.60001
    )
      return false;
  }
  return true;
}

export function installQualifiedInstanceInteractions(
  ctx: ConstructionInteractionContext,
  plan: ConstructionInstancePlan,
  /** Trusted server factory output only; never a reducer argument. */
  suppliedSeeds?: ReturnType<typeof planQualifiedWayfarerFunctionalSeeds>,
) {
  if (plan.blueprintSha256 !== QUALIFIED_WAYFARER_SHA256) return;
  const instance = ctx.db.constructionInstance.id.find(plan.instanceId);
  if (!instance)
    throw new SenderError("Interaction installation requires spawned instance");
  const suppliedIds =
    suppliedSeeds &&
    [...suppliedSeeds.containers, ...suppliedSeeds.interactions].map(
      (s) => s.id,
    );
  let suppliedIndex = 0;
  const seeds = planQualifiedWayfarerFunctionalSeeds(plan, () =>
    suppliedIds ? suppliedIds[suppliedIndex++] : ctx.newUuidV4().toString(),
  );
  if (suppliedSeeds) {
    const canonical = (value: unknown) =>
      stableStringify(
        JSON.parse(
          JSON.stringify(value, (_key, v) =>
            typeof v === "bigint" ? { u64: v.toString() } : v,
          ),
        ),
      );
    if (
      suppliedIndex !== suppliedIds!.length ||
      canonical(seeds) !== canonical(suppliedSeeds)
    )
      throw new SenderError(
        "Preallocated interaction seeds differ from exact qualified instance",
      );
  }
  const sources = new Map(
    plan.mappings.objects.map((m) => [m.instanceId, m.sourceId]),
  );
  const frame = constructionCollision(ctx, instance, plan.spawn.deckId);
  const ready = seeds.interactions.map((seed) => {
    const sourceId = sources.get(seed.placedObjectId)!,
      definition = LAB_INTERACTIONS.find((d) => d.placementId === sourceId);
    if (
      !definition ||
      ctx.db.constructionInteractionBinding.placedObjectId.find(
        seed.placedObjectId,
      )
    )
      throw new SenderError(
        "Interaction placed identity missing or already installed",
      );
    const binding = {
      objectId: seed.id,
      placedObjectId: seed.placedObjectId,
      instanceId: instance.id,
      deckId: seed.deckId,
      sourceId,
      instanceRevision: instance.revision,
      recoveryRequested: false,
      recoveryReason: "",
    };
    if (
      !canOccupyDeck(
        frame,
        loc(binding, ...approach(sourceId, definition)),
        0.3,
      )
    )
      throw new SenderError(
        "Native interaction approach lacks standing clearance: " + sourceId,
      );
    return { seed, binding };
  });
  for (const { seed, binding } of ready) {
    ctx.db.interactionObject.insert({
      id: seed.id,
      shipId: seed.instanceId,
      placementId: seed.placedObjectId,
      revision: 1n,
      enabled: true,
    });
    ctx.db.constructionInteractionBinding.insert(binding);
  }
}

/** Controlled seat-to-floor transition. Only the occupied sofa's own obstacle is
 * excluded from this exit sweep; walls, other equipment and accepted actors stay solid.
 * A blocked exit retains supported occupancy and a pending retry, never teleports. */
export function releaseConstructionSeat(
  ctx: ConstructionInteractionContext,
  characterId: string,
  reason: "stand" | "disconnect" | "grant-loss" | "auth-loss",
) {
  const seat = ctx.db.couchSeat.characterId.find(characterId),
    binding =
      seat &&
      ctx.db.constructionInteractionBinding.objectId.find(seat.objectId);
  if (!seat || !binding) return { handled: false, released: false };
  if (!binding.recoveryRequested || binding.recoveryReason !== reason)
    ctx.db.constructionInteractionBinding.objectId.update({
      ...binding,
      recoveryRequested: true,
      recoveryReason: reason,
    });
  const actor = ctx.db.character.id.find(characterId);
  if (!actor || !scope(ctx, actor, binding))
    return { handled: true, released: false };
  let q: ReturnType<typeof qualified>;
  try {
    q = qualified(ctx, binding);
  } catch {
    return { handled: true, released: false };
  }
  const exitFrame = seatTransitionFrame(q.frame, binding);
  const candidates: [number, number][] = [];
  for (const [dx, dy] of [
    [0, 0],
    [-0.25, 0],
    [0, 0.25],
    [0, -0.25],
    [-0.25, 0.25],
    [-0.25, -0.25],
    [-0.5, 0],
  ])
    candidates.push([q.approach[0] + dx, q.approach[1] + dy]);
  const exit = candidates.find(
    (p) =>
      freeExit(ctx, characterId, binding, q.frame, p) &&
      unobstructed(exitFrame, binding, [actor.localX, actor.localY], p),
  );
  if (!exit) {
    clearInput(ctx, characterId);
    return { handled: true, released: false };
  }
  ctx.db.couchSeat.characterId.delete(characterId);
  ctx.db.character.id.update({
    ...actor,
    localX: exit[0],
    localY: exit[1],
    sprinting: false,
  });
  ctx.db.interactionObject.id.update({
    ...q.object,
    revision: q.object.revision + 1n,
  });
  ctx.db.constructionInteractionBinding.objectId.update({
    ...binding,
    recoveryRequested: false,
    recoveryReason: "",
  });
  clearInput(ctx, characterId);
  return { handled: true, released: true };
}
export function recoverConstructionSeats(ctx: ConstructionInteractionContext) {
  let released = 0;
  for (const b of ctx.db.constructionInteractionBinding.by_recovery.filter(
    true,
  )) {
    const seat = ctx.db.couchSeat.objectId.find(b.objectId);
    if (
      seat &&
      releaseConstructionSeat(
        ctx,
        seat.characterId,
        b.recoveryReason as "stand" | "disconnect" | "grant-loss" | "auth-loss",
      ).released
    )
      released++;
  }
  return released;
}
export function requireNoOccupiedConstructionInteractions(
  ctx: ConstructionInteractionContext,
  instanceId: string,
) {
  for (const b of ctx.db.constructionInteractionBinding.by_instance.filter(
    instanceId,
  ))
    if (b.recoveryRequested || ctx.db.couchSeat.objectId.find(b.objectId))
      throw new SenderError(
        "Occupied or recovering construction seat prevents structural mutation",
      );
}

export function interactWithConstructionObject(
  ctx: ConstructionInteractionContext,
  args: {
    objectId: string;
    action: string;
    expectedRevision: bigint;
    operationId: string;
  },
) {
  const binding = ctx.db.constructionInteractionBinding.objectId.find(
    args.objectId,
  );
  if (!binding) return false;
  requireGame(ctx);
  const actor = actorFor(ctx);
  if (!actor?.connected || !scope(ctx, actor, binding))
    throw new SenderError(
      "Accepted instance/deck interaction location required",
    );
  const q = qualified(ctx, binding),
    ownSeat = ctx.db.couchSeat.characterId.find(actor.id),
    occupied = ctx.db.couchSeat.objectId.find(args.objectId);
  if (!/^[A-Za-z0-9_-]{1,96}$/.test(args.operationId))
    throw new SenderError("Invalid operation ID");
  const request = JSON.stringify({
    ...args,
    expectedRevision: String(args.expectedRevision),
  });
  const receipts = [...ctx.db.interactionReceipt.by_character.filter(actor.id)],
    previous = receipts.find((r) => r.operationId === args.operationId);
  if (previous) {
    if (previous.request !== request)
      throw new SenderError("Operation ID already used");
    return true;
  }
  if (
    args.action !== "stand" &&
    !ownedGameShipAccess(
      ctx,
      q.instance.id,
      binding.deckId,
      ctx.timestamp.microsSinceUnixEpoch,
    ).useObjects
  ) {
    if (q.instance.workspaceId === GAME_OWNED_TEMPLATE_NAMESPACE)
      throw new SenderError("Current game-owned ship access required");
    requireGrant(ctx, q.instance.workspaceId, "draft.read");
    requireGrant(ctx, q.instance.workspaceId, "instance.spawn");
  }
  if (!consumeInputControl(ctx, actor.id))
    throw new SenderError("Current actor input control required");
  if (
    ctx.db.constructionStairWalk.characterId.find(actor.id) ||
    ctx.db.constructionTraversal.characterId.find(actor.id)
  )
    throw new SenderError("Finish traversal before interacting");
  if (q.object.revision !== args.expectedRevision)
    throw new SenderError("Object changed; try again");
  const distance = Math.hypot(
    actor.localX - q.definition.x,
    actor.localY - q.definition.y,
  );
  validateInteraction(
    q.definition.kind,
    args.action,
    distance,
    !!occupied,
    occupied?.characterId === actor.id,
  );
  if (args.action === "stand") {
    if (ownSeat?.objectId !== args.objectId)
      throw new SenderError("Own occupied seat required");
    releaseConstructionSeat(ctx, actor.id, "stand");
  } else {
    if (
      ownSeat ||
      ctx.db.station.shipId.find(actor.shipId)?.occupantId === actor.id
    )
      throw new SenderError("Stand up before interacting");
    if (
      !unobstructed(q.frame, binding, [actor.localX, actor.localY], q.approach)
    )
      throw new SenderError("Move to the object's clear approach");
    if (args.action === "sit") {
      if (!freeExit(ctx, actor.id, binding, q.frame, q.approach))
        throw new SenderError("Seat approach is occupied");
      const seatFrame = seatTransitionFrame(q.frame, binding);
      if (
        !canOccupyDeck(
          seatFrame,
          loc(binding, q.definition.seatX, q.definition.seatY),
          0.3,
        ) ||
        !unobstructed(seatFrame, binding, q.approach, [
          q.definition.seatX,
          q.definition.seatY,
        ])
      )
        throw new SenderError("Seat transition is obstructed");
      ctx.db.couchSeat.insert({
        characterId: actor.id,
        objectId: args.objectId,
      });
      ctx.db.character.id.update({
        ...actor,
        localX: q.definition.seatX,
        localY: q.definition.seatY,
        sprinting: false,
      });
      ctx.db.interactionObject.id.update({
        ...q.object,
        revision: q.object.revision + 1n,
      });
      clearInput(ctx, actor.id);
    } else {
      const enabled = args.action === "set-light-on";
      if (q.object.enabled !== enabled)
        ctx.db.interactionObject.id.update({
          ...q.object,
          enabled,
          revision: q.object.revision + 1n,
        });
    }
  }
  ctx.db.interactionReceipt.insert({
    id: ctx.newUuidV4().toString(),
    characterId: actor.id,
    operationId: args.operationId,
    request,
    createdMicros: ctx.timestamp.microsSinceUnixEpoch,
  });
  if (receipts.length >= 128)
    for (const r of receipts
      .sort((a, b) => (a.createdMicros < b.createdMicros ? -1 : 1))
      .slice(0, receipts.length - 127))
      ctx.db.interactionReceipt.id.delete(r.id);
  return true;
}

/** Register behind auth.gameView. Workspace grant loss removes every general
 * interaction row; the separate minimum own-seat pose below preserves support only. */
export function constructionInteractionView(ctx: ReadContext) {
  const actor = actorFor(ctx),
    visit = actor && ctx.db.constructionLocation.characterId.find(actor.id);
  if (!actor?.connected || !visit || actor.shipId !== visit.instanceId)
    return [];
  const instance = ctx.db.constructionInstance.id.find(visit.instanceId);
  if (!instance) return [];
  const grants = [
    ...ctx.db.constructionGrant.by_principal.filter(ctx.sender),
  ].filter((g) => !g.revoked && g.workspaceId === instance.workspaceId);
  const gameAccess = ownedGameShipAccess(ctx, instance.id, visit.deckId);
  if (
    instance.workspaceId === GAME_OWNED_TEMPLATE_NAMESPACE &&
    !gameAccess.readInterior
  )
    return [];
  if (
    !gameAccess.readInterior &&
    !grants.some((g) => g.capability === "draft.read")
  )
    return [];
  const canInteract =
    gameAccess.useObjects ||
    grants.some((g) => g.capability === "instance.spawn");
  return [
    ...ctx.db.constructionInteractionBinding.by_instance.filter(instance.id),
  ].flatMap((binding) => {
    if (binding.deckId !== visit.deckId) return [];
    try {
      const q = qualified(ctx, binding),
        seat = ctx.db.couchSeat.objectId.find(binding.objectId),
        seatedByYou = seat?.characterId === actor.id;
      return [
        {
          id: binding.objectId,
          placementId: binding.placedObjectId,
          assetId: q.definition.assetId,
          name: q.definition.name,
          kind: q.definition.kind,
          localX: q.definition.x,
          localY: q.definition.y,
          revision: q.object.revision,
          enabled: q.object.enabled,
          occupied: !!seat,
          seatedByYou,
          reachable:
            seatedByYou ||
            (canInteract &&
              Math.hypot(
                actor.localX - q.definition.x,
                actor.localY - q.definition.y,
              ) <= 1.8 &&
              unobstructed(
                q.frame,
                binding,
                [actor.localX, actor.localY],
                q.approach,
              )),
        },
      ];
    } catch {
      return [];
    }
  });
}
export const constructionSeatProjection = t.row("OwnConstructionSeatStatus", {
  characterId: t.string().primaryKey(),
  instanceId: t.string(),
  deckId: t.string(),
  objectId: t.string(),
  localX: t.f64(),
  localY: t.f64(),
  standingElevationM: t.f64(),
  releasePending: t.bool(),
});
/** Accepted own pose only. No full instance document, equipment list, inventory,
 * material, model URL, names or capability is retained by this egress projection. */
export function ownConstructionSeat(ctx: ReadContext) {
  const actor = actorFor(ctx),
    seat = actor && ctx.db.couchSeat.characterId.find(actor.id),
    binding =
      seat &&
      ctx.db.constructionInteractionBinding.objectId.find(seat.objectId);
  if (!actor?.connected || !binding || !scope(ctx, actor, binding)) return [];
  try {
    qualified(ctx, binding);
  } catch {
    return [];
  }
  return [
    {
      characterId: actor.id,
      instanceId: binding.instanceId,
      deckId: binding.deckId,
      objectId: binding.objectId,
      localX: actor.localX,
      localY: actor.localY,
      standingElevationM: 0.1875,
      releasePending: binding.recoveryRequested,
    },
  ];
}

/** Called by actual grant revoke/expiry events, rather than scanning every
 * character or every empty interaction object on the world tick. */
export function recoverConstructionSeatsForGrant(
  ctx: ConstructionInteractionContext,
  principal: ConstructionInteractionContext["sender"],
  workspaceId: string,
) {
  for (const actor of ctx.db.character.by_owner.filter(principal)) {
    const seat = ctx.db.couchSeat.characterId.find(actor.id),
      binding =
        seat &&
        ctx.db.constructionInteractionBinding.objectId.find(seat.objectId),
      instance =
        binding && ctx.db.constructionInstance.id.find(binding.instanceId);
    if (instance?.workspaceId === workspaceId)
      releaseConstructionSeat(ctx, actor.id, "grant-loss");
  }
}
