/**
 * Pure rules for the shared object lifecycle log (roadmap S1-1). The world adapter
 * (`packages/world/src/lifecycle.ts`) stores the rows; everything that decides an event ID,
 * a per-object sequence, a lifecycle transition, the retention bound or a payload lives here so
 * the server, tests and a future Studio inspector share one definition.
 *
 * - Event IDs are dense (`nextEventId` counts up by one per committed event), so the retained
 *   window is `[oldestEventId, nextEventId)` and pruning never needs a range scan.
 * - Per-object sequences are gap-free: every event on an object is `previous + 1`.
 * - `object.created` only runs for an object that has no lifecycle yet. An object that predates
 *   the log is *adopted* by its first event with the producer's stated current phase (usually
 *   `active`), so a restart or a first publish never fabricates a creation.
 */
import {
  LIFECYCLE_OBJECT_KINDS,
  isLifecycleEventKind,
  isObjectLifecycle,
  nextLifecycle,
  type JsonValue,
  type LifecycleEventKind,
  type LifecycleObjectKind,
  type ObjectLifecycle,
} from "@sidereal/scripting";

/** Retention: the count bound holds after every emit; the age bound is swept by the tick. */
export const LIFECYCLE_RETENTION = {
  maxEvents: 8192n,
  maxAgeMicros: 24n * 3600n * 1_000_000n,
  /** Oldest events removed per emit when over the count bound (converges after a lower bound). */
  prunePerEmit: 4,
  /** Oldest events removed per world tick by the age sweep. */
  prunePerTick: 256,
} as const;
export type LifecycleRetention = {
  maxEvents: bigint;
  maxAgeMicros: bigint;
  prunePerEmit: number;
  prunePerTick: number;
};
/** Serialized payload bound; events are an envelope, not a data dump. */
export const LIFECYCLE_PAYLOAD_MAX_BYTES = 1024;
/** Events a consumer may read in one batch. */
export const LIFECYCLE_READ_MAX = 256;

export interface OutboxState {
  nextEventId: bigint;
  oldestEventId: bigint;
  /** Events removed by the retention bound since the log began (count or age). */
  prunedEvents: bigint;
}
export const EMPTY_OUTBOX: OutboxState = {
  nextEventId: 1n,
  oldestEventId: 1n,
  prunedEvents: 0n,
};
export const retainedEvents = (s: OutboxState) =>
  s.nextEventId - s.oldestEventId;

/** Allocate the next event ID and the oldest IDs to drop so the count bound holds. */
export function planAppend(
  state: OutboxState,
  retention: LifecycleRetention = LIFECYCLE_RETENTION,
): { eventId: bigint; state: OutboxState; prune: bigint[] } {
  if (retention.maxEvents < 1n) throw new Error("Retention must keep an event");
  const eventId = state.nextEventId;
  let oldest = state.oldestEventId;
  const next = eventId + 1n;
  const prune: bigint[] = [];
  while (
    next - oldest > retention.maxEvents &&
    prune.length < retention.prunePerEmit
  )
    prune.push(oldest++);
  return {
    eventId,
    prune,
    state: {
      nextEventId: next,
      oldestEventId: oldest,
      prunedEvents: state.prunedEvents + BigInt(prune.length),
    },
  };
}

/** Events older than this are removed by the tick sweep. */
export function ageCutoffMicros(
  nowMicros: bigint,
  retention: LifecycleRetention = LIFECYCLE_RETENTION,
) {
  return nowMicros - retention.maxAgeMicros;
}

export interface LifecycleSnapshot {
  state: ObjectLifecycle;
  sequence: bigint;
}
export interface PlannedObjectEvent {
  state: ObjectLifecycle;
  previousState: ObjectLifecycle;
  sequence: bigint;
  /** `created`: first event is the creation; `adopted`: the object predates the log. */
  origin: "created" | "adopted" | "existing";
}
/**
 * Transition one object. `adoptAs` is the phase an object that predates the log is in right now
 * (a character who died before the publish is `disabled`); it is ignored once a row exists.
 */
export function planObjectEvent(
  current: LifecycleSnapshot | undefined,
  kind: LifecycleEventKind,
  adoptAs: ObjectLifecycle = "active",
): PlannedObjectEvent {
  if (!isLifecycleEventKind(kind)) throw new Error("Unknown lifecycle event");
  if (!current) {
    if (kind === "object.created")
      return {
        state: nextLifecycle("new", kind),
        previousState: "new",
        sequence: 1n,
        origin: "created",
      };
    if (adoptAs === "new" || adoptAs === "destroyed")
      throw new Error("Adopted objects must be present");
    return {
      state: nextLifecycle(adoptAs, kind),
      previousState: adoptAs,
      sequence: 1n,
      origin: "adopted",
    };
  }
  return {
    state: nextLifecycle(current.state, kind),
    previousState: current.state,
    sequence: current.sequence + 1n,
    origin: "existing",
  };
}

