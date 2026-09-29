/** Ship logic editing in the Shipyard prefab editor: pure commands, the Button tool and picking. */
import { describe, expect, it } from "vitest";
import { prefabById } from "@sidereal/content/prefabs";
import { defaultPrefabComponentCatalog } from "@sidereal/content/ship-prefab-catalog";
import {
  deriveInterior,
  logicWallPlacement,
  validateShipPrefab,
  type PrefabIssue,
  type ShipPrefabDocumentV1,
} from "@sidereal/content/ship-prefab";
import {
  addAirlockController,
  addLogicButton,
  addLogicDoor,
  addLogicWire,
  moveLogicButton,
  nudgeSelection,
  removeLogicWire,
  removeSelection,
  renameElement,
  rotateSelection,
  selectionExists,
  setControllerCycle,
  type CommandResult,
} from "./commands";
import { geometriesOf, issueSelection } from "./derive";
import { DEFAULT_LAYERS, hitTest, selectionCentre } from "./hit-test";
import { logicAnchors } from "./logic-layout";
import { buttonGesture, buttonPlace } from "./tool-actions";

type Doc = ShipPrefabDocumentV1;
const catalog = defaultPrefabComponentCatalog();

/** Wren r6 without its logic: the airlock hold, hall door and starboard hatch are all there. */
const wren = (): Doc => {
  const { logic: _logic, ...rest } = structuredClone(
    prefabById("fed.s.wren")!,
  ) as Doc;
  void _logic;
  return rest;
};

function ok(r: CommandResult, what: string): CommandResult {
  if (r.error) throw Error(`${what}: ${r.error}`);
  return r;
}
const selId = (r: CommandResult) => (r.select as { id: string }).id;
const logicIssues = (doc: Doc) =>
  validateShipPrefab(doc, catalog).filter((i) => i.ref.kind === "logic");

/** Wren's airlock authored with the editor: 3 buttons, 2 door actuators, a controller, 10 wires. */
function authorAirlock() {
  let doc = wren();
  const place = (p: [number, number]) => {
    const r = ok(buttonPlace(doc, catalog, p), `button at ${p}`);
    doc = r.doc;
    return selId(r);
  };
  const inside = place([7.5, 0.3]);
  const outside = place([7.5, -0.3]);
  const hall = place([7.5, 2.3]);
  let r = ok(addAirlockController(doc, 3), "controller");
  doc = r.doc;
  const ctl = selId(r);
  r = ok(addLogicDoor(doc, "d-hold", catalog), "inner door");
  doc = r.doc;
  const inner = selId(r);
  r = ok(addLogicDoor(doc, "airlock", catalog), "outer door");
  doc = r.doc;
  const outer = selId(r);
  const wire = (a: string, b: string) => {
    const [fd, fp] = a.split(":");
    const [td, tp] = b.split(":");
    doc = ok(
      addLogicWire(doc, { device: fd, port: fp }, { device: td, port: tp }),
      `wire ${a} ${b}`,
    ).doc;
  };
  wire(`${ctl}:inner`, `${inner}:command`);
  wire(`${ctl}:outer`, `${outer}:command`);
  wire(`${inner}:state`, `${ctl}:inner_state`);
  wire(`${outer}:state`, `${ctl}:outer_state`);
  for (const [b, input] of [
    [inside, "cycle"],
    [outside, "cycle"],
    [hall, "open_inner"],
  ]) {
    wire(`${b}:pressed`, `${ctl}:${input}`);
    wire(`${ctl}:light`, `${b}:light`);
  }
  return { doc, inside, outside, hall, ctl, inner, outer };
}

