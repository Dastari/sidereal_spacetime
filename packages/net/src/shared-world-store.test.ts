import { describe, expect, it, vi } from "vitest";
import { SharedWorldStore, type SharedShipMotion } from "./shared-world-store";
const motion = (
  shipId: string,
  serverTick = 10n,
  x = 0,
  extra: Partial<SharedShipMotion> = {},
): SharedShipMotion => ({
  shipId,
  systemId: "system",
  cellX: 0n,
  cellY: 0n,
  x,
  y: 0,
  vx: 1,
  vy: 0,
  heading: 0,
  omega: 0,
  serverTick,
  ...extra,
});
describe("keyed shared-world cache", () => {
  it("upserts by stable entity ID and preserves snapshot identity on duplicate or old samples", () => {
    const store = new SharedWorldStore(() => 1000);
    store.upsert("shipMotion", motion("a"));
    const snapshot = store.getSnapshot();
    expect(store.upsert("shipMotion", motion("a"))).toBe(false);
    expect(store.getSnapshot()).toBe(snapshot);
    expect(store.upsert("shipMotion", motion("a", 9n, 99))).toBe(false);
    expect(store.getSnapshot()).toBe(snapshot);
    store.upsert("shipMotion", motion("a", 11n, 1));
    expect(store.getSnapshot().shipMotion).toHaveLength(1);
    expect(store.getSnapshot().shipMotion[0].x).toBe(1);
  });
  it("notifies only the changed table and batches one coherent snapshot", () => {
    const store = new SharedWorldStore(() => 1000),
      all = vi.fn(),
      ships = vi.fn(),
      bodies = vi.fn();
    store.subscribe(all);
    store.subscribeTable("shipMotion", ships);
    store.subscribeTable("bodyMotion", bodies);
    const bodyReference = store.getTableSnapshot("bodyMotion");
    store.batch(() => {
      store.upsert("shipMotion", motion("b"));
      store.upsert("shipMotion", motion("a"));
      expect(all).not.toHaveBeenCalled();
    });
    expect(all).toHaveBeenCalledTimes(1);
    expect(ships).toHaveBeenCalledTimes(1);
    expect(bodies).not.toHaveBeenCalled();
    expect(store.getTableSnapshot("bodyMotion")).toBe(bodyReference);
    expect(store.getSnapshot().shipMotion.map((s) => s.shipId)).toEqual([
      "a",
      "b",
    ]);
  });
  it("delete immediately removes the render sample; reinsertion starts a new buffer", () => {
    const store = new SharedWorldStore(() => 1000);
    store.upsert("shipMotion", motion("a", 10n, 0));
    store.upsert("shipMotion", motion("a", 11n, 10));
    expect(store.remove("shipMotion", "a")).toBe(true);
    expect(store.sampleShip("a")).toBeUndefined();
    store.upsert("shipMotion", motion("a", 11n, 400));
    expect(store.sampleShip("a")?.x).toBe(400);
    expect(store.getSnapshot().shipMotion).toHaveLength(1);
  });
  it("reconnect/admission epoch clears all rows and rejects late callbacks from old sockets", () => {
    const store = new SharedWorldStore(() => 1000);
    const old = store.getEpoch();
    store.upsert("shipMotion", motion("a"));
    store.upsert("shipDescription", {
      shipId: "a",
      publishedExteriorAssetId: "hull",
      appearanceRevision: 1n,
      displayName: "A",
    });
    const next = store.beginEpoch();
    expect(next).toBe(old + 1);
    expect(store.getSnapshot().shipMotion).toEqual([]);
    expect(store.getSnapshot().shipDescription).toEqual([]);
    expect(store.upsert("shipMotion", motion("a", 12n, 30), old)).toBe(false);
    store.upsert("shipMotion", motion("a", 12n, 40), next);
    expect(store.remove("shipMotion", "a", old)).toBe(false);
    expect(store.sampleShip("a")?.x).toBe(40);
  });
  it("bounds row counts, sample counts, invalid data and one selected admission", () => {
    const store = new SharedWorldStore(() => 1000, {
      ships: 1,
      bodies: 1,
      samples: 2,
    });
    expect(store.upsert("shipMotion", motion("a"))).toBe(true);
    expect(store.upsert("shipMotion", motion("b"))).toBe(false);
    expect(store.upsert("shipMotion", motion("a", 11n, NaN))).toBe(false);
    for (let i = 11; i < 30; i++)
      store.upsert("shipMotion", motion("a", BigInt(i), i));
    expect(store.sampleShip("a", 1000, 1000)?.x).toBe(28);
    expect(
      store.upsert("admission", {
        characterId: "c",
        shipId: "a",
        systemId: "system",
        revision: 1n,
      }),
    ).toBe(true);
    expect(
      store.upsert("admission", {
        characterId: "d",
        shipId: "b",
        systemId: "system",
        revision: 1n,
      }),
    ).toBe(false);
  });
  it("unsubscribes listeners and disposal clears state without accepting later updates", () => {
    const store = new SharedWorldStore(() => 1000),
      callback = vi.fn();
    const unsub = store.subscribeTable("shipMotion", callback);
    unsub();
    store.upsert("shipMotion", motion("a"));
    expect(callback).not.toHaveBeenCalled();
    store.dispose();
    expect(store.sampleShip("a")).toBeUndefined();
    expect(store.getSnapshot().shipMotion).toEqual([]);
    expect(store.upsert("shipMotion", motion("b"))).toBe(false);
  });
});
describe("server-sample interpolation", () => {
  it("interpolates position at synchronized50ms stamps without modifying accepted cache", () => {
    const store = new SharedWorldStore(() => 1000);
    store.upsert("shipMotion", motion("a", 10n, 0), 0, 900);
    store.upsert("shipMotion", motion("a", 12n, 10), 0, 1000);
    expect(store.sampleShip("a", 1050, 100)?.x).toBeCloseTo(5);
    expect(store.getSnapshot().shipMotion[0].x).toBe(10);
    expect(store.sampleShip("a", 1150, 100)?.x).toBe(10);
  });
  it("rotates via shortest heading arc and holds latest accepted position after long silence", () => {
    const store = new SharedWorldStore(() => 1000);
    store.upsert(
      "shipMotion",
      motion("a", 10n, 0, { heading: Math.PI - 0.1 }),
      0,
      900,
    );
    store.upsert(
      "shipMotion",
      motion("a", 12n, 10, { heading: -Math.PI + 0.1 }),
      0,
      1000,
    );
    expect(store.sampleShip("a", 1050, 100)?.heading).toBeCloseTo(Math.PI);
    expect(store.sampleShip("a", 100000, 100)).toMatchObject({
      x: 10,
      stale: true,
    });
  });
  it("replaces corrected same-tick samples and resets on a system transfer or long gap", () => {
    const store = new SharedWorldStore(() => 1000);
    store.upsert("shipMotion", motion("a", 10n, 0), 0, 900);
    store.upsert("shipMotion", motion("a", 10n, 8), 0, 950);
    expect(store.sampleShip("a")?.x).toBe(8);
    store.upsert(
      "shipMotion",
      motion("a", 11n, 100, { systemId: "another" }),
      0,
      1000,
    );
    expect(store.sampleShip("a")?.x).toBe(100);
    store.upsert(
      "shipMotion",
      motion("a", 2000n, 200, { systemId: "another" }),
      0,
      1000,
    );
    expect(store.sampleShip("a")?.x).toBe(200);
  });
  it("uses bounded bigint differences so large authoritative tick epochs retain precision", () => {
    const store = new SharedWorldStore(() => 1000),
      base = 2n ** 60n;
    store.upsert("shipMotion", motion("a", base, 0), 0, 900);
    store.upsert("shipMotion", motion("a", base + 2n, 10), 0, 1000);
    expect(store.sampleShip("a", 1050, 100)?.x).toBeCloseTo(5);
  });
});
