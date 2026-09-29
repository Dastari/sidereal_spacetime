/**
 * Server adapter for the shared object lifecycle log (roadmap S1-1).
 *
 * Producers call `recordLifecycleEvent` in the same transaction as the domain change, so a
 * rejected reducer rolls its event back with everything else and a committed change has exactly
 * one event. Consumers (S2 logic, S3 behaviours, S10 quests, S11 AI, audit) are server code: they
 * read in bounded batches after their cursor and acknowledge in the same transaction as the work
 * they did, which makes consumption exactly-once per consumer. Nothing here is visible to
 * clients: the tables are private and no view or client reducer reads or writes them.
 *
 * `recordLifecycleEvent` never aborts the gameplay transaction that calls it: every check runs
 * before any write, and a producer mistake (an impossible transition, an oversize payload) is
 * counted in `lifecycle_outbox.rejectedEvents` instead of freezing the world tick. Strict callers
 * (future destroy/repair authority) use `emitLifecycleEvent`, which throws.
 */
import type { InferSchema, ReducerCtx } from "spacetimedb/server";
import type {
  JsonValue,
  LifecycleEventKind,
  LifecycleObjectKind,
  ObjectLifecycle,
} from "@sidereal/scripting";
import {
  EMPTY_OUTBOX,
  LIFECYCLE_RETENTION,
  ageCutoffMicros,
  doorPhase,
  inventoryEventKind,
  encodeLifecyclePayload,
  planAppend,
  planObjectEvent,
  planRead,
  readLifecycleState,
  validateEnvelope,
  type LifecycleRetention,
  type OutboxState,
} from "@sidereal/sim/lifecycle-outbox";
import { SHARED_SYSTEM_SEED } from "@sidereal/content/shared-system";
import type world from "./index";

type Db = ReducerCtx<InferSchema<typeof world>>["db"];
/** The slice of a reducer context the lifecycle log needs (tests pass an in-memory db). */
export type LifecycleContext = {
  db: Pick<
    Db,
    | "objectLifecycle"
    | "lifecycleEvent"
    | "lifecycleOutbox"
    | "lifecycleCursor"
    | "worldSystem"
  >;
  timestamp: { microsSinceUnixEpoch: bigint };
};
export type LifecycleEventRow = NonNullable<
  ReturnType<Db["lifecycleEvent"]["eventId"]["find"]>
>;

export interface LifecycleRef {
  objectId: string;
  objectKind: LifecycleObjectKind;
  /** Definition pin; kept from the previous event when omitted. */
  definitionRef?: string;
  frameId?: string;
  ownerId?: string;
  /** Phase of an object that predates the log (default `active`); ignored once it has a row. */
  adoptAs?: ObjectLifecycle;
}
export interface LifecycleCause {
  /** Operation ID, `tick:<n>`, or a parent event; never blank. */
  causationId: string;
  /** Acting character; omit for system-origin events. */
  actorId?: string;
}

const OUTBOX_ID = 0;
function outboxOf(ctx: LifecycleContext): OutboxState & { rejected: bigint } {
  const row = ctx.db.lifecycleOutbox.id.find(OUTBOX_ID);
  return row
    ? {
        nextEventId: row.nextEventId,
        oldestEventId: row.oldestEventId,
        prunedEvents: row.prunedEvents,
        rejected: row.rejectedEvents,
      }
    : { ...EMPTY_OUTBOX, rejected: 0n };
}
function writeOutbox(
  ctx: LifecycleContext,
  state: OutboxState,
  rejected: bigint,
) {
  const next = {
    id: OUTBOX_ID,
    ...state,
    rejectedEvents: rejected,
    updatedMicros: ctx.timestamp.microsSinceUnixEpoch,
  };
  if (ctx.db.lifecycleOutbox.id.find(OUTBOX_ID))
    ctx.db.lifecycleOutbox.id.update(next);
  else ctx.db.lifecycleOutbox.insert(next);
}
export function authorityTick(ctx: Pick<LifecycleContext, "db">) {
  return (
    ctx.db.worldSystem.id.find(SHARED_SYSTEM_SEED.systemId)
      ?.lastSimulationTick ?? 0n
  );
}