describe("wall buttons", () => {
  it("places Wren's buttons inside the hold, outside the hull and in the hall", () => {
    const doc0 = wren();
    expect(doc0.logic).toBeUndefined();
    const a = ok(buttonPlace(doc0, catalog, [7.5, 0.3]), "inside");
    // The first device creates the logic object.
    expect(a.doc.logic!.devices).toEqual([
      { id: "btn", kind: "button", at: [7.5, 0], normal: "port" },
    ]);
    expect(a.select).toEqual({ kind: "logic", id: "btn" });
    const b = ok(buttonPlace(a.doc, catalog, [7.5, -0.3]), "outside");
    const c = ok(buttonPlace(b.doc, catalog, [7.4, 2.2]), "hall");
    const [inside, outside, hall] = c.doc.logic!.devices;
    expect(outside).toEqual({
      id: "btn-2",
      kind: "button",
      at: [7.5, 0],
      normal: "starboard",
    });
    expect(hall).toMatchObject({ at: [7.5, 2], normal: "port" });
    expect(logicWallPlacement(c.doc, inside, catalog)).toMatchObject({
      side: "interior",
      wall: "hull",
      room: "hold",
    });
    expect(logicWallPlacement(c.doc, outside, catalog)).toMatchObject({
      side: "exterior",
      wall: "hull",
      room: null,
    });
    expect(logicWallPlacement(c.doc, hall, catalog)).toMatchObject({
      side: "interior",
      wall: "partition",
      room: "hall",
    });
  });

  it("snaps to the 0.25 m grid on the nearest wall line and faces the clicked side", () => {
    expect(buttonGesture([7.4, 0.1])).toEqual({ at: [7.5, 0], normal: "port" });
    expect(buttonGesture([7.4, -0.1])).toEqual({
      at: [7.5, 0],
      normal: "starboard",
    });
    expect(buttonGesture([3.1, 1.4])).toEqual({
      at: [3, 1.5],
      normal: "fore",
    });
    expect(buttonGesture([2.9, 1.4])).toEqual({ at: [3, 1.5], normal: "aft" });
    const r = ok(addLogicButton(wren(), [7.37, 0.4], "port", catalog), "snap");
    expect(r.doc.logic!.devices[0].at).toEqual([7.25, 0]);
  });

  it("refuses open floor, door openings and a second button on the same spot", () => {
    const doc = wren();
    expect(addLogicButton(doc, [5.5, 3], "port", catalog)).toEqual({
      doc,
      error: "Button is not on a wall (open floor)",
    });
    // The hold's airlock door to the hall, and the starboard hatch.
    expect(addLogicButton(doc, [6, 2], "port", catalog).error).toBe(
      "Button sits on a door opening",
    );
    expect(addLogicButton(doc, [6, 0], "starboard", catalog).error).toBe(
      "Button sits on a door opening",
    );
    expect(addLogicButton(doc, [30, 30], "port", catalog).error).toBe(
      "Button is not on the hull wall",
    );
    const one = ok(addLogicButton(doc, [7.5, 0], "port", catalog), "one");
    expect(addLogicButton(one.doc, [7.5, 0], "port", catalog).error).toBe(
      "Button btn is already here",
    );
  });

  it("moves along its wall, refuses a bad spot, and R flips it to the other side", () => {
    let doc = ok(addLogicButton(wren(), [7.5, 0], "port", catalog), "b").doc;
    doc = ok(
      moveLogicButton(doc, "btn", [4.25, 0], undefined, catalog),
      "m",
    ).doc;
    expect(doc.logic!.devices[0].at).toEqual([4.25, 0]);
    expect(moveLogicButton(doc, "btn", [6, 0], undefined, catalog).error).toBe(
      "Button sits on a door opening",
    );
    doc = ok(
      nudgeSelection(doc, { kind: "logic", id: "btn" }, 0.25, 0, catalog),
      "nudge",
    ).doc;
    expect(doc.logic!.devices[0].at).toEqual([4.5, 0]);
    // Outside at x 4.5 is the starboard wing, not open space.
    expect(
      rotateSelection(doc, { kind: "logic", id: "btn" }, catalog).error,
    ).toBe("Button faces another hull part (not open space)");
    doc = ok(
      moveLogicButton(doc, "btn", [7.5, 0], undefined, catalog),
      "back",
    ).doc;
    doc = ok(
      rotateSelection(doc, { kind: "logic", id: "btn" }, catalog),
      "R",
    ).doc;
    expect(doc.logic!.devices[0]).toMatchObject({
      at: [7.5, 0],
      normal: "starboard",
    });
  });
});

