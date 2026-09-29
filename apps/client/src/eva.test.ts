import { describe, expect, it } from "vitest";
import { PREFAB_SHIPS } from "@sidereal/content/prefabs";
import { defaultPrefabComponentCatalog } from "@sidereal/content/ship-prefab-catalog";
import { EVA, prefabEvaModel, shipToWorld } from "@sidereal/sim/eva";
import { shipLogicModel } from "@sidereal/sim/ship-logic-model";
import {
  atOpenHatch,
  buttonDepressurises,
  evaFacingFromAim,
  evaSuitRefusalOf,
  evaThrustFromKeys,
  evaBodiesForScene,
  evaHomeVisit,
  evaIntent,
  evaScene,
  localAimAngle,
  legacyEntryAction,
  logicButtonAction,
  logicDoorStates,
  logicPanelLights,
  screenToShipTopDown,
  screenToWorldTopDown,
  worldAimAngle,
  type EvaBodyRow,
  type ShipLogicRow,
} from "./eva";

const catalog = defaultPrefabComponentCatalog();
const wren = PREFAB_SHIPS.find((p) => p.id === "fed.s.wren")!;
const model = prefabEvaModel(wren, catalog);
const logic = shipLogicModel(wren, catalog)!;
const lock = model.entries[0];
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
  phase: "local",
  x: 0,
  y: 0,
  vx: 3,
  vy: 0,
  heading: 0.6,
  anchorShipId: "wren",
  localX: 7,
  localY: 1,
  localHeading: 0.2,
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
const identity = (h: number, v: number) => ({ dx: h, dy: v });

describe("EVA client input (jetpack, screen relative)", () => {
  it("WASD is the thrust direction through the frame mapping; blocked or inactive sends nothing", () => {
    expect(evaIntent(keys("KeyW"), true, false, identity)).toMatchObject({
      dx: 0,
      dy: 1,
      throttle: 0,
      turn: 0,
    });
    expect(evaIntent(keys("KeyA"), true, false, identity)).toMatchObject({
      dx: -1,
      dy: 0,
    });
    expect(evaIntent(keys("KeyW"), true, true, identity).dy).toBe(0);
    expect(evaIntent(keys("KeyW"), false, false, identity).dy).toBe(0);
    expect(evaIntent(keys(), true, false, identity)).toMatchObject({
      dx: 0,
      dy: 0,
    });
  });
  it("maps the north-up top-down camera to world and ship directions", () => {
    expect(screenToWorldTopDown(1, 1).dx).toBeCloseTo(Math.SQRT1_2, 9);
    // ship heading 90°: bow points world −X; screen up (world +Y) is ship starboard (+x)
    const d = screenToShipTopDown(0, 1, Math.PI / 2);
    expect(d.dx).toBeCloseTo(1, 9);
    expect(d.dy).toBeCloseTo(0, 9);
  });
});

describe("same-plane scene", () => {
  it("a body in the loaded ship's frame keeps its accepted local point, floating at deck height", () => {
    const s = evaScene(body(), ship);
    expect(s.local).toBe(true);
    expect([s.localX, s.localY]).toEqual([7, 1]);
    expect(s.localHeading).toBe(0.2);
    expect(s.phase).toBe("free");
    expect(s.elevation).toBeCloseTo(0.1875 + EVA.floatElevationM, 9);
  });
  it("a free body (or one in another ship's frame) is placed by its world pose", () => {
    const w = shipToWorld(ship, [20, -3]);
    const s = evaScene(
      body({ phase: "free", anchorShipId: "", x: w[0], y: w[1] }),
      ship,
    );
    expect(s.local).toBe(false);
    expect(s.localX).toBeCloseTo(20, 9);
    expect(s.localY).toBeCloseTo(-3, 9);
  });
  it("keeps the home visit while outside", () => {
    expect(evaHomeVisit(body(), { id: "cap", shipId: "wren" })).toMatchObject({
      instanceId: "wren",
      visitId: "visit-1",
    });
    expect(
      evaHomeVisit(body({ exitShipId: "other" }), {
        id: "cap",
        shipId: "wren",
      }),
    ).toBeUndefined();
  });
});

