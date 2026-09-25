import { CONSTRUCTION_INSET_VISUAL_PIN } from "@sidereal/content/construction-inset-visuals";
import { planPinnedInsetBoundaries } from "@sidereal/sim/construction-inset-boundaries";
import { cargoCarrierCollision } from "./construction-cargo-carriers";
import { addWayfarerRefitCollision } from "./wayfarer-refit-collision";
import {
  requestNativeAirlockDoor,
  acceptedNativeAirlockCollision,
  ownNativeAirlocks,
} from "./construction-airlock";
import { compilePublishedNativeExternalAirlock } from "@sidereal/sim/construction-airlock-published";
import {
  qualifiedWayfarerInstanceObstacles,
  isQualifiedWayfarerBlueprint,
} from "@sidereal/sim/wayfarer-walking-bindings";
import { nativeStairRoomCollision } from "@sidereal/sim/construction-stairs-document";
import {
  validateNativePressureRoomDocument,
  nativePressureRoomCollision,
} from "@sidereal/sim/construction-pressure-document";
import { pinnedFamilyCollision } from "@sidereal/sim/construction-boundary-family";
import { nativeTraversalRoomCollision } from "@sidereal/sim/construction-traversal-document";
import {
  SenderError,
  t,
  type ReducerCtx,
  type ViewCtx,
  type InferSchema,
} from "spacetimedb/server";
import type world from "./index";
import type { ConstructionDocument } from "@sidereal/content/construction";
import { planNativeBoundaries } from "@sidereal/sim/construction-boundaries";
import {
  compileDeckCollision,
  resolveDeckCollision,
  canReachOnDeck,
  type CompiledDeckCollision,
} from "@sidereal/sim/construction-collision";
import {
  doorMotionStep,
  doorSweepOccupied,
  doorLeafObstacle,
  type HingedDoorFrame,
} from "@sidereal/sim/construction-door-motion";
import { transformPoint } from "@sidereal/content/ship-layout";
import { operation, receipt, requireGrant } from "./construction";
type Context = ReducerCtx<InferSchema<typeof world>>;
type ReadContext = Pick<ViewCtx<InferSchema<typeof world>>, "db" | "sender">;
/** Explicit development review interaction constants, not inferred asset ratings. */
const REVIEW_DURATION_SECONDS = 1,
  REVIEW_REACH_METRES = 2.5,
  MAX_MOVING_DOORS = 256;
