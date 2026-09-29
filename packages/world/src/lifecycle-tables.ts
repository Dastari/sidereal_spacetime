/**
 * Shared object lifecycle and event outbox (roadmap S1-1). All four tables are private: no view
 * reads them and no client reducer writes them. Domain tables stay authoritative; these rows are
 * the uniform envelope that logic, behaviours, quests, AI and audit read in bounded batches.
 */
import { table, t } from "spacetimedb/server";

/** One row per object that has had a lifecycle event (created, or adopted by its first event). */
export const objectLifecycle = table(
  {
    name: "object_lifecycle",
    indexes: [
      { accessor: "by_frame", algorithm: "btree", columns: ["frameId"] },
      { accessor: "by_owner_ref", algorithm: "btree", columns: ["ownerId"] },
    ],
  },
  {
    objectId: t.string().primaryKey(),
    /** `LIFECYCLE_OBJECT_KINDS` from `@sidereal/scripting`. */
    objectKind: t.string(),
    /** Definition pin (`id@revision`, blueprint revision or catalogue ID); "" when none. */
    definitionRef: t.string(),
    /** `ObjectLifecycle` state: active, suspended, disabled, despawned or destroyed. */
    state: t.string(),
    /** Frame the object lives in (ship/instance ID, character ID for carried items); "" for none. */
    frameId: t.string(),
    /** Owning character or ship reference; "" for none. */
    ownerId: t.string(),
    /** Sequence of the last event; the next event on this object is `sequence + 1` (gap-free). */
    sequence: t.u64(),
    /** "created" when the log saw the creation, "adopted" when the object predates the log. */
    origin: t.string(),
    createdMicros: t.u64(),
    updatedMicros: t.u64(),
  },
);

/** The outbox: one row per committed lifecycle change, written in the committing transaction. */
export const lifecycleEvent = table(
  {
    name: "lifecycle_event",
    indexes: [
      { accessor: "by_object", algorithm: "btree", columns: ["objectId"] },
    ],
  },
  {
    /** Dense, strictly increasing event ID (`lifecycle_outbox.nextEventId`). */
    eventId: t.u64().primaryKey(),
    objectId: t.string(),
    objectKind: t.string(),
    /** `LifecycleEventKind`. */
    kind: t.string(),
    /** Per-object, gap-free. */
    sequence: t.u64(),
    /** Shared-system simulation tick at commit. */
    authorityTick: t.u64(),
    /** Operation ID, `tick:<n>` or a parent event; never blank. */
    causationId: t.string(),
    /** Acting character; "" for system-origin events (no fabricated player identity). */
    actorId: t.string(),
    frameId: t.string(),
    /** Validated JSON object, at most `LIFECYCLE_PAYLOAD_MAX_BYTES`. */
    payloadJson: t.string(),
    atMicros: t.u64(),
  },
);

/** Singleton (id 0): the retained window `[oldestEventId, nextEventId)` and the pruned count. */
export const lifecycleOutbox = table(
  { name: "lifecycle_outbox" },
  {
    id: t.u32().primaryKey(),
    nextEventId: t.u64(),
    oldestEventId: t.u64(),
    prunedEvents: t.u64(),
    /** Producer events refused by an invariant (impossible transition, bad payload); expect 0. */
    rejectedEvents: t.u64(),
    updatedMicros: t.u64(),
  },
);

/** Consumer receipts: the last event each server-side consumer acknowledged. */
export const lifecycleCursor = table(
  { name: "lifecycle_cursor" },
  {
    consumerId: t.string().primaryKey(),
    lastEventId: t.u64(),
    /** Unread events the retention bound removed before this consumer read them. */
    missedEvents: t.u64(),
    updatedMicros: t.u64(),
  },
);