/** Server-derived IDs: printable ASCII, no whitespace. */
const ID = /^[\x21-\x7e]{1,200}$/;
export function isLifecycleObjectKind(
  value: string,
): value is LifecycleObjectKind {
  return (LIFECYCLE_OBJECT_KINDS as readonly string[]).includes(value);
}
/** Validate the envelope strings a producer supplies (IDs are server-derived, never client text). */
export function validateEnvelope(input: {
  objectId: string;
  objectKind: string;
  causationId: string;
  actorId?: string;
  frameId?: string;
}) {
  if (!ID.test(input.objectId)) throw new Error("Invalid lifecycle object ID");
  if (!isLifecycleObjectKind(input.objectKind))
    throw new Error("Unknown lifecycle object kind");
  if (!ID.test(input.causationId))
    throw new Error("Lifecycle events need a causation ID");
  for (const id of [input.actorId, input.frameId])
    if (id !== undefined && id !== "" && !ID.test(id))
      throw new Error("Invalid lifecycle reference");
}
/** Serialize a small JSON object payload; rejects non-finite numbers, bigints and oversize data. */
export function encodeLifecyclePayload(
  payload: Readonly<Record<string, JsonValue>> = {},
): string {
  if (!payload || typeof payload !== "object" || Array.isArray(payload))
    throw new Error("Lifecycle payload must be an object");
  const check = (value: unknown, depth: number): void => {
    if (depth > 4) throw new Error("Lifecycle payload too deep");
    if (
      value === null ||
      typeof value === "string" ||
      typeof value === "boolean"
    )
      return;
    if (typeof value === "number") {
      if (!Number.isFinite(value)) throw new Error("Lifecycle payload number");
      return;
    }
    if (Array.isArray(value)) {
      for (const v of value) check(v, depth + 1);
      return;
    }
    if (typeof value === "object") {
      for (const v of Object.values(value)) check(v, depth + 1);
      return;
    }
    throw new Error("Lifecycle payload must be JSON");
  };
  check(payload, 0);
  const json = JSON.stringify(payload);
  if (utf8Length(json) > LIFECYCLE_PAYLOAD_MAX_BYTES)
    throw new Error("Lifecycle payload too large");
  return json;
}
/** UTF-8 byte length without relying on TextEncoder in the module host. */
function utf8Length(text: string) {
  let bytes = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0)!;
    bytes += code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4;
  }
  return bytes;
}
export function readLifecycleState(value: string): ObjectLifecycle {
  if (!isObjectLifecycle(value))
    throw new Error("Stored lifecycle state invalid");
  return value;
}

/** Consumer cursor: which IDs to read next and how many unread events retention removed. */
export function planRead(
  state: OutboxState,
  cursor: bigint,
  limit: number,
): { from: bigint; to: bigint; missed: bigint } {
  const size = BigInt(
    Math.max(0, Math.min(LIFECYCLE_READ_MAX, Math.floor(limit))),
  );
  const from =
    cursor + 1n < state.oldestEventId ? state.oldestEventId : cursor + 1n;
  const missed = from - (cursor + 1n);
  const last = state.nextEventId - 1n;
  const to = from + size - 1n < last ? from + size - 1n : last;
  return { from, to, missed };
}

/** Semantic door state; motion steps between these phases are not events. */
export type DoorPhase = "closed" | "opening" | "open" | "closing" | "blocked";
export function doorPhase(door: {
  fraction: number;
  targetOpen: boolean;
  blocked: boolean;
}): DoorPhase {
  if (door.blocked) return "blocked";
  if (door.targetOpen) return door.fraction >= 1 ? "open" : "opening";
  return door.fraction <= 0 ? "closed" : "closing";
}

type ItemPlace = {
  characterId?: string;
  containerId: string;
  equipmentSlot: string;
  x: number;
  y: number;
  rotated: boolean;
};
/** Which inventory event a committed item row change is, or `undefined` if it did not move. */
export function inventoryEventKind(
  before: ItemPlace,
  after: ItemPlace,
): LifecycleEventKind | undefined {
  if (!before.equipmentSlot && after.equipmentSlot) return "inventory.equipped";
  if (before.equipmentSlot && !after.equipmentSlot)
    return "inventory.unequipped";
  if (before.equipmentSlot !== after.equipmentSlot) return "inventory.equipped";
  if (
    before.characterId !== after.characterId ||
    before.containerId !== after.containerId ||
    before.x !== after.x ||
    before.y !== after.y ||
    before.rotated !== after.rotated
  )
    return "inventory.transferred";
  return undefined;
}
