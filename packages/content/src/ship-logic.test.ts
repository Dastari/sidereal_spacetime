import { describe, expect, it } from "vitest";
import { prefabById } from "./prefabs";
import { defaultPrefabComponentCatalog } from "./ship-prefab-catalog";
import {
  logicWallPlacement,
  readShipPrefab,
  validateShipPrefab,
  type ShipPrefabDocumentV1,
} from "./ship-prefab";
import { readPrefabLogic, validateLogicWiring, type PrefabLogic } from "./ship-logic";

const catalog = defaultPrefabComponentCatalog();
const wren = prefabById("fed.s.wren")!;
const withLogic = (logic: PrefabLogic): ShipPrefabDocumentV1 => ({ ...wren, logic });
const codes = (doc: ShipPrefabDocumentV1) =>
  validateShipPrefab(doc, catalog)
    .filter((i) => i.ref.kind === "logic")
    .map((i) => `${i.severity}:${i.code}:${(i.ref as { id: string }).id}`);

describe("ship logic document admission", () => {
  it("Wren r6 round-trips through the strict parser and validates clean", () => {
    const doc = readShipPrefab(JSON.parse(JSON.stringify(wren)));
    expect(doc.logic?.devices.map((d) => d.id)).toEqual([
      "lock",
      "door-inner",
      "door-outer",
      "btn-lock-in",
      "btn-lock-out",
      "btn-hall",
    ]);
    expect(validateShipPrefab(doc, catalog)).toEqual([]);
  });

  it("rejects unknown fields, unknown kinds, misplaced fields and off-grid points", () => {
    const base = JSON.parse(JSON.stringify(wren.logic));
    const bad = (mutate: (l: any) => void) => {
      const l = JSON.parse(JSON.stringify(base));
      mutate(l);
      return () => readPrefabLogic(l);
    };
    expect(bad((l) => (l.extra = 1))).toThrow("unknown field extra");
    expect(bad((l) => (l.devices[0].kind = "turret"))).toThrow("expected one of");
    expect(bad((l) => (l.devices[0].at = [1, 1]))).toThrow("take no at");
    expect(bad((l) => (l.devices[3].at = [7.3, 0]))).toThrow("0.25 m grid");
    expect(bad((l) => (l.devices[0].cycleS = 99))).toThrow("cycleS");
    expect(bad((l) => l.devices.push({ ...l.devices[0] }))).toThrow("duplicate id");
    expect(bad((l) => (l.links[0].from.port = "Bad Port"))).toThrow("invalid text");
  });
});

describe("wiring rules", () => {
  it("rejects type mismatches, wrong directions, missing devices, duplicates and double drivers", () => {
    const l = JSON.parse(JSON.stringify(wren.logic)) as PrefabLogic;
    l.links.push(
      { id: "x1", from: { device: "btn-hall", port: "pressed" }, to: { device: "door-inner", port: "command" } },
      { id: "x2", from: { device: "lock", port: "cycle" }, to: { device: "door-inner", port: "command" } },
      { id: "x3", from: { device: "ghost", port: "pressed" }, to: { device: "lock", port: "cycle" } },
      { id: "x4", from: { device: "lock", port: "light" }, to: { device: "btn-hall", port: "light" } },
      { id: "x5", from: { device: "door-outer", port: "state" }, to: { device: "lock", port: "inner_state" } },
    );
    const issues = validateLogicWiring(l).map((i) => `${i.code}:${i.ref.id}`);
    expect(issues).toContain("logic.link.type:x1");
    expect(issues).toContain("logic.link.from:x2");
    expect(issues).toContain("logic.link.device:x3");
    expect(issues).toContain("logic.link.duplicate:x4");
    expect(issues).toContain("logic.link.drivers:x5");
  });

  it("an airlock controller must be wired to both doors; unwired buttons warn", () => {
    const l: PrefabLogic = {
      devices: [
        { id: "ctl", kind: "airlock-controller" },
        { id: "b", kind: "button", at: [7.5, 0], normal: "port" },
      ],
      links: [],
    };
    const issues = validateLogicWiring(l).map((i) => `${i.severity}:${i.code}`);
    expect(issues.filter((i) => i === "error:logic.airlock.incomplete")).toHaveLength(4);
    expect(issues).toContain("warning:logic.button.unwired");
  });
});

describe("placement and door rules (geometry)", () => {
  it("places the Wren buttons inside the hold, outside on the hull and in the hall", () => {
    const at = (id: string) => {
      const d = wren.logic!.devices.find((x) => x.id === id)!;
      return logicWallPlacement(wren, d, catalog);
    };
    expect(at("btn-lock-in")).toMatchObject({ side: "interior", wall: "hull", room: "hold" });
    expect(at("btn-lock-out")).toMatchObject({ side: "exterior", wall: "hull", room: null });
    expect(at("btn-hall")).toMatchObject({ side: "interior", wall: "partition", room: "hall" });
  });

  it("rejects buttons on open floor, on a door, facing a wing or off a wall line", () => {
    const button = (at: [number, number], normal: "port" | "starboard" | "fore" | "aft") =>
      logicWallPlacement(wren, { at, normal }, catalog);
    expect(button([5, 1], "port")).toMatchObject({ error: expect.stringContaining("open floor") });
    expect(button([6, 0], "port")).toMatchObject({ error: expect.stringContaining("door") });
    expect(button([6, 2], "port")).toMatchObject({ error: expect.stringContaining("door") });
    expect(button([4, 0], "starboard")).toMatchObject({ error: expect.stringContaining("another hull part") });
    expect(button([4.5, 0.5], "port")).toMatchObject({ error: expect.stringContaining("wall line") });
  });

  it("flags unknown doors, a controller whose outer door is interior, and misplaced buttons", () => {
    const l = JSON.parse(JSON.stringify(wren.logic)) as PrefabLogic;
    l.devices.push({ id: "door-x", kind: "door", door: "nope" });
    l.devices.find((d) => d.id === "btn-hall")!.at = [5, 3];
    const swap = l.links.find((x) => x.from.device === "lock" && x.from.port === "outer")!;
    const innerLink = l.links.find((x) => x.from.device === "lock" && x.from.port === "inner")!;
    [swap.to.device, innerLink.to.device] = [innerLink.to.device, swap.to.device];
    const found = codes(withLogic(l));
    expect(found).toContain("error:logic.door.unknown:door-x");
    expect(found).toContain("error:logic.button.placement:btn-hall");
    expect(found).toContain("error:logic.airlock.outer:lock");
    expect(found).toContain("error:logic.airlock.inner:lock");
  });

  it("a door actuator on a component without a data port is refused", () => {
    const stub = {
      ...catalog,
      get: (id: string) => {
        const c = catalog.get(id);
        return c && id === "airlock.exterior.md" ? { ...c, dataPort: undefined } : c;
      },
    };
    const issues = validateShipPrefab(wren, stub).map((i) => i.code);
    expect(issues).toContain("logic.door.no-data-port");
  });
});
