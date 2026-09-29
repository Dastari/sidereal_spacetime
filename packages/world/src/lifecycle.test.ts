import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";
import { LIFECYCLE_RETENTION } from "@sidereal/sim/lifecycle-outbox";
import { SHARED_SYSTEM_SEED } from "@sidereal/content/shared-system";
import {
  acknowledgeLifecycleEvents,
  emitLifecycleEvent,
  pruneLifecycleEvents,
  readLifecycleEvents,
  recordDoorChange,
  recordItemMove,
  recordLifecycleEvent,
  recordSpawn,
  registerLifecycleConsumer,
} from "./lifecycle";
import { lifecycleEvents, lifecycleTestTables } from "./lifecycle-test-tables";

function world(now = 1_000_000n) {
  const ctx: any = {
    db: lifecycleTestTables(),
    timestamp: { microsSinceUnixEpoch: now },
  };
  ctx.db.worldSystem.insert({
    id: SHARED_SYSTEM_SEED.systemId,
    lastSimulationTick: 42n,
  });
  return ctx;
}
const outbox = (ctx: any) => ctx.db.lifecycleOutbox.id.find(0);
const ship = { objectId: "ship-1", objectKind: "ship" as const };

test("envelope: creation once, per-object sequence gap-free, authority tick and causation kept", () => {
  const ctx = world();
  recordSpawn(ctx, ship, { causationId: "op-1", actorId: "char-1" });
  recordLifecycleEvent(ctx, ship, "object.updated", { causationId: "op-2" });
  recordSpawn(ctx, ship, { causationId: "op-3" }); // operator upgrade reuses the identity
  const events = lifecycleEvents(ctx.db);
  expect(events.map((e) => e.kind)).toEqual([
    "object.created",
    "object.updated",
    "object.updated",
  ]);
  expect(events.map((e) => e.sequence)).toEqual([1n, 2n, 3n]);
  expect(events.map((e) => e.eventId)).toEqual([1n, 2n, 3n]);
  expect(events[0]).toMatchObject({
    authorityTick: 42n,
    causationId: "op-1",
    actorId: "char-1",
  });
  expect(events[1]!.actorId).toBe(""); // system-origin: no fabricated player
  expect(events[2]!.payload).toEqual({ reinstalled: true });
  expect(ctx.db.objectLifecycle.objectId.find("ship-1")).toMatchObject({
    state: "active",
    sequence: 3n,
    origin: "created",
  });
});

test("restart restores and never re-creates; objects that predate the log are adopted", () => {
  const ctx = world();
  const character = { objectId: "char-1", objectKind: "character" as const };
  recordLifecycleEvent(ctx, character, "object.created", {
    causationId: "create:char-1",
  });
  // The module restarts: rows persist, re-entry hydrates the same character.
  recordLifecycleEvent(ctx, character, "object.restored", {
    causationId: "enter:char-1@2",
  });
  expect(() =>
    emitLifecycleEvent(ctx, character, "object.created", {
      causationId: "create:char-1",
    }),
  ).toThrow(/once/);
  // A character that existed before the publish, dead at the time, is adopted as disabled.
  recordLifecycleEvent(
    ctx,
    { objectId: "char-old", objectKind: "character", adoptAs: "disabled" },
    "object.activated",
    { causationId: "respawn:char-old@3" },
  );
  const events = lifecycleEvents(ctx.db);
  expect(events.filter((e) => e.kind === "object.created")).toHaveLength(1);
  expect(events.map((e) => [e.objectId, e.kind, e.sequence])).toEqual([
    ["char-1", "object.created", 1n],
    ["char-1", "object.restored", 2n],
    ["char-old", "object.activated", 1n],
  ]);
  expect(ctx.db.objectLifecycle.objectId.find("char-old")).toMatchObject({
    state: "active",
    origin: "adopted",
  });
  expect(outbox(ctx).rejectedEvents).toBe(0n);
});

