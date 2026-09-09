import { describe, expect, it } from "vitest";
import { SharedWorldStore } from "@sidereal/net";
import { SHARED_SYSTEM_SEED } from "@sidereal/content/shared-system";
import {
  sharedBodyPresentation,
  bodyDestinations,
} from "./shared-body-presentation";
const admission = {
  characterId: "actor",
  shipId: "ship",
  systemId: "system",
  revision: 1n,
};
const canonical = SHARED_SYSTEM_SEED.bodies.find((b) => b.kind === "planet")!;
const description = {
  bodyId: canonical.id,
  kind: "planet",
  appearance: "ice",
  radius: 81,
  height: -91,
  seed: 22,
};
const motion = (x: number, tick: bigint) => ({
  bodyId: canonical.id,
  systemId: "system",
  cellX: 0n,
  cellY: 0n,
  serverTick: tick,
  x,
  y: -321,
  vx: 4,
  vy: 5,
  heading: 0.4,
  omega: 0.1,
});
describe("accepted shared body presentation", () => {
  it("uses canonical display keys but never substitutes seed geometry or position", () => {
    const store = new SharedWorldStore();
    store.upsert("admission", admission);
    store.upsert("bodyDescription", description);
    expect(sharedBodyPresentation(store, 1000)).toEqual([]);
    store.upsert("bodyMotion", motion(456, 1n));
    expect(sharedBodyPresentation(store, 1000, false)[0]).toEqual({
      id: canonical.id,
      key: canonical.key,
      kind: "planet",
      appearance: "ice",
      radius: 81,
      height: -91,
      seed: 22,
      x: 456,
      y: -321,
      vx: 4,
      vy: 5,
      heading: 0.4,
      omega: 0.1,
    });
    expect(
      bodyDestinations(sharedBodyPresentation(store, 1000, false))[0],
    ).toMatchObject({ id: canonical.id, x: 456, y: -321 });
  });
  it("samples interpolated render motion separately from accepted navigation position", () => {
    const store = new SharedWorldStore(() => 1000);
    store.upsert("admission", admission);
    store.upsert("bodyDescription", description);
    store.upsert("bodyMotion", motion(0, 1n), 0, 900);
    store.upsert("bodyMotion", motion(10, 3n), 0, 1000);
    expect(sharedBodyPresentation(store, 1050)[0].x).toBeCloseTo(5);
    expect(sharedBodyPresentation(store, 1050, false)[0].x).toBe(10);
    store.upsert("admission", {
      ...admission,
      systemId: "elsewhere",
      revision: 2n,
    });
    expect(sharedBodyPresentation(store, 1050)).toEqual([]);
  });
  it("removes deleted or revoked contacts and never derives missing positions", () => {
    const store = new SharedWorldStore();
    store.upsert("bodyDescription", description);
    store.upsert("bodyMotion", motion(90, 1n));
    expect(sharedBodyPresentation(store, 1000)).toEqual([]);
    store.upsert("admission", admission);
    expect(sharedBodyPresentation(store, 1000)).toHaveLength(1);
    store.remove("bodyMotion", canonical.id);
    expect(sharedBodyPresentation(store, 1000)).toEqual([]);
  });
});