/** Append one event and advance the object's lifecycle. Throws before writing on any error. */
export function emitLifecycleEvent(
  ctx: LifecycleContext,
  ref: LifecycleRef,
  kind: LifecycleEventKind,
  cause: LifecycleCause,
  payload: Readonly<Record<string, JsonValue>> = {},
  retention: LifecycleRetention = LIFECYCLE_RETENTION,
): LifecycleEventRow {
  validateEnvelope({ ...ref, ...cause });
  const payloadJson = encodeLifecyclePayload(payload);
  const now = ctx.timestamp.microsSinceUnixEpoch;
  const row = ctx.db.objectLifecycle.objectId.find(ref.objectId);
  if (row && row.objectKind !== ref.objectKind)
    throw new Error("Lifecycle object kind mismatch");
  const planned = planObjectEvent(
    row
      ? { state: readLifecycleState(row.state), sequence: row.sequence }
      : undefined,
    kind,
    ref.adoptAs,
  );
  const outbox = outboxOf(ctx);
  const append = planAppend(outbox, retention);
  if (ctx.db.lifecycleEvent.eventId.find(append.eventId))
    throw new Error("Lifecycle outbox cursor is behind its rows");
  // Writes start here; nothing below validates.
  for (const id of append.prune) ctx.db.lifecycleEvent.eventId.delete(id);
  writeOutbox(ctx, append.state, outbox.rejected);
  const lifecycle = {
    objectId: ref.objectId,
    objectKind: ref.objectKind,
    definitionRef: ref.definitionRef ?? row?.definitionRef ?? "",
    state: planned.state,
    frameId: ref.frameId ?? row?.frameId ?? "",
    ownerId: ref.ownerId ?? row?.ownerId ?? "",
    sequence: planned.sequence,
    origin: row?.origin ?? planned.origin,
    createdMicros: row?.createdMicros ?? now,
    updatedMicros: now,
  };
  if (row) ctx.db.objectLifecycle.objectId.update(lifecycle);
  else ctx.db.objectLifecycle.insert(lifecycle);
  return ctx.db.lifecycleEvent.insert({
    eventId: append.eventId,
    objectId: ref.objectId,
    objectKind: ref.objectKind,
    kind,
    sequence: planned.sequence,
    authorityTick: authorityTick(ctx),
    causationId: cause.causationId,
    actorId: cause.actorId ?? "",
    frameId: lifecycle.frameId,
    payloadJson,
    atMicros: now,
  });
}

/**
 * Producer hook: record the event, or count it as rejected without touching anything else.
 * Gameplay never fails because the log disagrees with it.
 */
export function recordLifecycleEvent(
  ctx: LifecycleContext,
  ref: LifecycleRef,
  kind: LifecycleEventKind,
  cause: LifecycleCause,
  payload: Readonly<Record<string, JsonValue>> = {},
): LifecycleEventRow | undefined {
  try {
    return emitLifecycleEvent(ctx, ref, kind, cause, payload);
  } catch {
    const outbox = outboxOf(ctx);
    writeOutbox(ctx, outbox, outbox.rejected + 1n);
    return undefined;
  }
}

/** Record a spawn: creation for a new identity, an update for a reinstalled (reused) identity. */
export function recordSpawn(
  ctx: LifecycleContext,
  ref: LifecycleRef,
  cause: LifecycleCause,
  payload: Readonly<Record<string, JsonValue>> = {},
) {
  const exists = !!ctx.db.objectLifecycle.objectId.find(ref.objectId);
  return recordLifecycleEvent(
    ctx,
    ref,
    exists ? "object.updated" : "object.created",
    cause,
    exists ? { ...payload, reinstalled: true } : payload,
  );
}

/** Door rows only produce an event when their semantic phase changes, never per motion step. */
export function recordDoorChange(
  ctx: LifecycleContext,
  before: {
    id: string;
    instanceId: string;
    deckId: string;
    fraction: number;
    targetOpen: boolean;
    blocked: boolean;
  },
  after: { fraction: number; targetOpen: boolean; blocked: boolean },
  cause: LifecycleCause,
) {
  const from = doorPhase(before),
    to = doorPhase(after);
  if (from === to) return undefined;
  return recordLifecycleEvent(
    ctx,
    {
      objectId: before.id,
      objectKind: "door",
      frameId: before.instanceId,
      ownerId: before.instanceId,
    },
    "object.updated",
    cause,
    { door: to, from, deckId: before.deckId },
  );
}

