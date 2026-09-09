import { describe, expect, it, vi } from "vitest";
import type { DbConnection } from "./generated";
import { bindSharedWorld } from "./bind-shared-world";
import { createConnectionResources } from "./connection-resources";
import type { SharedAdmission, SharedShipMotion } from "./shared-world-store";

const admission: SharedAdmission = {
  characterId: "8c01c482-bcf8-46c4-bad6-92c746b9b1ed",
  shipId: "fb1ddc75-9ffa-4807-80ad-38f59b0a4a11",
  systemId: "ad7bf00a-caa0-50ee-b307-332afaac71a1",
  revision: 1n,
};
const motion = (x = 0, serverTick = 1n): SharedShipMotion => ({
  shipId: admission.shipId,
  systemId: admission.systemId,
  x,
  y: 0,
  vx: 0,
  vy: 0,
  omega: 0,
  heading: 0,
  cellX: BigInt(Math.floor(x / 400)),
  cellY: 0n,
  serverTick,
});
function table<R extends object>(key: keyof R, seed: R[] = []) {
  const rows = new Map(seed.map((row) => [row[key], row]));
  const inserts = new Set<(ctx: unknown, row: R) => void>();
  const updates = new Set<(ctx: unknown, old: R, row: R) => void>();
  const deletes = new Set<(ctx: unknown, row: R) => void>();
  return {
    iter: () => rows.values(),
    inserts,
    updates,
    deletes,
    onInsert: (fn: (ctx: unknown, row: R) => void) => inserts.add(fn),
    onUpdate: (fn: (ctx: unknown, old: R, row: R) => void) => updates.add(fn),
    onDelete: (fn: (ctx: unknown, row: R) => void) => deletes.add(fn),
    removeOnInsert: (fn: (ctx: unknown, row: R) => void) => inserts.delete(fn),
    removeOnUpdate: (fn: (ctx: unknown, old: R, row: R) => void) =>
      updates.delete(fn),
    removeOnDelete: (fn: (ctx: unknown, row: R) => void) => deletes.delete(fn),
    put(row: R) {
      const old = rows.get(row[key]);
      rows.set(row[key], row);
      if (old) for (const fn of [...updates]) fn({}, old, row);
      else for (const fn of [...inserts]) fn({}, row);
    },
    drop(row: R) {
      rows.delete(row[key]);
      for (const fn of [...deletes]) fn({}, row);
    },
  };
}
const flush = async () => {
  for (let i = 0; i < 6; i++) await Promise.resolve();
};
function fixture(seeded = false) {
  const db = {
    ownWorldAdmission: table<SharedAdmission>(
      "characterId",
      seeded ? [admission] : [],
    ),
    visibleShipMotion: table<SharedShipMotion>(
      "shipId",
      seeded ? [motion()] : [],
    ),
    visibleShipDescriptions: table("shipId", [
      {
        shipId: admission.shipId,
        displayName: "Wayfarer",
        publishedExteriorAssetId: "ship.wayfarer",
        appearanceRevision: 1n,
      },
    ]),
    visibleBodyMotion: table<SharedShipMotion & { bodyId: string }>("bodyId"),
    visibleBodyDescriptions: table("bodyId", [
      {
        bodyId: "body",
        kind: "planet",
        appearance: "ice",
        seed: 1,
        radius: 10,
        height: 0,
      },
    ]),
  };
  const queries: {
    sql: string[];
    unsubscribe: ReturnType<typeof vi.fn>;
    fail(): void;
  }[] = [];
  const connection = {
    db,
    subscriptionBuilder() {
      let applied: (() => void) | undefined;
      let error: ((ctx: { event: Error }) => void) | undefined;
      const builder = {
        onApplied(fn: () => void) {
          applied = fn;
          return builder;
        },
        onError(fn: typeof error) {
          error = fn;
          return builder;
        },
        subscribe(sql: string[]) {
          let ended = false;
          const unsubscribe = vi.fn((cb?: () => void) => {
            ended = true;
            cb?.();
          });
          queries.push({
            sql,
            unsubscribe,
            fail: () => error?.({ event: new Error("scope failed") }),
          });
          applied?.();
          return {
            isActive: () => !ended,
            isEnded: () => ended,
            unsubscribe,
            unsubscribeThen: unsubscribe,
          };
        },
      };
      return builder;
    },
  } as unknown as DbConnection;
  const resources = createConnectionResources();
  const onError = vi.fn();
  const binding = bindSharedWorld({ connection, resources, onError });
  return { db, queries, resources, onError, ...binding };
}
describe("shared world SDK aggregate binding", () => {
  it("hydrates an existing cache and opens cells only from accepted own motion", async () => {
    const f = fixture(true);
    await flush();
    expect(f.store.getSnapshot().admission).toEqual([admission]);
    expect(f.store.getSnapshot().shipMotion).toEqual([motion()]);
    expect(f.store.getSnapshot().bodyDescription).toHaveLength(1);
    expect(f.queries.map((q) => q.sql.length)).toEqual([4, 1, 9]);
    const unrelated = vi.fn();
    f.store.subscribeTable("admission", unrelated);
    f.db.visibleShipMotion.put({ ...motion(800, 2n), shipId: "remote" });
    await flush();
    expect(f.queries).toHaveLength(3);
    expect(unrelated).not.toHaveBeenCalled();
    f.db.visibleShipMotion.put(motion(401, 3n));
    await flush();
    expect(f.queries).toHaveLength(4);
    expect(f.queries[2].unsubscribe).toHaveBeenCalledOnce();
    f.db.visibleShipMotion.put(motion(2000, 2n));
    await flush();
    expect(f.queries).toHaveLength(4);
    expect(
      f.store
        .getSnapshot()
        .shipMotion.find((r) => r.shipId === admission.shipId)?.x,
    ).toBe(401);
  });
  it("waits for admission, accepts updates and aggregate deletes", async () => {
    const f = fixture();
    f.db.visibleShipMotion.put(motion());
    await flush();
    expect(f.queries).toHaveLength(1);
    f.db.ownWorldAdmission.put(admission);
    await flush();
    expect(f.queries).toHaveLength(3);
    const remote = { ...motion(), shipId: "remote" };
    f.db.visibleShipMotion.put(remote);
    f.db.visibleShipMotion.drop(remote);
    expect(f.store.getSnapshot().shipMotion).toEqual([motion()]);
    f.db.ownWorldAdmission.drop(admission);
    await flush();
    expect(f.store.getSnapshot().shipMotion).toEqual([]);
    expect(f.subscriptions.getState().running).toBe(false);
    f.db.visibleShipMotion.put(motion(800, 9n));
    expect(f.store.getSnapshot().shipMotion).toEqual([]);
  });
  it("rebinds and hydrates on admission revision without replaying old epoch callbacks", async () => {
    const f = fixture(true);
    await flush();
    const oldInsert = [...f.db.visibleShipMotion.inserts][0];
    const epoch = f.store.getEpoch();
    f.db.ownWorldAdmission.put({ ...admission, revision: 2n });
    await flush();
    expect(f.store.getEpoch()).toBeGreaterThan(epoch);
    expect(f.store.getSnapshot().admission[0].revision).toBe(2n);
    expect(f.store.getSnapshot().shipDescription).toHaveLength(1);
    expect(f.store.getSnapshot().bodyDescription).toHaveLength(1);
    expect(f.db.visibleShipMotion.inserts.size).toBe(1);
    oldInsert({}, { ...motion(1200, 99n), shipId: "late" });
    expect(
      f.store.getSnapshot().shipMotion.some((r) => r.shipId === "late"),
    ).toBe(false);
  });
  it("isolates overlapping sockets and removes every SDK listener on disposal", async () => {
    const old = fixture(true),
      next = fixture(true);
    await flush();
    const late = [...old.db.visibleShipMotion.inserts][0];
    old.resources.dispose();
    old.dispose();
    late({}, motion(999, 99n));
    expect(old.store.getSnapshot().shipMotion).toEqual([]);
    expect(next.store.getSnapshot().shipMotion).toEqual([motion()]);
    for (const cache of Object.values(old.db)) {
      expect(cache.inserts.size + cache.updates.size + cache.deletes.size).toBe(
        0,
      );
    }
    expect(
      old.queries.every((q) => q.unsubscribe.mock.calls.length === 1),
    ).toBe(true);
  });
  it("does not rehydrate revoked rows after a subscription failure", async () => {
    const f = fixture(true);
    await flush();
    f.queries[0].fail();
    await flush();
    expect(f.onError).toHaveBeenCalledWith("scope failed");
    expect(f.store.getSnapshot().admission).toEqual([]);
    expect(f.store.getSnapshot().shipMotion).toEqual([]);
  });
});