test("an impossible producer event is counted, writes nothing else and never throws", () => {
  const ctx = world();
  const character = { objectId: "char-1", objectKind: "character" as const };
  recordLifecycleEvent(ctx, character, "combat.death", { causationId: "s1" });
  expect(
    recordLifecycleEvent(ctx, character, "combat.death", { causationId: "s2" }),
  ).toBeUndefined();
  expect(
    recordLifecycleEvent(ctx, ship, "object.updated", { causationId: "" }),
  ).toBeUndefined();
  expect(
    recordLifecycleEvent(
      ctx,
      ship,
      "object.updated",
      { causationId: "big" },
      { blob: "x".repeat(2000) },
    ),
  ).toBeUndefined();
  expect(lifecycleEvents(ctx.db)).toHaveLength(1);
  expect(outbox(ctx)).toMatchObject({ nextEventId: 2n, rejectedEvents: 3n });
  expect(ctx.db.objectLifecycle.objectId.find("char-1")).toMatchObject({
    state: "disabled",
    sequence: 1n,
  });
  expect(ctx.db.objectLifecycle.objectId.find("ship-1")).toBeUndefined();
});

test("retention bound holds under load: count never exceeds the bound and IDs stay dense", () => {
  const ctx = world();
  const retention = { ...LIFECYCLE_RETENTION, maxEvents: 64n };
  for (let i = 0; i < 5000; i++) {
    emitLifecycleEvent(
      ctx,
      { objectId: `item-${i % 37}`, objectKind: "item" },
      "inventory.transferred",
      { causationId: `op-${i}` },
      { i },
      retention,
    );
    expect(ctx.db.lifecycleEvent.count()).toBeLessThanOrEqual(64n);
  }
  const state = outbox(ctx);
  expect(state).toMatchObject({
    nextEventId: 5001n,
    oldestEventId: 4937n,
    prunedEvents: 4936n,
  });
  const ids = lifecycleEvents(ctx.db).map((e) => e.eventId);
  expect(ids[0]).toBe(4937n);
  expect(ids.at(-1)).toBe(5000n);
  // Per-object sequences keep counting past pruned history: item-0 had 136 events.
  expect(ctx.db.objectLifecycle.objectId.find("item-0").sequence).toBe(136n);
});

test("default retention bound holds for a burst larger than the bound", () => {
  const ctx = world();
  const burst = Number(LIFECYCLE_RETENTION.maxEvents) + 500;
  for (let i = 0; i < burst; i++)
    recordLifecycleEvent(
      ctx,
      { objectId: `door-${i % 11}`, objectKind: "door" },
      "object.updated",
      { causationId: `tick:${i}` },
    );
  expect(ctx.db.lifecycleEvent.count()).toBe(LIFECYCLE_RETENTION.maxEvents);
  expect(outbox(ctx).prunedEvents).toBe(500n);
});

test("age sweep removes only expired events, bounded per tick", () => {
  const ctx = world(1_000_000n);
  for (let i = 0; i < 300; i++)
    recordLifecycleEvent(ctx, ship, "object.updated", { causationId: `a${i}` });
  ctx.timestamp.microsSinceUnixEpoch = 1_000_000n + 60_000_000n;
  recordLifecycleEvent(ctx, ship, "object.updated", { causationId: "fresh" });
  ctx.timestamp.microsSinceUnixEpoch =
    1_000_001n + LIFECYCLE_RETENTION.maxAgeMicros;
  expect(pruneLifecycleEvents(ctx)).toBe(LIFECYCLE_RETENTION.prunePerTick);
  expect(pruneLifecycleEvents(ctx)).toBe(
    300 - LIFECYCLE_RETENTION.prunePerTick,
  );
  expect(pruneLifecycleEvents(ctx)).toBe(0);
  expect(lifecycleEvents(ctx.db).map((e) => e.causationId)).toEqual(["fresh"]);
  expect(outbox(ctx)).toMatchObject({
    oldestEventId: 301n,
    prunedEvents: 300n,
  });
});

test("consumers read in bounded batches, acknowledge exactly once and count what retention removed", () => {
  const ctx = world();
  const retention = { ...LIFECYCLE_RETENTION, maxEvents: 8n };
  const emit = (i: number) =>
    emitLifecycleEvent(
      ctx,
      ship,
      "object.updated",
      { causationId: `op-${i}` },
      {},
      retention,
    );
  emit(1);
  registerLifecycleConsumer(ctx, "ship-logic");
  for (let i = 2; i <= 5; i++) emit(i);
  const first = readLifecycleEvents(ctx, "ship-logic", 3);
  expect(first.events.map((e) => e.eventId)).toEqual([2n, 3n, 4n]);
  expect(first.missed).toBe(0n);
  acknowledgeLifecycleEvents(ctx, "ship-logic", 4n);
  expect(
    readLifecycleEvents(ctx, "ship-logic", 10).events.map((e) => e.eventId),
  ).toEqual([5n]);
  expect(() => acknowledgeLifecycleEvents(ctx, "ship-logic", 3n)).toThrow();
  expect(() => acknowledgeLifecycleEvents(ctx, "ship-logic", 99n)).toThrow();
  for (let i = 6; i <= 20; i++) emit(i); // the consumer falls behind the window
  const late = readLifecycleEvents(ctx, "ship-logic", 100);
  expect(late.missed).toBe(8n); // events 5..12 were pruned unread
  expect(late.events[0]!.eventId).toBe(13n);
  expect(acknowledgeLifecycleEvents(ctx, "ship-logic", 20n).missedEvents).toBe(
    8n,
  );
  expect(() => readLifecycleEvents(ctx, "Bad Consumer", 1)).toThrow();
});

