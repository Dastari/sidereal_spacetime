import { describe, expect, it } from "vitest";
import { PREFAB_SHIPS } from "@sidereal/content/prefabs";
import { defaultPrefabComponentCatalog } from "@sidereal/content/ship-prefab-catalog";
import { prefabEvaModel, shipToWorld } from "@sidereal/sim/eva";
import {
  evaAirlockAction,
  evaBodiesForScene,
  evaCanMaglock,
  evaHomeVisit,
  evaIntent,
  evaScene,
  localAimAngle,
  screenToShipTopDown,
  worldAimAngle,
  type EvaBodyRow,
} from "./eva";

const wren = PREFAB_SHIPS.find((p) => p.id === "fed.s.wren")!;
const model = prefabEvaModel(wren, defaultPrefabComponentCatalog());
const lock = model.airlocks[0];
const ship = {
  id: "wren",
  x: 100,
  y: -20,
  vx: 3,
  vy: 0,
  heading: 0.6,
  omega: 0,
};
const body = (over: Partial<EvaBodyRow> = {}): EvaBodyRow => ({
  characterId: "cap",
  phase: "free",
  x: 0,
  y: 0,
  vx: 3,
  vy: 0,
  heading: 0.6,
  anchorShipId: "",
  localX: 0,
  localY: 0,
  localHeading: 0,
  forward: 0,
  strafe: 0,
  turn: 0,
  walking: false,
  exitShipId: "wren",
  visitId: "visit-1",
  deckId: "deck",
  returnEndsMicros: 0n,
  stranded: false,
  ...over,
});
const keys = (...codes: string[]) => new Set(codes);
const noWalk = () => ({ dx: 0, dy: 0 });

describe("EVA client input", () => {
  it("maps jetpack keys: W/S thrust, A/D turn (A counter-clockwise), Shift+A/D strafe", () => {
    expect(evaIntent(keys("KeyW"), "free", false, noWalk)).toMatchObject({
      throttle: 1,
      turn: 0,
      dx: 0,
    });
    expect(evaIntent(keys("KeyA"), "free", false, noWalk).turn).toBe(1);
    expect(
      evaIntent(keys("KeyD", "ShiftLeft"), "free", false, noWalk),
    ).toMatchObject({
      turn: 0,
      dx: 1,
    });
    expect(evaIntent(keys("KeyW"), "free", true, noWalk).throttle).toBe(0);
    expect(evaIntent(keys("KeyW"), undefined, false, noWalk).throttle).toBe(0);
  });

  it("walks screen-relative when maglocked, rotated into the ship frame", () => {
    const walk = evaIntent(keys("KeyW"), "maglocked", false, (h, v) =>
      screenToShipTopDown(h, v, Math.PI / 2),
    );
    // ship heading 90°: bow points world −X; screen up (world +Y) is ship starboard (+x)
    expect(walk.throttle).toBe(0);
    expect(walk.dx).toBeCloseTo(1, 9);
    expect(walk.dy).toBeCloseTo(0, 9);
  });

  it("converts aim between the ship-local and world conventions", () => {
    expect(worldAimAngle(0, Math.PI / 2)).toBeCloseTo(-Math.PI / 2, 9);
    expect(localAimAngle(worldAimAngle(0.3, 1.1), 1.1)).toBeCloseTo(0.3, 9);
  });
});

describe("EVA client presentation", () => {
  it("places a free body in the own ship frame from the world pose", () => {
    const [x, y] = shipToWorld(ship, [4, -1]);
    const scene = evaScene(body({ x, y }), ship, model, false);
    expect(scene.localX).toBeCloseTo(4, 9);
    expect(scene.localY).toBeCloseTo(-1, 9);
    expect(scene.localHeading).toBeCloseTo(0, 9);
    expect(scene.phase).toBe("free");
    expect(scene.elevation).toBeGreaterThan(2);
  });

  it("uses the accepted local point and the roof height when maglocked on the own ship", () => {
    const scene = evaScene(
      body({
        phase: "maglocked",
        anchorShipId: "wren",
        localX: 0,
        localY: 0,
        localHeading: 1,
      }),
      ship,
      model,
      false,
    );
    expect([scene.localX, scene.localY, scene.localHeading]).toEqual([0, 0, 1]);
    expect(scene.elevation).toBeCloseTo(43 / 16, 9);
  });

  it("keeps the home ship scene only for the ship left", () => {
    expect(evaHomeVisit(body(), { id: "cap", shipId: "wren" })).toMatchObject({
      visitId: "visit-1",
      instanceId: "wren",
      deckId: "deck",
    });
    expect(
      evaHomeVisit(body(), { id: "cap", shipId: "other" }),
    ).toBeUndefined();
  });

  it("offers the airlock from the deck, from space and to cancel", () => {
    expect(
      evaAirlockAction({
        shipId: "wren",
        model,
        aboard: { localX: lock.inside[0], localY: lock.inside[1] },
        eva: undefined,
        cycle: undefined,
      })?.label,
    ).toBe("Cycle airlock (EVA)");
    const outside = evaScene(
      body({ ...Object.fromEntries([["x", 0]]) }),
      { ...ship, x: 0, y: 0, heading: 0 },
      model,
      false,
    );
    expect(
      evaAirlockAction({
        shipId: "wren",
        model,
        aboard: undefined,
        eva: { ...outside, localX: lock.outside[0], localY: lock.outside[1] },
        cycle: undefined,
      })?.label,
    ).toBe("Cycle airlock (enter)");
    expect(
      evaAirlockAction({
        shipId: "wren",
        model,
        aboard: undefined,
        eva: { ...outside, localX: 30, localY: 30 },
        cycle: undefined,
      }),
    ).toBeUndefined();
    expect(
      evaAirlockAction({
        shipId: "wren",
        model,
        aboard: undefined,
        eva: undefined,
        cycle: {
          characterId: "cap",
          shipId: "wren",
          airlockId: "airlock",
          direction: "out",
          startedMicros: 0n,
          endsMicros: 1n,
        },
      })?.label,
    ).toBe("Cancel airlock cycle");
  });

  it("offers the maglock only over the hull at a safe relative speed", () => {
    const still = { ...ship, x: 0, y: 0, vx: 0, heading: 0 };
    expect(evaCanMaglock(body({ vx: 0 }), still, model)).toBe(true);
    expect(evaCanMaglock(body({ vx: 5 }), still, model)).toBe(false);
    expect(evaCanMaglock(body({ x: 40, vx: 0 }), still, model)).toBe(false);
  });

  it("draws other EVA bodies as remote crew with zero-g state, never the own body", () => {
    const [x, y] = shipToWorld(ship, [2, 3]);
    const rows = evaBodiesForScene(
      [
        {
          characterId: "mate",
          name: "Mate",
          phase: "free",
          x,
          y,
          heading: ship.heading + 0.5,
          anchorShipId: "",
          localX: 0,
          localY: 0,
          localHeading: 0,
          forward: 1,
          strafe: 0,
          turn: 0,
          walking: false,
          cycling: false,
          dead: false,
          connected: true,
          appearanceJson: "{}",
          equipmentJson: "{}",
          aimActive: false,
          aimAngle: 0,
          shotSequence: 0n,
          shotX: 0,
          shotY: 0,
          shotStruck: false,
        },
        { characterId: "cap" } as never,
      ],
      "cap",
      ship,
      model,
      () => ({ crewAppearance: {}, heldItem: null }),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].localX).toBeCloseTo(2, 9);
    expect(rows[0].eva.localHeading).toBeCloseTo(0.5, 9);
    expect(rows[0].eva.forward).toBe(1);
  });
});
