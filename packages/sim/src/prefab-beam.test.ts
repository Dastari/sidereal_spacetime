import { describe, expect, it } from "vitest";
import { PREFAB_SHIPS } from "@sidereal/content/prefabs";
import { defaultPrefabComponentCatalog } from "@sidereal/content/ship-prefab-catalog";
import {
  BEAM_HEIGHT_M,
  SHELL_INSET_M,
  castBeamWithShips,
  castPrefabBeam,
  castSegmentBeam,
  prefabBeamModel,
} from "./prefab-beam";
import { prefabToShipMetres } from "./prefab-construction";

const catalog = defaultPrefabComponentCatalog();
const wren = PREFAB_SHIPS.find((p) => p.id === "fed.s.wren")!;
const model = prefabBeamModel(wren, catalog);
const toShip = prefabToShipMetres(wren);
/** Aim angle (0 = ship +y / fore) towards a plan direction. */
const FORE = 0;
const PORT = -Math.PI / 2; // ship -x
const STARBOARD = Math.PI / 2; // ship +x
const AFT = Math.PI;

describe("prefab beam", () => {
  it("never leaves the ship from any deck position: every 60 m shot stops inside the hull", () => {
    for (const plan of [
      [8.625, 3.5],
      [6, 3],
      [6.5, 5],
      [4.5, 1],
      [1.5, 3],
    ] as const) {
      const o = toShip([plan[0], plan[1]]);
      for (let k = 0; k < 64; k++) {
        const hit = castPrefabBeam(model, o, (k / 64) * Math.PI * 2, 60);
        expect(hit.kind, `${plan} ${k}`).not.toBe("none");
        expect(hit.distanceM).toBeLessThan(14);
      }
    }
  });

  it("stops at the exterior shell's inner face, not the outline", () => {
    // Hall centre (plan 6,3) aiming starboard through the open hold door: the hull at plan y 0.
    const hall = toShip([6, 3]);
    const through = castPrefabBeam(model, hall, STARBOARD, 60);
    expect(["hull", "hatch"]).toContain(through.kind);
    expect(through.distanceM).toBeCloseTo(3 - SHELL_INSET_M, 6);
    // From the same spot a little aft (plan x 4), the hold partition at y 2 stops it.
    const wall = castPrefabBeam(model, toShip([4, 3]), STARBOARD, 60);
    expect(wall.kind).toBe("wall");
    expect(wall.distanceM).toBeCloseTo(1 - 0.0625, 6);
    // Bridge approach, aiming port: glass-free exterior wall of the bridge at plan y 7.
    const bridge = toShip([8.625, 3.5]);
    const hull = castPrefabBeam(model, bridge, PORT, 60);
    expect(hull.kind).toBe("hull");
    expect(hull.distanceM).toBeCloseTo(3.5 - SHELL_INSET_M, 6);
  });

  it("passes open interior doorways and stops at glazed partitions", () => {
    // From the hall centre, aim aft through d-engine: the beam crosses the door and the engine
    // room's clear walkway and stops at the aft hull.
    const hall = toShip([6, 3]);
    const aft = castPrefabBeam(model, hall, AFT, 60);
    expect(aft.kind).toBe("hull");
    expect(aft.distanceM).toBeCloseTo(6 - SHELL_INSET_M, 6);
    // In the engine room, aiming port: the reactor front at plan y 4.1 (its catalog envelope).
    const reactor = castPrefabBeam(model, toShip([1.5, 3]), PORT, 60);
    expect(reactor.kind).toBe("object");
    expect(reactor.targetId).toBe("mount:reactor");
    expect(reactor.distanceM).toBeCloseTo(4.1 - 3, 6);
    // From the bunk room, aiming fore: the glazed bridge partition (plan x 8) stops the beam.
    const bunks = toShip([6.5, 5]);
    const fore = castPrefabBeam(model, bunks, FORE, 60);
    expect(fore.kind).toBe("glass");
  });

  it("only furniture taller than the beam stops it", () => {
    // Hold crate (1 m) sits below the beam; aim at it from the hold and the far wall is hit.
    const hold = toShip([3.75, 1.8]);
    const low = castPrefabBeam(model, hold, STARBOARD, 60);
    expect(low.kind).not.toBe("object");
    // The same line at knee height hits the crate.
    const knee = castPrefabBeam(model, hold, STARBOARD, 60, 0.5);
    expect(knee.kind).toBe("object");
    expect(knee.targetId).toBe("socket:hold:0");
    expect(BEAM_HEIGHT_M).toBeGreaterThan(1);
  });

  it("bow profiles stop a beam where the sloped roof comes down", () => {
    // Just inside the nose, a beam at head height meets the roof slope before the outline.
    const nose = toShip([10.9, 3.5]);
    const high = castPrefabBeam(model, nose, FORE, 60, 1.9);
    expect(high.kind).toBe("hull");
    expect(high.targetId.startsWith("bow-")).toBe(true);
    const chest = castPrefabBeam(model, nose, FORE, 60);
    expect(chest.distanceM).toBeGreaterThan(high.distanceM);
  });

  it("another ship's hull stops a beam that leaves the shooter's ship", () => {
    // Shoot from outside our own hull (plan x -6: aft of the drives) so the ray escapes, towards a
    // second Wren 20 m further aft and turned around.
    const origin = toShip([-6, 3]);
    const target = { id: "other", x: 0, y: -25, heading: Math.PI, model };
    const hit = castBeamWithShips(
      { model, x: 0, y: 0, heading: 0 },
      origin,
      AFT,
      60,
      [target],
    );
    expect(hit.kind).toBe("ship");
    expect(hit.targetId).toBe("other");
    // The other ship's nose (plan x 12 -> 6 m fore of its origin) faces us at y -25 + 6.
    expect(origin[1] - hit.distanceM).toBeCloseTo(-25 + 6, 6);
    // Out of range: nothing.
    const far = castBeamWithShips(
      { model, x: 0, y: 0, heading: 0 },
      origin,
      AFT,
      5,
      [target],
    );
    expect(far.kind).toBe("none");
  });

  it("native construction ships use their walking-collision segments", () => {
    const hit = castSegmentBeam(
      [{ id: "w", a: [-1, 2], b: [1, 2] }],
      [0, 0],
      0,
      60,
    );
    expect(hit).toEqual({
      kind: "wall",
      targetId: "w",
      distanceM: 2,
      point: [0, 2],
    });
    expect(castSegmentBeam([], [0, 0], 0, 60).kind).toBe("none");
  });

  for (const prefab of PREFAB_SHIPS)
    it(`${prefab.id}: a shot from the ship's centre never escapes the hull`, () => {
      const m = prefabBeamModel(prefab, catalog);
      // Ship-local origin is the prefab bounding-box centre, inside the hull.
      const o: [number, number] = [0, 0];
      for (let k = 0; k < 16; k++) {
        const hit = castPrefabBeam(m, o, (k / 16) * Math.PI * 2, 200);
        expect(hit.kind).not.toBe("none");
      }
    });
});