describe("door actuators and airlock controllers", () => {
  it("refuses unknown doors and a second actuator on one door", () => {
    const doc = wren();
    expect(addLogicDoor(doc, "nope", catalog).error).toBe(
      "No door nope on the deck",
    );
    const r = ok(addLogicDoor(doc, "d-hold", catalog), "door");
    expect(r.doc.logic!.devices[0]).toEqual({
      id: "door-d-hold",
      kind: "door",
      door: "d-hold",
    });
    expect(addLogicDoor(r.doc, "d-hold", catalog).error).toBe(
      "Door d-hold already has an actuator (door-d-hold)",
    );
    // Edge-mount openings are doors too.
    expect(addLogicDoor(r.doc, "airlock", catalog).error).toBeUndefined();
  });

  it("bounds the controller cycle to 1..30 s in 0.1 s steps", () => {
    const doc = wren();
    for (const bad of [0.5, 31, 2.05])
      expect(addAirlockController(doc, bad).error).toBe(
        "Cycle time is 1 to 30 s in 0.1 s steps",
      );
    const r = ok(addAirlockController(doc, 2.5), "ctl");
    expect(r.doc.logic!.devices[0]).toEqual({
      id: "airlock",
      kind: "airlock-controller",
      cycleS: 2.5,
    });
    expect(
      ok(addAirlockController(doc), "default").doc.logic!.devices[0],
    ).toEqual({ id: "airlock", kind: "airlock-controller" });
    const set = ok(setControllerCycle(r.doc, "airlock", 12.3), "set");
    expect(set.doc.logic!.devices[0].cycleS).toBe(12.3);
    expect(setControllerCycle(r.doc, "airlock", 40).error).toBeTruthy();
    expect(
      setControllerCycle(set.doc, "airlock", undefined).doc.logic!.devices[0],
    ).toEqual({ id: "airlock", kind: "airlock-controller" });
  });
});

