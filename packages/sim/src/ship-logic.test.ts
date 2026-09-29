import { describe, expect, it } from "vitest";
import { prefabById } from "@sidereal/content/prefabs";
import type { PrefabLogic } from "@sidereal/content/ship-logic";
import {
  evaluateLogic,
  initialLogicStates,
  logicGraph,
  logicTimerOf,
  readLogicState,
  type LogicDeviceState,
  type LogicEvent,
} from "./ship-logic";

const wren = prefabById("fed.s.wren")!;

/** A tiny authority: stored states + timers, driven like the world adapter drives it. */
function harness(logic: PrefabLogic) {
  const graph = logicGraph(logic);
  const stored = new Map<string, LogicDeviceState>();
  const obstructed = new Set<string>();
  const read = (id: string) =>
    stored.get(id) ?? initialLogicStates(graph).get(id)!;
  const fire = (event: LogicEvent, now: number) => {
    const r = evaluateLogic(graph, read, event, {
      now,
      obstructed: (id) => obstructed.has(id),
    });
    for (const [id, s] of r.states) stored.set(id, s);
    return r;
  };
  const runTimers = (now: number) => {
    for (const id of [...graph.devices.keys()]) {
      const due = logicTimerOf(read(id));
      if (due && due <= now) fire({ kind: "timer", device: id }, now);
    }
  };
  const door = (id: string) => {
    const s = read(id);
    if (s.kind !== "door") throw Error("not a door");
    return s;
  };
  const phase = () => {
    const s = read("lock");
    if (s.kind !== "airlock-controller") throw Error("not a controller");
    return s.phase;
  };
  const light = (id: string) => {
    const s = read(id);
    if (s.kind !== "button") throw Error("not a button");
    return s.light;
  };
  return { graph, read, fire, runTimers, door, phase, light, obstructed };
}