describe("wall buttons (E)", () => {
  const panel = (id: string) => logic.panels.find((p) => p.deviceId === id)!;
  it("offers the right button from the deck and from space, with a label from its wiring", () => {
    expect(
      logicButtonAction({
        shipId: "wren",
        logic,
        aboard: panel("btn-lock-in").front,
      }),
    ).toMatchObject({
      kind: "button",
      deviceId: "btn-lock-in",
      label: "Cycle airlock",
    });
    expect(
      logicButtonAction({
        shipId: "wren",
        logic,
        outside: panel("btn-lock-out").front,
      })?.label,
    ).toBe("Cycle airlock");
    expect(
      logicButtonAction({
        shipId: "wren",
        logic,
        aboard: panel("btn-hall").front,
      })?.label,
    ).toBe("Open airlock (inner door)");
    // An outside panel is not offered from the deck (and vice versa); far away: nothing.
    expect(
      logicButtonAction({
        shipId: "wren",
        logic,
        aboard: panel("btn-lock-out").front,
      }),
    ).not.toMatchObject({ deviceId: "btn-lock-out" });
    expect(
      logicButtonAction({ shipId: "wren", logic, aboard: [0, 0] }),
    ).toBeUndefined();
  });
  it("reads door states and lights from the logic view for the loaded ship only", () => {
    const rows: ShipLogicRow[] = [
      {
        shipId: "wren",
        deviceId: "door-outer",
        kind: "door",
        state: "open",
        light: "off",
        open: true,
        endsMicros: 0n,
        pressedMicros: 0n,
      },
      {
        shipId: "wren",
        deviceId: "btn-lock-in",
        kind: "button",
        state: "red",
        light: "red",
        open: false,
        endsMicros: 0n,
        pressedMicros: 5n,
      },
      {
        shipId: "kite",
        deviceId: "door-inner",
        kind: "door",
        state: "open",
        light: "off",
        open: true,
        endsMicros: 0n,
        pressedMicros: 0n,
      },
    ];
    const doors = logicDoorStates(rows, "wren", logic);
    expect(doors.get(lock.id)).toBe(true);
    expect(doors.get("d-hold")).toBe(false);
    expect(logicPanelLights(rows, "wren").get("btn-lock-in")).toEqual({
      light: "red",
      pressedMicros: 5,
    });
  });
});

describe("remote spacewalkers and aim", () => {
  it("draws other spacewalkers in the own ship frame, never the own body", () => {
    const rows = [
      {
        ...body(),
        characterId: "cap",
        name: "Cap",
        cycling: false,
        dead: false,
        connected: true,
        appearanceJson: "{}",
        equipmentJson: "[]",
        aimActive: false,
        aimAngle: 0,
        shotSequence: 0n,
        shotX: 0,
        shotY: 0,
        shotStruck: false,
      },
      {
        ...body({ localX: 9, localY: 2 }),
        characterId: "mate",
        name: "Mate",
        cycling: false,
        dead: false,
        connected: true,
        appearanceJson: "{}",
        equipmentJson: "[]",
        aimActive: false,
        aimAngle: 0,
        shotSequence: 0n,
        shotX: 0,
        shotY: 0,
        shotStruck: false,
      },
    ];
    const out = evaBodiesForScene(rows, "cap", ship, () => ({
      crewAppearance: {} as never,
      heldItem: null,
    }));
    expect(out.map((r) => r.id)).toEqual(["mate"]);
    expect([out[0].localX, out[0].localY]).toEqual([9, 2]);
  });
  it("converts aim between the ship frame and the world", () => {
    expect(localAimAngle(worldAimAngle(0.3, 1.1), 1.1)).toBeCloseTo(0.3, 9);
  });
});

