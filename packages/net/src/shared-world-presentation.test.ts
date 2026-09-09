import { describe, expect, it, vi } from "vitest";
import { SharedWorldStore, type SharedShipMotion } from "./shared-world-store";
import { createSharedWorldPresentation } from "./shared-world-presentation";
const admission = {
  characterId: "captain",
  shipId: "own",
  systemId: "a",
  revision: 1n,
};
const motion = (
  shipId: string,
  x = 0,
  serverTick = 1n,
  systemId = "a",
): SharedShipMotion => ({
  shipId,
  x,
  y: 0,
  vx: 0,
  vy: 0,
  heading: 0,
  omega: 0,
  serverTick,
  systemId,
  cellX: 0n,
  cellY: 0n,
});
function source() {
  const store = new SharedWorldStore();
  store.batch(() => {
    store.upsert("admission", admission);
    store.upsert("shipMotion", motion("own"));
    store.upsert("shipMotion", motion("remote"));
    store.upsert("shipDescription", {
      shipId: "remote",
      displayName: "Remote",
      publishedExteriorAssetId: "hull",
      appearanceRevision: 1n,
    });
  });
  return store;
}
describe("stable active socket presentation", () => {
  it("switches atomically and ignores an old or unselected pending connection", () => {
    const bridge = createSharedWorldPresentation();
    const stable = bridge.store;
    const old = source(),
      pending = source();
    bridge.select(old);
    const snapshots: number[] = [];
    bridge.store.subscribe(() =>
      snapshots.push(bridge.store.getSnapshot().shipMotion.length),
    );
    pending.upsert("shipMotion", motion("pending"));
    expect(stable.getSnapshot().shipMotion).toHaveLength(2);
    const epoch = stable.getEpoch();
    bridge.select(pending);
    expect(bridge.store).toBe(stable);
    expect(stable.getEpoch()).toBe(epoch + 1);
    expect(snapshots).toEqual([3]);
    old.dispose();
    expect(stable.getSnapshot().shipMotion).toHaveLength(3);
    pending.dispose();
    expect(stable.getSnapshot().shipMotion).toEqual([]);
  });
  it("preserves interpolation history and receipt time across unrelated deltas", () => {
    let now = 900;
    const bridge = createSharedWorldPresentation(() => now),
      selected = source();
    bridge.select(selected);
    const epoch = bridge.store.getEpoch();
    now = 1000;
    selected.upsert("shipMotion", motion("remote", 10, 3n));
    expect(bridge.store.sampleShip("remote", 1050, 100)?.x).toBeCloseTo(5);
    now = 1050;
    selected.upsert("shipDescription", {
      shipId: "remote",
      displayName: "Renamed",
      publishedExteriorAssetId: "hull",
      appearanceRevision: 2n,
    });
    bridge.select(selected);
    expect(bridge.store.getEpoch()).toBe(epoch);
    expect(bridge.store.sampleShip("remote", 1050, 100)?.x).toBeCloseTo(5);
    expect(bridge.store.sampleShip("remote", 2001, 100)?.stale).toBe(true);
    const privateUi = vi.fn();
    bridge.store.subscribeTable("admission", privateUi);
    selected.upsert("shipMotion", motion("remote", 20, 4n));
    expect(privateUi).not.toHaveBeenCalled();
  });
  it("diffs keyed deletions and removes descriptions alongside lost contacts", () => {
    const bridge = createSharedWorldPresentation(),
      selected = source();
    bridge.select(selected);
    selected.remove("shipMotion", "remote");
    expect(bridge.store.sampleShip("remote")).toBeUndefined();
    expect(bridge.store.getSnapshot().shipDescription).toEqual([]);
    selected.upsert("shipMotion", motion("remote", 100));
    expect(bridge.store.sampleShip("remote")?.x).toBe(100);
    expect(bridge.store.getSnapshot().shipDescription).toHaveLength(1);
  });
  it("rejects cross-system leftovers and resets on actor/context/epoch changes", () => {
    const bridge = createSharedWorldPresentation(),
      selected = source();
    selected.upsert("shipMotion", motion("foreign", 500, 1n, "b"));
    selected.upsert("bodyMotion", {
      ...motion("unused", 50, 1n, "a"),
      bodyId: "oldplanet",
    });
    selected.upsert("bodyDescription", {
      bodyId: "oldplanet",
      kind: "planet",
      appearance: "ice",
      radius: 2,
      seed: 1,
      height: 0,
    });
    bridge.select(selected);
    expect(bridge.store.getSnapshot().shipMotion.map((r) => r.shipId)).toEqual([
      "own",
      "remote",
    ]);
    const epoch = bridge.store.getEpoch();
    selected.upsert("admission", { ...admission, systemId: "b", revision: 2n });
    expect(bridge.store.getEpoch()).toBe(epoch + 1);
    expect(bridge.store.getSnapshot().shipMotion.map((r) => r.shipId)).toEqual([
      "foreign",
    ]);
    expect(bridge.store.getSnapshot().bodyMotion).toEqual([]);
    expect(bridge.store.getSnapshot().bodyDescription).toEqual([]);
    selected.beginEpoch();
    expect(bridge.store.getSnapshot().admission).toEqual([]);
    expect(bridge.store.getSnapshot().shipMotion).toEqual([]);
  });
  it("shows no rows without admitted actor and detaches permanently on disposal", () => {
    const bridge = createSharedWorldPresentation(),
      selected = source();
    selected.remove("admission", admission.characterId);
    bridge.select(selected);
    expect(bridge.store.getSnapshot().shipMotion).toEqual([]);
    selected.upsert("admission", admission);
    expect(bridge.store.getSnapshot().shipMotion).toHaveLength(2);
    bridge.select(undefined);
    selected.upsert("shipMotion", motion("late"));
    expect(bridge.store.getSnapshot().shipMotion).toEqual([]);
    bridge.dispose();
    bridge.dispose();
    bridge.select(selected);
    expect(bridge.store.getSnapshot().shipMotion).toEqual([]);
  });
});