describe("ship logic (Wren r6 airlock)", () => {
  it("starts pressurised: inner open, outer closed, lights green", () => {
    const h = harness(wren.logic!);
    expect(h.phase()).toBe("pressurised");
    expect(h.door("door-inner").open).toBe(true);
    expect(h.door("door-outer").open).toBe(false);
    expect(h.light("btn-lock-in")).toBe("green");
    expect(h.light("btn-lock-out")).toBe("green");
  });

  it("inside button: seals, cycles about 3 s, then opens the outer door", () => {
    const h = harness(wren.logic!);
    const t0 = 1_000_000;
    const r = h.fire({ kind: "press", device: "btn-lock-in" }, t0);
    expect(r.truncated).toBe(false);
    expect(h.phase()).toBe("depressurising");
    expect(h.door("door-inner").open).toBe(false);
    expect(h.door("door-outer").open).toBe(false);
    expect(h.light("btn-lock-in")).toBe("amber");
    h.runTimers(t0 + 2_900_000);
    expect(h.door("door-outer").open).toBe(false);
    h.runTimers(t0 + 3_000_000);
    expect(h.phase()).toBe("vacuum");
    expect(h.door("door-outer").open).toBe(true);
    expect(h.door("door-inner").open).toBe(false);
    expect(h.light("btn-lock-out")).toBe("red");
  });

  it("outside button cycles too: a spacewalker seals the ship behind them and calls the lock back", () => {
    const h = harness(wren.logic!);
    h.fire({ kind: "press", device: "btn-lock-out" }, 0);
    h.runTimers(3_000_000);
    expect(h.door("door-outer").open).toBe(true);
    // Outside, press again: the outer door seals and the chamber pressurises (inner opens).
    h.fire({ kind: "press", device: "btn-lock-out" }, 3_500_000);
    expect(h.phase()).toBe("pressurising");
    expect(h.door("door-outer").open).toBe(false);
    h.runTimers(6_500_000);
    expect(h.phase()).toBe("pressurised");
    expect(h.door("door-inner").open).toBe(true);
    // A press during a running stage is ignored (no reversal mid-cycle).
    h.fire({ kind: "press", device: "btn-lock-out" }, 7_000_000);
    h.fire({ kind: "press", device: "btn-lock-in" }, 7_100_000);
    expect(h.phase()).toBe("depressurising");
    h.runTimers(10_000_000);
    expect(h.phase()).toBe("vacuum");
  });

  it("hall button opens the inner side from vacuum", () => {
    const h = harness(wren.logic!);
    h.fire({ kind: "press", device: "btn-lock-in" }, 0);
    h.runTimers(3_000_000);
    h.fire({ kind: "press", device: "btn-hall" }, 3_100_000);
    h.runTimers(6_100_000);
    expect(h.door("door-inner").open).toBe(true);
    expect(h.door("door-outer").open).toBe(false);
  });

  it("never closes a door on a body: the cycle waits for the doorway to clear", () => {
    const h = harness(wren.logic!);
    h.obstructed.add("door-inner");
    h.fire({ kind: "press", device: "btn-lock-in" }, 0);
    expect(h.door("door-inner").open).toBe(true);
    expect(h.door("door-inner").pendingClose).toBe(true);
    h.runTimers(5_000_000);
    // Still blocked: no stage timer ran, the outer door never opened.
    expect(h.phase()).toBe("depressurising");
    expect(h.door("door-outer").open).toBe(false);
    h.obstructed.delete("door-inner");
    h.runTimers(5_200_000);
    expect(h.door("door-inner").open).toBe(false);
    h.runTimers(8_200_000);
    expect(h.door("door-outer").open).toBe(true);
  });

  it("interlock: random presses, obstructions and timers never open both doors", () => {
    const h = harness(wren.logic!);
    let seed = 12345;
    const rand = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
    const buttons = ["btn-lock-in", "btn-lock-out", "btn-hall"];
    let now = 0;
    for (let i = 0; i < 2000; i++) {
      now += Math.floor(rand() * 900_000);
      const r = rand();
      if (r < 0.3)
        h.fire(
          { kind: "press", device: buttons[Math.floor(rand() * 3)] },
          now,
        );
      else if (r < 0.4) {
        const d = rand() < 0.5 ? "door-inner" : "door-outer";
        if (h.obstructed.has(d)) h.obstructed.delete(d);
        else h.obstructed.add(d);
      }
      h.runTimers(now);
      expect(
        h.door("door-inner").open && h.door("door-outer").open,
      ).toBe(false);
    }
  });

  it("is deterministic: the same event on the same states gives the same result", () => {
    const g = logicGraph(wren.logic!);
    const read = (id: string) => initialLogicStates(g).get(id)!;
    const env = { now: 42, obstructed: () => false };
    const a = evaluateLogic(g, read, { kind: "press", device: "btn-lock-in" }, env);
    const b = evaluateLogic(g, read, { kind: "press", device: "btn-lock-in" }, env);
    expect([...a.states]).toEqual([...b.states]);
    expect(a.trace).toEqual(b.trace);
    // Evaluation never mutates the initial states it read.
    expect(initialLogicStates(g).get("door-inner")).toMatchObject({ open: true });
  });

  it("bounds a cyclic wiring: propagation stops at the budget", () => {
    // Two door actuators whose states drive two controllers that drive them back.
    const logic: PrefabLogic = {
      devices: [
        { id: "a", kind: "airlock-controller" },
        { id: "b", kind: "airlock-controller" },
        { id: "d1", kind: "door", door: "x" },
        { id: "d2", kind: "door", door: "y" },
        { id: "k", kind: "button", at: [0, 0], normal: "fore" },
      ],
      links: [
        { id: "1", from: { device: "a", port: "inner" }, to: { device: "d1", port: "command" } },
        { id: "2", from: { device: "d1", port: "state" }, to: { device: "b", port: "inner_state" } },
        { id: "3", from: { device: "b", port: "inner" }, to: { device: "d2", port: "command" } },
        { id: "4", from: { device: "d2", port: "state" }, to: { device: "a", port: "inner_state" } },
        { id: "5", from: { device: "k", port: "pressed" }, to: { device: "a", port: "cycle" } },
        { id: "6", from: { device: "k", port: "pressed" }, to: { device: "b", port: "cycle" } },
      ],
    };
    const g = logicGraph(logic);
    const r = evaluateLogic(
      g,
      (id) => initialLogicStates(g).get(id)!,
      { kind: "press", device: "k" },
      { now: 0, obstructed: () => false },
      { maxDeliveries: 5, maxDepth: 8 },
    );
    expect(r.deliveries).toBeLessThanOrEqual(5);
    expect(r.truncated).toBe(true);
  });

  it("drops wires with a signal type or direction error", () => {
    const g = logicGraph({
      devices: [
        { id: "k", kind: "button", at: [0, 0], normal: "fore" },
        { id: "d", kind: "door", door: "x" },
      ],
      links: [
        // pulse -> door-command: type mismatch
        { id: "1", from: { device: "k", port: "pressed" }, to: { device: "d", port: "command" } },
      ],
    });
    expect(g.wires.size).toBe(0);
  });

  it("rejects a stored state of another kind or with bad fields", () => {
    expect(readLogicState("door", '{"kind":"button"}')).toBeUndefined();
    expect(readLogicState("door", '{"kind":"door","open":"yes"}')).toBeUndefined();
    expect(readLogicState("door", "x".repeat(600))).toBeUndefined();
    const s = JSON.stringify(initialLogicStates(logicGraph(wren.logic!)).get("door-inner"));
    expect(readLogicState("door", s)).toMatchObject({ kind: "door", open: true });
  });
});