const baseCache = new Map<string, CompiledDeckCollision>();
export function installDoors(
  ctx: Context,
  instanceId: string,
  document: ConstructionDocument,
) {
  if (document.airlockRoom) return; // Exact two-door installation owns both frames.
  if (document.pressureRoom) {
    // Publication already validates the exact native room document. Its source
    // door is a full 2m module at this frame, not the narrower semantic aperture.
    validateNativePressureRoomDocument(document);
    const opening = document.layout.openings[0];
    ctx.db.constructionDoor.insert({
      id: opening.id,
      instanceId,
      deckId: opening.deckId,
      x: 2,
      y: 0,
      quarterTurns: 1,
      fraction: 0,
      targetOpen: false,
      blocked: false,
      moving: false,
      revision: 1n,
    });
    return;
  }
  if (
    !document.boundaryKit ||
    document.boundaryKit.revision === "r004" ||
    document.boundaryKit.id === CONSTRUCTION_INSET_VISUAL_PIN.id
  )
    return;
  for (const deck of document.layout.decks) {
    const plan = planNativeBoundaries(document.layout, deck.id, {
      floorTopUnits: 6,
    });
    for (const door of plan.doors)
      ctx.db.constructionDoor.insert({
        id: door.openingId,
        instanceId,
        deckId: deck.id,
        x: door.frameStartUnits[0] / 32,
        y: door.frameStartUnits[1] / 32,
        quarterTurns: door.quarterTurns,
        fraction: 0,
        targetOpen: false,
        blocked: false,
        moving: false,
        revision: 1n,
      });
  }
}
export function constructionCollision(
  ctx: Pick<ReadContext, "db">,
  instance: { id: string; revision: bigint; documentJson: string },
  deckId: string,
) {
  if ((JSON.parse(instance.documentJson) as ConstructionDocument).airlockRoom)
    return acceptedNativeAirlockCollision(
      ctx,
      instance,
      deckId,
      compilePublishedNativeExternalAirlock,
    );
  const key = instance.id + ":" + instance.revision + ":" + deckId;
  let base = baseCache.get(key);
  if (!base) {
    if (baseCache.size >= 32) baseCache.clear();
    const document = JSON.parse(instance.documentJson) as ConstructionDocument;
    const width = document.boundaryKit?.revision === "r001" ? 0.0625 : 0;
    const wayfarer = isQualifiedWayfarerBlueprint(
      document.layout.source?.blueprintRevision,
    )
      ? ctx.db.constructionInstance.id.find(instance.id)
      : undefined;
    if (
      isQualifiedWayfarerBlueprint(document.layout.source?.blueprintRevision) &&
      !wayfarer
    )
      throw new Error("Qualified Wayfarer instance record required");
    base = compileDeckCollision(document.layout, deckId, {
      shipId: instance.id,
      perimeterHalfWidthM: width,
      partitionHalfWidthM: document.pressureRoom ? 0.0625 : width,
      obstacles: wayfarer
        ? qualifiedWayfarerInstanceObstacles(wayfarer, deckId)
        : document.boundaryKit?.id === CONSTRUCTION_INSET_VISUAL_PIN.id
          ? planPinnedInsetBoundaries(document, deckId).obstacles
          : document.stairRoom
            ? nativeStairRoomCollision(document, deckId)
            : document.traversalRoom
              ? nativeTraversalRoomCollision(document, deckId)
              : document.pressureRoom
                ? nativePressureRoomCollision(document, deckId)
                : document.boundaryKit?.revision === "r004"
                  ? pinnedFamilyCollision(document.layout, deckId)
                  : [],
    });
    baseCache.set(key, base);
  }
  const doors = [...ctx.db.constructionDoor.by_deck.filter(deckId)].filter(
    (d) => d.instanceId === instance.id,
  );
  const frame = addWayfarerRefitCollision(
    ctx,
    instance,
    deckId,
    resolveDeckCollision(
      base,
      doors.map((d) => ({ openingId: d.id, passable: d.fraction === 1 })),
    ),
  );
  const obstacles = doors.map((d) =>
    doorLeafObstacle(
      { id: d.id, origin: [d.x, d.y], quarterTurns: d.quarterTurns },
      d.fraction,
    ),
  );
  // Leaf collision persists when the aperture becomes passable; it does not vanish at90°.
  return cargoCarrierCollision(ctx, {
    ...frame,
    obstacles: [...frame.obstacles, ...obstacles],
    segments: [
      ...frame.segments,
      ...obstacles.flatMap((o) =>
        o.vertices.map((a, i) => ({
          id: o.id + ":" + i,
          a,
          b: o.vertices[(i + 1) % o.vertices.length],
          halfWidthM: 0,
        })),
      ),
    ],
  });
}
export function requestDoor(
  ctx: Context,
  args: {
    openingId: string;
    expectedVisitId: string;
    expectedRevision: bigint;
    open: boolean;
    operationId: string;
  },
) {
  if (
    requestNativeAirlockDoor(ctx, args, compilePublishedNativeExternalAirlock)
  )
    return;
  const actor = [...ctx.db.character.by_owner.filter(ctx.sender)][0],
    visit = actor && ctx.db.constructionLocation.characterId.find(actor.id),
    door = ctx.db.constructionDoor.id.find(args.openingId);
  const instance = door && ctx.db.constructionInstance.id.find(door.instanceId);
  if (
    !actor?.connected ||
    !visit ||
    visit.visitId !== args.expectedVisitId ||
    !door ||
    visit.instanceId !== door.instanceId ||
    visit.deckId !== door.deckId ||
    actor.shipId !== door.instanceId ||
    !instance?.owner.isEqual(ctx.sender)
  )
    throw new SenderError(
      "Door requires a character in this owned instance and deck",
    );
  requireGrant(ctx, instance.workspaceId, "instance.spawn");
  const nativePressure = ctx.db.constructionNativePressure.id.find(instance.id);
  const op = operation(
    ctx,
    args.operationId,
    {
      kind: "construction-door",
      ...args,
      expectedRevision: args.expectedRevision.toString(),
    },
    args.expectedRevision,
    door.revision,
  );
  if (op.replay) return;
  const frame = constructionCollision(ctx, instance, door.deckId),
    local = transformPoint(
      [actor.localX - door.x, actor.localY - door.y],
      (4 - door.quarterTurns) % 4,
    );
  const handle = transformPoint(
    [1, local[1] < 0 ? -0.2 : 0.2],
    door.quarterTurns,
  );
  if (
    !canReachOnDeck(
      frame,
      {
        shipId: instance.id,
        deckId: door.deckId,
        position: [actor.localX, actor.localY],
      },
      {
        shipId: instance.id,
        deckId: door.deckId,
        position: [door.x + handle[0], door.y + handle[1]],
      },
      REVIEW_REACH_METRES,
    )
  )
    throw new SenderError("Move within reach on the same side of the door");
  if (
    !door.moving &&
    [...ctx.db.constructionDoor.by_moving.filter(true)].length >=
      MAX_MOVING_DOORS
  )
    throw new SenderError("Door motion budget occupied");
  ctx.db.constructionDoor.id.update({
    ...door,
    targetOpen: args.open,
    blocked: false,
    moving:
      door.fraction !== (args.open ? 1 : 0) ||
      (nativePressure?.doorId === door.id &&
        nativePressure.sealRetraction !== (args.open ? 1 : 0)),
    revision: door.revision + 1n,
  });
  receipt(ctx, op.key, op.request, door.id, door.revision + 1n);
}
export function stepDoors(ctx: Context) {
  for (const door of ctx.db.constructionDoor.by_moving.filter(true)) {
    if (ctx.db.constructionAirlock.id.find(door.instanceId)) continue;
    // This controller cannot move a native pressure leaf through a deployed gasket.
    if (
      ctx.db.constructionNativePressure.id.find(door.instanceId)?.doorId ===
      door.id
    )
      continue;
    const bodies = [
      ...ctx.db.constructionLocation.by_instance.filter(door.instanceId),
    ]
      .filter((l) => l.deckId === door.deckId)
      .map((l) => ctx.db.character.id.find(l.characterId))
      .filter((a) => a?.shipId === door.instanceId)
      .map((a) => ({
        position: [a!.localX, a!.localY] as [number, number],
        radius: 0.3,
      }));
    const frame: HingedDoorFrame = {
      id: door.id,
      origin: [door.x, door.y],
      quarterTurns: door.quarterTurns,
    };
    const next = doorMotionStep(
      door,
      0.05,
      REVIEW_DURATION_SECONDS,
      doorSweepOccupied(frame, bodies),
    );
    if (next.fraction === door.fraction && next.blocked === door.blocked)
      continue;
    ctx.db.constructionDoor.id.update({
      ...door,
      ...next,
      moving: next.fraction !== (next.targetOpen ? 1 : 0),
      revision: door.revision + 1n,
    });
  }
}
export const doorProjection = t.row("ConstructionDoorStatus", {
  id: t.string().primaryKey(),
  instanceId: t.string(),
  deckId: t.string(),
  fraction: t.f64(),
  targetOpen: t.bool(),
  blocked: t.bool(),
  moving: t.bool(),
  revision: t.u64(),
});
export function ownDoors(ctx: ReadContext) {
  const acceptedAirlocks = new Set(ownNativeAirlocks(ctx).map((a) => a.id));
  return [...ctx.db.constructionInstance.by_owner.filter(ctx.sender)]
    .filter(
      (i) =>
        !ctx.db.constructionAirlock.id.find(i.id) || acceptedAirlocks.has(i.id),
    )
    .flatMap((i) =>
      [...ctx.db.constructionDoor.by_instance.filter(i.id)].map(
        ({
          id,
          instanceId,
          deckId,
          fraction,
          targetOpen,
          blocked,
          moving,
          revision,
        }) => ({
          id,
          instanceId,
          deckId,
          fraction,
          targetOpen,
          blocked,
          moving,
          revision,
        }),
      ),
    );
}
