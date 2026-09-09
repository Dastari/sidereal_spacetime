import { describe, expect, it, vi } from "vitest";
import { createConnectionResources } from "./connection-resources";
import {
  SharedWorldStore,
  type SharedAdmission,
  type SharedShipMotion,
} from "./shared-world-store";
import {
  createWorldSubscriptions,
  sharedCellQueries,
  type WorldSubscriptionTransport,
} from "./world-subscriptions";
const systemId = "ad7bf00a-caa0-50ee-b307-332afaac71a1";
const shipId = "fb1ddc75-9ffa-4807-80ad-38f59b0a4a11";
const characterId = "8c01c482-bcf8-46c4-bad6-92c746b9b1ed";
const admission: SharedAdmission = {
  characterId,
  shipId,
  systemId,
  revision: 1n,
};
const motion = (x = 0, y = 0, serverTick = 1n): SharedShipMotion => ({
  shipId,
  systemId,
  x,
  y,
  cellX: BigInt(Math.floor(x / 400)),
  cellY: BigInt(Math.floor(y / 400)),
  vx: 0,
  vy: 0,
  heading: 0,
  omega: 0,
  serverTick,
});
const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
};
function fixture() {
  const queries: {
    sql: string[];
    apply(): void;
    error(event?: unknown): void;
    ack(): void;
    unsubscribe: ReturnType<typeof vi.fn>;
    ended(): boolean;
  }[] = [];
  const transport: WorldSubscriptionTransport = {
    subscribe(sql, callbacks) {
      let active = false,
        ended = false,
        onEnd: (() => void) | undefined;
      const unsubscribe = vi.fn((cb?: () => void) => {
        onEnd = cb;
      });
      queries.push({
        sql,
        apply() {
          active = true;
          callbacks.applied();
        },
        error(event) {
          active = false;
          ended = true;
          callbacks.error({ event });
        },
        ack() {
          active = false;
          ended = true;
          onEnd?.();
        },
        unsubscribe,
        ended: () => ended,
      });
      return {
        isActive: () => active,
        isEnded: () => ended,
        unsubscribe,
        unsubscribeThen: unsubscribe,
      };
    },
  };
  const resources = createConnectionResources(),
    store = new SharedWorldStore(() => 1000),
    onError = vi.fn(),
    onEpoch = vi.fn();
  const adapter = createWorldSubscriptions({
    transport,
    resources,
    store,
    onError,
    onEpoch,
  });
  return { queries, resources, store, adapter, onError, onEpoch };
}
async function ready() {
  const f = fixture();
  f.queries[0].apply();
  await flush();
  f.adapter.acceptObserver(admission, motion());
  expect(f.queries).toHaveLength(2);
  f.queries[1].apply();
  await flush();
  expect(f.queries).toHaveLength(3);
  f.queries[2].apply();
  await flush();
  return f;
}
describe("shared authorized cell scopes", () => {
  it("emits exact negative nine-cell predicates using only authorized views", () => {
    const sql = sharedCellQueries(systemId, { x: -0.01, y: -400.01 });
    expect(sql).toHaveLength(9);
    expect(new Set(sql).size).toBe(9);
    expect(sql[0]).toContain("cell_x = -2 AND cell_y = -3");
    expect(sql[8]).toContain("cell_x = 0 AND cell_y = -1");
    expect(
      sql.every((q) =>
        q.startsWith("SELECT * FROM visible_ship_motion WHERE system_id = '"),
      ),
    ).toBe(true);
    expect(() => sharedCellQueries("x' OR true", { x: 0, y: 0 })).toThrow(
      /UUID/,
    );
    expect(() => sharedCellQueries(systemId, { x: 1e9 + 1, y: 0 })).toThrow();
  });
  it("bootstraps own motion separately and preserves charts outside nearby ship cells", async () => {
    const f = fixture();
    expect(f.queries[0].sql).toEqual([
      "SELECT * FROM own_world_admission",
      "SELECT * FROM visible_ship_descriptions",
      "SELECT * FROM visible_body_descriptions",
      "SELECT * FROM visible_body_motion",
    ]);
    f.adapter.acceptObserver(admission);
    expect(f.queries[1].sql[0]).toContain(`ship_id = '${shipId}'`);
    f.queries[1].apply();
    await flush();
    expect(f.queries).toHaveLength(2);
    expect(f.adapter.acceptObserver(admission, motion())).toBe(true);
    expect(f.queries[2].sql).toHaveLength(9);
    expect(f.adapter.acceptObserver(admission, motion(20, 30, 2n))).toBe(true);
    expect(f.queries).toHaveLength(3);
    f.adapter.dispose();
  });
  it("applies replacement before old unsubscribe and bounds pending plus retiring cell sets", async () => {
    const f = await ready();
    f.adapter.acceptObserver(admission, motion(401, 0, 2n));
    expect(f.queries).toHaveLength(4);
    expect(f.queries[2].unsubscribe).not.toHaveBeenCalled();
    for (let i = 2; i < 100; i++)
      f.adapter.acceptObserver(admission, motion(i * 400, 0, BigInt(i + 2)));
    expect(f.queries).toHaveLength(4);
    expect(f.adapter.getState().handles).toBe(4);
    f.queries[3].apply();
    await flush();
    expect(f.queries[2].unsubscribe).toHaveBeenCalledOnce();
    expect(f.queries).toHaveLength(4); // wait for old unsubscribe acknowledgement
    f.queries[2].ack();
    await flush();
    expect(f.queries).toHaveLength(5);
    expect(f.queries[4].sql[0]).toContain("cell_x = 98"); // latest only, not all 98 crossings
    expect(f.adapter.getState().cellSets).toBe(2);
    f.adapter.dispose();
  });
  it("does not delete keyed aggregate rows when overlapping scope retires", async () => {
    const f = await ready();
    const remote = {
      ...motion(),
      shipId: "370d5f1c-1f92-4971-8c33-dd5062b6aabf",
    };
    f.store.upsert("shipMotion", remote);
    f.store.upsert("shipMotion", remote);
    f.adapter.acceptObserver(admission, motion(401, 0, 2n));
    f.queries[3].apply();
    await flush();
    f.queries[2].ack();
    expect(
      f.store
        .getSnapshot()
        .shipMotion.find((row) => row.shipId === remote.shipId),
    ).toEqual(remote);
    // Only a real SDK aggregate-table deletion removes the row.
    f.store.remove("shipMotion", remote.shipId);
    expect(
      f.store
        .getSnapshot()
        .shipMotion.some((row) => row.shipId === remote.shipId),
    ).toBe(false);
    f.adapter.dispose();
  });
  it("rejects stale epochs, wrong ships, wrong cells and out-of-order accepted rows", async () => {
    const f = await ready();
    expect(f.adapter.acceptObserver(admission, motion(400, 0, 2n), -1)).toBe(
      false,
    );
    expect(
      f.adapter.acceptObserver(admission, { ...motion(), shipId: characterId }),
    ).toBe(false);
    expect(
      f.adapter.acceptObserver(admission, { ...motion(), cellX: 99n }),
    ).toBe(false);
    expect(f.adapter.acceptObserver(admission, motion(10, 0, 20n))).toBe(true);
    expect(f.adapter.acceptObserver(admission, motion(400, 0, 19n))).toBe(
      false,
    );
    expect(f.queries).toHaveLength(3);
    f.adapter.dispose();
  });
  it("revokes handles and store immediately, then releases late pending applications", async () => {
    const f = await ready();
    f.store.upsert("shipMotion", motion());
    f.adapter.acceptObserver(admission, motion(400, 0, 2n));
    const epoch = f.store.getEpoch();
    f.adapter.acceptObserver(undefined);
    expect(f.store.getEpoch()).toBe(epoch + 1);
    expect(f.store.getSnapshot().shipMotion).toEqual([]);
    expect(f.adapter.getState().running).toBe(false);
    expect(f.queries[3].unsubscribe).not.toHaveBeenCalled();
    f.queries[3].apply();
    await flush();
    expect(f.queries[3].unsubscribe).toHaveBeenCalledOnce();
    for (const q of f.queries) q.ack();
    expect(f.adapter.getState().handles).toBe(0);
    expect(f.queries).toHaveLength(4);
    expect(f.adapter.acceptObserver(admission, motion())).toBe(false);
    f.resources.dispose();
  });
  it("resets without accumulating scopes while prior unsubscribe acknowledgements are pending", async () => {
    const f = await ready();
    const epoch = f.store.getEpoch();
    f.adapter.reset();
    f.adapter.reset();
    expect(f.queries).toHaveLength(3);
    expect(f.store.getEpoch()).toBe(epoch + 2);
    f.adapter.acceptObserver(admission, motion(), epoch); // late old socket callback
    expect(f.queries).toHaveLength(3);
    for (const q of [...f.queries]) q.ack();
    expect(f.queries).toHaveLength(4); // one new baseline
    f.adapter.acceptObserver(admission, motion());
    expect(f.queries).toHaveLength(5); // one new own query
    f.adapter.dispose();
  });
  it("subscription errors stop all scopes and clear cached world without undefined messages", async () => {
    const f = await ready();
    f.store.upsert("shipMotion", motion());
    f.queries[2].error(new Error("Discovery authorization revoked"));
    await flush();
    expect(f.onError).toHaveBeenCalledWith("Discovery authorization revoked");
    expect(f.store.getSnapshot().shipMotion).toEqual([]);
    expect(f.adapter.getState().running).toBe(false);
    expect(f.queries[0].unsubscribe).toHaveBeenCalledOnce();
    expect(f.queries[1].unsubscribe).toHaveBeenCalledOnce();
    f.resources.dispose();
  });
  it("replaces admission with a fresh epoch while preserving accepted own rows and retiring prior scopes", async () => {
    const f = await ready();
    const epoch = f.store.getEpoch();
    const next = {
      ...admission,
      revision: 2n,
      shipId: "0cc3a8a7-c42b-4f55-a82d-6bc51ca37b13",
    };
    const nextMotion = { ...motion(800, 0, 10n), shipId: next.shipId };
    expect(f.adapter.acceptObserver(next, nextMotion, epoch)).toBe(true);
    expect(f.store.getEpoch()).toBe(epoch + 1);
    expect(f.store.getSnapshot().admission).toEqual([next]);
    expect(f.store.getSnapshot().shipMotion).toEqual([nextMotion]);
    expect(f.onEpoch).toHaveBeenCalledWith(epoch + 1);
    expect(f.adapter.acceptObserver(admission, motion(), epoch)).toBe(false);
    expect(f.queries).toHaveLength(3);
    for (const query of [...f.queries]) query.ack();
    const own = f.queries.find((q) => q.sql[0].includes(next.shipId));
    expect(own).toBeDefined();
    own!.apply();
    await flush();
    expect(f.queries.at(-1)!.sql[0]).toContain("cell_x = 1");
    f.adapter.dispose();
  });
  it("connection resource disposal and repeated cleanup never revive or double-release handles", async () => {
    const f = await ready();
    f.resources.dispose();
    f.adapter.dispose();
    for (const q of f.queries) {
      expect(q.unsubscribe).toHaveBeenCalledOnce();
      q.ack();
    }
    expect(f.adapter.getState().handles).toBe(0);
    expect(f.adapter.getState().running).toBe(false);
    expect(f.queries).toHaveLength(3);
  });
});
