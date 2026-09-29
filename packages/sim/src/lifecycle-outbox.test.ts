import { expect, test } from "vitest";
import {
  EMPTY_OUTBOX,
  LIFECYCLE_PAYLOAD_MAX_BYTES,
  LIFECYCLE_RETENTION,
  doorPhase,
  encodeLifecyclePayload,
  inventoryEventKind,
  planAppend,
  planObjectEvent,
  planRead,
  retainedEvents,
  validateEnvelope,
} from "./lifecycle-outbox";

test("appends allocate dense IDs and keep the count bound after every event", () => {
  const retention = { ...LIFECYCLE_RETENTION, maxEvents: 3n };
  let state = EMPTY_OUTBOX;
  const pruned: bigint[] = [];
  for (let i = 0; i < 10; i++) {
    const plan = planAppend(state, retention);
    expect(plan.eventId).toBe(state.nextEventId);
    pruned.push(...plan.prune);
    state = plan.state;
    expect(retainedEvents(state)).toBeLessThanOrEqual(3n);
  }
  expect(state).toEqual({
    nextEventId: 11n,
    oldestEventId: 8n,
    prunedEvents: 7n,
  });
  expect(pruned).toEqual([1n, 2n, 3n, 4n, 5n, 6n, 7n]);
  // A lowered bound converges a few events per append instead of a burst.
  const lowered = planAppend(
    { nextEventId: 101n, oldestEventId: 1n, prunedEvents: 0n },
    { ...retention, maxEvents: 10n },
  );
  expect(lowered.prune).toHaveLength(retention.prunePerEmit);
});

test("per-object sequences are gap-free; creation once; adoption never fabricates creation", () => {
  const created = planObjectEvent(undefined, "object.created");
  expect(created).toMatchObject({
    state: "active",
    sequence: 1n,
    origin: "created",
  });
  expect(
    planObjectEvent({ state: "active", sequence: 7n }, "object.restored"),
  ).toMatchObject({ state: "active", sequence: 8n, origin: "existing" });
  expect(() =>
    planObjectEvent({ state: "active", sequence: 7n }, "object.created"),
  ).toThrow();
  expect(planObjectEvent(undefined, "object.restored")).toMatchObject({
    state: "active",
    sequence: 1n,
    origin: "adopted",
  });
  expect(
    planObjectEvent(undefined, "object.activated", "disabled"),
  ).toMatchObject({ previousState: "disabled", state: "active" });
  expect(() => planObjectEvent(undefined, "object.activated")).toThrow();
  expect(() =>
    planObjectEvent(undefined, "object.updated", "destroyed"),
  ).toThrow();
  expect(() =>
    planObjectEvent(undefined, "not.an.event" as "object.updated"),
  ).toThrow();
});

test("envelopes and payloads are validated and bounded", () => {
  expect(() =>
    validateEnvelope({ objectId: "a", objectKind: "item", causationId: "op" }),
  ).not.toThrow();
  for (const bad of [
    { objectId: "", objectKind: "item", causationId: "op" },
    { objectId: "a b", objectKind: "item", causationId: "op" },
    { objectId: "a", objectKind: "planet", causationId: "op" },
    { objectId: "a", objectKind: "item", causationId: "" },
    { objectId: "a", objectKind: "item", causationId: "op", actorId: "x y" },
  ])
    expect(() => validateEnvelope(bad)).toThrow();
  expect(encodeLifecyclePayload({ a: 1, b: [true, null, "x"] })).toBe(
    '{"a":1,"b":[true,null,"x"]}',
  );
  expect(() => encodeLifecyclePayload({ a: Number.NaN })).toThrow();
  expect(() =>
    encodeLifecyclePayload({ a: 1n as unknown as number }),
  ).toThrow();
  expect(() =>
    encodeLifecyclePayload({ a: { b: { c: { d: { e: { f: 1 } } } } } }),
  ).toThrow();
  expect(() =>
    encodeLifecyclePayload({ a: "é".repeat(LIFECYCLE_PAYLOAD_MAX_BYTES / 2) }),
  ).toThrow("large");
  expect(() => encodeLifecyclePayload([] as never)).toThrow();
});

test("reads resume after the cursor, cap the batch and count pruned unread events", () => {
  const state = { nextEventId: 51n, oldestEventId: 21n, prunedEvents: 20n };
  expect(planRead(state, 30n, 5)).toEqual({ from: 31n, to: 35n, missed: 0n });
  expect(planRead(state, 10n, 5)).toEqual({ from: 21n, to: 25n, missed: 10n });
  expect(planRead(state, 50n, 5)).toEqual({ from: 51n, to: 50n, missed: 0n });
  expect(planRead(state, 0n, 10_000).to).toBe(50n);
  expect(planRead({ ...state, nextEventId: 10_000n }, 20n, 10_000).to).toBe(
    276n,
  );
});

test("door phases and item moves classify one event per semantic change", () => {
  expect(doorPhase({ fraction: 0, targetOpen: false, blocked: false })).toBe(
    "closed",
  );
  expect(doorPhase({ fraction: 0, targetOpen: true, blocked: false })).toBe(
    "opening",
  );
  expect(doorPhase({ fraction: 1, targetOpen: true, blocked: false })).toBe(
    "open",
  );
  expect(doorPhase({ fraction: 0.4, targetOpen: false, blocked: false })).toBe(
    "closing",
  );
  expect(doorPhase({ fraction: 0.4, targetOpen: true, blocked: true })).toBe(
    "blocked",
  );
  const item = {
    characterId: "c",
    containerId: "pockets",
    equipmentSlot: "",
    x: 0,
    y: 0,
    rotated: false,
  };
  expect(inventoryEventKind(item, { ...item })).toBeUndefined();
  expect(inventoryEventKind(item, { ...item, rotated: true })).toBe(
    "inventory.transferred",
  );
  expect(inventoryEventKind(item, { ...item, characterId: "" })).toBe(
    "inventory.transferred",
  );
  expect(inventoryEventKind(item, { ...item, equipmentSlot: "hand" })).toBe(
    "inventory.equipped",
  );
  expect(inventoryEventKind({ ...item, equipmentSlot: "hand" }, item)).toBe(
    "inventory.unequipped",
  );
  expect(
    inventoryEventKind(
      { ...item, equipmentSlot: "hand" },
      { ...item, equipmentSlot: "back" },
    ),
  ).toBe("inventory.equipped");
});