describe("suit IFCS controls (pointer facing, thrust relative to it)", () => {
  it("W thrusts toward the facing at any angle; A/D strafe; nothing pressed sends nothing", () => {
    for (const facing of [0, 0.37, -2.2]) {
      const w = evaThrustFromKeys(keys("KeyW"), facing, false);
      expect(w.dx).toBeCloseTo(-Math.sin(facing), 9);
      expect(w.dy).toBeCloseTo(Math.cos(facing), 9);
    }
    const d = evaThrustFromKeys(keys("KeyD"), 0, false);
    expect([d.dx, d.dy]).toEqual([1, 0]);
    expect(evaThrustFromKeys(keys(), 1, false)).toMatchObject({ dx: 0, dy: 0 });
    expect(evaThrustFromKeys(keys("KeyW"), 1, true)).toMatchObject({
      dx: 0,
      dy: 0,
    });
  });
  it("free mode: W/S along the body heading, A/D spin, Shift+A/D strafe", () => {
    expect(evaThrustFromKeys(keys("KeyA"), 0, false, true)).toMatchObject({
      turn: 1,
      dx: 0,
      dy: 0,
    });
    expect(
      evaThrustFromKeys(keys("KeyD", "ShiftLeft"), 0, false, true),
    ).toMatchObject({ turn: 0, dx: 1, dy: 0 });
    expect(
      evaThrustFromKeys(keys("KeyW"), Math.PI / 2, false, true).dx,
    ).toBeCloseTo(-1, 9);
  });
  it("maps the pointer aim (combat convention) to a heading in the body's frame", () => {
    expect(evaFacingFromAim(0.5, true, 1.2)).toBeCloseTo(-0.5, 9);
    expect(evaFacingFromAim(0.5, false, 1.2)).toBeCloseTo(0.7, 9);
  });
});

describe("suit gate on the client (the server enforces the same rule)", () => {
  const item = (equipmentSlot: string, definitionId: string) => ({
    equipmentSlot,
    definitionId,
  });
  it("refuses without the suit, helmet and jetpack", () => {
    expect(evaSuitRefusalOf([])).toContain(
      "pressure suit, helmet and EVA jetpack",
    );
    expect(
      evaSuitRefusalOf([
        item("uniform", "wardrobe-suit-body"),
        item("helmet", "wardrobe-suit-helmet"),
        item("back", "wardrobe-suit-pack"),
      ]),
    ).toBe("");
  });
  it("knows which presses depressurise and when a walker stands in an open hatch", () => {
    const row = (state: string): ShipLogicRow => ({
      shipId: "wren",
      deviceId: "lock",
      kind: "airlock-controller",
      state,
      light: "green",
      open: false,
      endsMicros: 0n,
      pressedMicros: 0n,
    });
    expect(
      buttonDepressurises(logic, [row("pressurised")], "wren", "btn-lock-in"),
    ).toBe(true);
    expect(
      buttonDepressurises(logic, [row("vacuum")], "wren", "btn-lock-in"),
    ).toBe(false);
    expect(
      buttonDepressurises(logic, [row("pressurised")], "wren", "btn-hall"),
    ).toBe(false);
    const inLane: [number, number] = [
      lock.hatch[0] - lock.normal[0] * 0.3,
      lock.hatch[1] - lock.normal[1] * 0.3,
    ];
    expect(atOpenHatch(model, new Map([[lock.id, true]]), inLane)).toBe(true);
    expect(atOpenHatch(model, new Map([[lock.id, false]]), inLane)).toBe(false);
  });
});

describe("legacy re-entry at hatches without ship logic (never stranded)", () => {
  it("offers E at a logic-less hatch, never at a logic-driven one", () => {
    const at: [number, number] = [lock.outside[0], lock.outside[1]];
    expect(
      legacyEntryAction({ shipId: "wren", model, logic: null, outside: at }),
    ).toMatchObject({
      kind: "legacy-entry",
      airlockId: lock.id,
    });
    expect(
      legacyEntryAction({ shipId: "wren", model, logic, outside: at }),
    ).toBeUndefined();
    expect(
      legacyEntryAction({
        shipId: "wren",
        model,
        logic: null,
        outside: [60, 60],
      }),
    ).toBeUndefined();
  });
});