test("doors log semantic phase changes only; items log one move per moved item", () => {
  const ctx = world();
  const door = {
    id: "door-1",
    instanceId: "ship-1",
    deckId: "deck-1",
    fraction: 0,
    targetOpen: false,
    blocked: false,
  };
  recordDoorChange(
    ctx,
    door,
    { ...door, targetOpen: true },
    { causationId: "c:op" },
  );
  recordDoorChange(
    ctx,
    { ...door, targetOpen: true, fraction: 0.2 },
    { ...door, targetOpen: true, fraction: 0.4 },
    { causationId: "door:door-1@3" },
  );
  recordDoorChange(
    ctx,
    { ...door, targetOpen: true, fraction: 0.9 },
    { ...door, targetOpen: true, fraction: 1 },
    { causationId: "door:door-1@4" },
  );
  const item = {
    id: "pistol-1",
    definitionId: "pistol",
    characterId: "char-1",
    containerId: "pockets",
    equipmentSlot: "",
    x: 0,
    y: 0,
    rotated: false,
  };
  const cause = { causationId: "char-1:op-9", actorId: "char-1" };
  recordItemMove(ctx, item, { ...item }, cause);
  recordItemMove(ctx, item, { ...item, x: 1 }, cause);
  recordItemMove(ctx, item, { ...item, equipmentSlot: "hand" }, cause);
  recordItemMove(
    ctx,
    { ...item, equipmentSlot: "hand" },
    { ...item, containerId: "crate" },
    cause,
  );
  const events = lifecycleEvents(ctx.db);
  expect(events.map((e) => [e.objectId, e.kind, e.payload.door])).toEqual([
    ["door-1", "object.updated", "opening"],
    ["door-1", "object.updated", "open"],
    ["pistol-1", "inventory.transferred", undefined],
    ["pistol-1", "inventory.equipped", undefined],
    ["pistol-1", "inventory.unequipped", undefined],
  ]);
  expect(events[4]!.payload.to).toMatchObject({ containerId: "crate" });
});

test("no view, public table or client reducer exposes the lifecycle log", () => {
  const dir = __dirname;
  const names = [
    "objectLifecycle",
    "lifecycleEvent",
    "lifecycleOutbox",
    "lifecycleCursor",
    "object_lifecycle",
    "lifecycle_event",
    "lifecycle_outbox",
    "lifecycle_cursor",
  ];
  const tables = readFileSync(join(dir, "lifecycle-tables.ts"), "utf8");
  expect(tables).not.toMatch(/public\s*:/);
  const index = readFileSync(join(dir, "index.ts"), "utf8");
  // Every view body in the module entry point, up to the next top-level export.
  for (const view of index
    .split(/\nexport const /)
    .filter((c) => /db\.view\(/.test(c)))
    for (const name of names) expect(view).not.toContain(name);
  for (const reducer of index
    .split(/\nexport const /)
    .filter((c) => /db\.reducer\(/.test(c)))
    for (const name of ["emitLifecycleEvent", "acknowledgeLifecycleEvents"])
      expect(reducer).not.toContain(name);
  // No other module file defines a view over the log.
  for (const file of readdirSync(dir).filter(
    (f) => f.endsWith(".ts") && !f.includes(".test.") && f !== "index.ts",
  )) {
    const source = readFileSync(join(dir, file), "utf8");
    if (!/\.view\(/.test(source)) continue;
    for (const name of names) expect(source).not.toContain(name);
  }
  // Generated client bindings, when present, carry no lifecycle table.
  const generated = join(dir, "../../net/src/generated");
  let bindings: string[] = [];
  try {
    bindings = readdirSync(generated);
  } catch {
    bindings = [];
  }
  expect(bindings.filter((f) => /lifecycle/.test(f))).toEqual([]);
});