describe("wires", () => {
  it("authors Wren's airlock with no logic issues", () => {
    const { doc } = authorAirlock();
    expect(doc.logic!.devices).toHaveLength(6);
    expect(doc.logic!.links).toHaveLength(10);
    expect(logicIssues(doc)).toEqual([]);
    expect(
      validateShipPrefab(doc, catalog).filter((i) => i.severity === "error"),
    ).toEqual([]);
    // Wire ids follow the prefab builders' derivation.
    expect(doc.logic!.links.map((l) => l.id)).toContain(
      "w.door-d-hold.state.airlock.inner-state",
    );
  });

  it("refuses a type mismatch, a wrong direction, a duplicate and a second driver", () => {
    const { doc, inside, ctl, inner, outer } = authorAirlock();
    const n = doc.logic!.links.length;
    const wire = (f: string, fp: string, t: string, tp: string) =>
      addLogicWire(doc, { device: f, port: fp }, { device: t, port: tp });
    expect(wire(inside, "pressed", inner, "command")).toEqual({
      doc,
      error: "pulse output cannot drive a door-command input",
    });
    expect(wire(inside, "light", ctl, "cycle").error).toBe(
      `${inside} has no output light`,
    );
    expect(wire(inside, "pressed", ctl, "cycle").error).toBe("Duplicate wire");
    expect(wire(outer, "state", ctl, "inner_state").error).toBe(
      `${ctl}.inner_state already has a driver (w.${inner}.state.${ctl}.inner-state)`,
    );
    expect(wire(ctl, "cycle", ctl, "cycle").error).toBe(
      `${ctl} has no output cycle`,
    );
    expect(wire("ghost", "pressed", ctl, "cycle").error).toBe(
      "No device ghost",
    );
    expect(doc.logic!.links).toHaveLength(n);
    // Pulse inputs take several drivers.
    const extra = ok(
      addLogicButton(doc, [4.5, 0], "port", catalog),
      "4th button",
    );
    const id = selId(extra);
    expect(
      addLogicWire(
        extra.doc,
        { device: id, port: "pressed" },
        { device: ctl, port: "cycle" },
      ).error,
    ).toBeUndefined();
  });

  it("deleting a device removes its wires; removing a wire leaves the devices", () => {
    const { doc, ctl, inside } = authorAirlock();
    const gone = removeSelection(doc, { kind: "logic", id: ctl });
    expect(gone.logic!.devices.map((d) => d.id)).not.toContain(ctl);
    expect(gone.logic!.links).toEqual([]);
    expect(selectionExists(gone, { kind: "logic", id: ctl })).toBe(false);
    const w = doc.logic!.links.find((l) => l.from.device === inside)!;
    const less = removeLogicWire(doc, w.id);
    expect(less.logic!.links).toHaveLength(doc.logic!.links.length - 1);
    expect(less.logic!.devices).toEqual(doc.logic!.devices);
    // Unwiring shows as a validation issue on the device.
    expect(logicIssues(less).map((i) => i.code)).toContain(
      "logic.button.unwired",
    );
  });

  it("renaming a device keeps its wires attached", () => {
    const { doc, ctl } = authorAirlock();
    const r = ok(
      renameElement(doc, { kind: "logic", id: ctl }, "lock"),
      "rename",
    );
    expect(r.select).toEqual({ kind: "logic", id: "lock" });
    const ends = r.doc.logic!.links.flatMap((l) => [
      l.from.device,
      l.to.device,
    ]);
    expect(ends).toContain("lock");
    expect(ends).not.toContain(ctl);
    expect(logicIssues(r.doc)).toEqual([]);
    expect(
      renameElement(r.doc, { kind: "logic", id: "lock" }, "btn").error,
    ).toBe("btn is already used by another logic device");
  });
});

describe("logic on the plan and in the issues list", () => {
  it("picks devices, focuses them and maps wire issues to a device", () => {
    const { doc, inside, ctl, inner } = authorAirlock();
    const geoms = geometriesOf(doc);
    const anchors = logicAnchors(
      doc,
      catalog,
      deriveInterior(doc, 0, catalog).doors,
      geoms,
    );
    // Controllers sit in the chamber both of their doors open into (the hold).
    expect(anchors.get(ctl)!.at).toEqual([5.5, 1]);
    expect(anchors.get(inner)!.at).toEqual([6, 2]);
    for (const [id, a] of anchors)
      expect(
        hitTest(
          doc,
          catalog,
          geoms,
          a.at,
          DEFAULT_LAYERS,
          0.05,
          undefined,
          anchors,
        ),
      ).toEqual({ kind: "logic", id });
    expect(
      hitTest(
        doc,
        catalog,
        geoms,
        anchors.get(inside)!.at,
        { ...DEFAULT_LAYERS, logic: false },
        0.05,
        undefined,
        anchors,
      )?.kind,
    ).not.toBe("logic");
    expect(
      selectionCentre(doc, catalog, geoms, { kind: "logic", id: ctl }),
    ).toEqual([5.5, 1]);
    const wireIssue: PrefabIssue = {
      severity: "error",
      code: "logic.link.type",
      message: "x",
      ref: { kind: "logic", id: doc.logic!.links[0].id },
    };
    expect(issueSelection(wireIssue, doc)).toEqual({ kind: "logic", id: ctl });
    const deviceIssue = logicIssues(
      removeSelection(doc, { kind: "logic", id: inner }),
    ).find((i) => i.code === "logic.airlock.incomplete")!;
    expect(issueSelection(deviceIssue, doc)).toEqual({
      kind: "logic",
      id: ctl,
    });
  });
});