type ItemRow = {
  id: string;
  definitionId: string;
  characterId?: string;
  containerId: string;
  equipmentSlot: string;
  x: number;
  y: number;
  rotated: boolean;
};
/** One lifecycle event per moved item (transfer, equip or unequip); other edits are not moves. */
export function recordItemMove(
  ctx: LifecycleContext,
  before: ItemRow,
  after: ItemRow,
  cause: { causationId: string; actorId?: string },
) {
  const next = { ...before, ...after };
  const kind = inventoryEventKind(before, next);
  if (!kind) return;
  const place = (i: ItemRow) => ({
    characterId: i.characterId ?? "",
    containerId: i.containerId,
    slot: i.equipmentSlot,
    x: i.x,
    y: i.y,
    rotated: i.rotated,
  });
  recordLifecycleEvent(
    ctx,
    {
      objectId: next.id,
      objectKind: "item",
      definitionRef: next.definitionId,
      frameId: next.containerId,
    },
    kind,
    cause,
    { from: place(before), to: place(next) },
  );
}
/** Age sweep for the world tick: remove at most `prunePerTick` expired events, oldest first. */
export function pruneLifecycleEvents(
  ctx: LifecycleContext,
  retention: LifecycleRetention = LIFECYCLE_RETENTION,
) {
  const outbox = outboxOf(ctx);
  if (!ctx.db.lifecycleOutbox.id.find(OUTBOX_ID)) return 0;
  const cutoff = ageCutoffMicros(ctx.timestamp.microsSinceUnixEpoch, retention);
  let oldest = outbox.oldestEventId,
    removed = 0;
  while (oldest < outbox.nextEventId && removed < retention.prunePerTick) {
    const event = ctx.db.lifecycleEvent.eventId.find(oldest);
    if (event && event.atMicros >= cutoff) break;
    if (event) ctx.db.lifecycleEvent.eventId.delete(oldest);
    oldest++;
    removed++;
  }
  if (removed)
    writeOutbox(
      ctx,
      {
        ...outbox,
        oldestEventId: oldest,
        prunedEvents: outbox.prunedEvents + BigInt(removed),
      },
      outbox.rejected,
    );
  return removed;
}

const CONSUMER = /^[a-z][a-z0-9._-]{1,63}$/;
/** Start a consumer at the current end of the log (history before it is not "missed"). Idempotent. */
export function registerLifecycleConsumer(
  ctx: LifecycleContext,
  consumerId: string,
) {
  if (!CONSUMER.test(consumerId)) throw new Error("Invalid consumer ID");
  const existing = ctx.db.lifecycleCursor.consumerId.find(consumerId);
  if (existing) return existing;
  return ctx.db.lifecycleCursor.insert({
    consumerId,
    lastEventId: outboxOf(ctx).nextEventId - 1n,
    missedEvents: 0n,
    updatedMicros: ctx.timestamp.microsSinceUnixEpoch,
  });
}
/** Events after the consumer's cursor, oldest first, at most `limit` (capped). Read-only. */
export function readLifecycleEvents(
  ctx: Pick<LifecycleContext, "db">,
  consumerId: string,
  limit: number,
): { events: LifecycleEventRow[]; missed: bigint } {
  if (!CONSUMER.test(consumerId)) throw new Error("Invalid consumer ID");
  const cursor =
    ctx.db.lifecycleCursor.consumerId.find(consumerId)?.lastEventId ?? 0n;
  const plan = planRead(outboxOf(ctx as LifecycleContext), cursor, limit);
  const events: LifecycleEventRow[] = [];
  for (let id = plan.from; id <= plan.to; id++) {
    const event = ctx.db.lifecycleEvent.eventId.find(id);
    if (event) events.push(event);
  }
  return { events, missed: plan.missed };
}

/** Advance a consumer's cursor (its receipt); count events retention removed before it read them. */
export function acknowledgeLifecycleEvents(
  ctx: LifecycleContext,
  consumerId: string,
  throughEventId: bigint,
) {
  if (!CONSUMER.test(consumerId)) throw new Error("Invalid consumer ID");
  const outbox = outboxOf(ctx);
  const row = ctx.db.lifecycleCursor.consumerId.find(consumerId);
  const cursor = row?.lastEventId ?? 0n;
  if (throughEventId < cursor || throughEventId >= outbox.nextEventId)
    throw new Error("Acknowledgement outside the event log");
  const lastPruned =
    throughEventId < outbox.oldestEventId - 1n
      ? throughEventId
      : outbox.oldestEventId - 1n;
  const missed = lastPruned > cursor ? lastPruned - cursor : 0n;
  const next = {
    consumerId,
    lastEventId: throughEventId,
    missedEvents: (row?.missedEvents ?? 0n) + missed,
    updatedMicros: ctx.timestamp.microsSinceUnixEpoch,
  };
  if (row) ctx.db.lifecycleCursor.consumerId.update(next);
  else ctx.db.lifecycleCursor.insert(next);
  return next;
}
