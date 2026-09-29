/**
 * Ship logic evaluation (wiki `Systems/Ship Logic`): pure, deterministic and bounded.
 *
 * The authored graph (`logic` in the prefab document, `packages/content/src/ship-logic.ts`) is a set
 * of devices with typed ports and wires between ports. The server feeds one external EVENT at a
 * time (a button press, a due timer); the event's outputs propagate breadth-first along the wires
 * in wire-id order. Every step is bounded (scripting lifecycle contract: no unbounded loops):
 * at most `LOGIC_BUDGET.maxDeliveries` deliveries per event and `maxDepth` hops from the event.
 * A cyclic wiring cannot spin: the budget truncates it and the result says so.
 *
 * State is plain JSON per device (bounded by `stateBytes`). A device without a stored state is in
 * its INITIAL state (`initialLogicStates`: every controller initialised in id order, doors closed
 * unless a controller opened them), so a freshly spawned or upgraded ship needs no writes to exist.
 * Timers are absolute times (µs) the device asks to be woken at; the server stores and fires them.
 *
 * Nothing here reads or writes rows; `packages/world/src/ship-logic.ts` owns persistence and
 * authority (who may press, obstruction facts, timers).
 */
import {
  SHIP_LOGIC_DEVICES,
  SHIP_LOGIC_LIMITS,
  shipLogicPort,
  type AirlockStateValue,
  type DoorCommand,
  type DoorStateValue,
  type LightValue,
  type PrefabLogic,
  type ShipLogicDeviceKind,
} from "@sidereal/content/ship-logic";

export const LOGIC_BUDGET = {
  /** Wire deliveries per external event. */
  maxDeliveries: 64,
  /** Hops from the event's device. */
  maxDepth: 8,
  /** Serialised state per device (bytes). */
  stateBytes: 512,
  /** Timers fired per world tick (all ships). */
  timersPerTick: 256,
  /** Door close retry while the doorway is obstructed (µs). */
  doorRetryMicros: 200_000,
} as const;

export interface ButtonState {
  kind: "button";
  light: LightValue;
  /** Last accepted press (µs); presentation (a short press flash). */
  pressedMicros: number;
}
export interface DoorState {
  kind: "door";
  open: boolean;
  locked: boolean;
  /** A close (or lock) waits here while the doorway is obstructed; retried by timer. */
  pendingClose: boolean;
  /** Lock once the pending close completes. */
  pendingLock: boolean;
  retryMicros: number;
}
export interface AirlockControllerState {
  kind: "airlock-controller";
  phase: AirlockStateValue;
  /** End of the running (de)pressurisation stage (µs); 0 while waiting for both doors to seal. */
  endsMicros: number;
  /** Last reported door states. */
  inner: DoorStateValue;
  outer: DoorStateValue;
}
export type LogicDeviceState = ButtonState | DoorState | AirlockControllerState;

export interface LogicDeviceNode {
  id: string;
  kind: ShipLogicDeviceKind;
  /** Door devices: the door (edge or edge-mount id). */
  door?: string;
  /** Controllers: one stage length (µs). */
  cycleMicros: number;
}
export interface LogicGraph {
  devices: ReadonlyMap<string, LogicDeviceNode>;
  /** Outgoing wires by `device.port`, in wire-id order. */
  wires: ReadonlyMap<string, readonly { device: string; port: string }[]>;
}

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

const graphs = new WeakMap<PrefabLogic, LogicGraph>();
/** The evaluation graph of a document's logic (wires with a type or direction error are dropped). */
export function logicGraph(logic: PrefabLogic): LogicGraph {
  const hit = graphs.get(logic);
  if (hit) return hit;
  const devices = new Map<string, LogicDeviceNode>();
  for (const d of [...logic.devices].sort((a, b) => cmp(a.id, b.id)))
    devices.set(d.id, {
      id: d.id,
      kind: d.kind,
      ...(d.door ? { door: d.door } : {}),
      cycleMicros: Math.round(
        (d.cycleS ?? SHIP_LOGIC_LIMITS.cycleDefaultS) * 1e6,
      ),
    });
  const wires = new Map<string, { device: string; port: string }[]>();
  for (const link of [...logic.links].sort((a, b) => cmp(a.id, b.id))) {
    const from = devices.get(link.from.device),
      to = devices.get(link.to.device);
    if (!from || !to || from === to) continue;
    const out = shipLogicPort(from.kind, link.from.port),
      inp = shipLogicPort(to.kind, link.to.port);
    if (
      !out ||
      !inp ||
      out.direction !== "out" ||
      inp.direction !== "in" ||
      out.signal !== inp.signal
    )
      continue;
    const key = `${link.from.device}.${link.from.port}`;
    const list = wires.get(key) ?? [];
    list.push({ device: link.to.device, port: link.to.port });
    wires.set(key, list);
  }
  const graph = { devices, wires };
  graphs.set(logic, graph);
  return graph;
}

export function defaultDeviceState(kind: ShipLogicDeviceKind): LogicDeviceState {
  switch (kind) {
    case "button":
      return { kind, light: "off", pressedMicros: 0 };
    case "door":
      return {
        kind,
        open: false,
        locked: false,
        pendingClose: false,
        pendingLock: false,
        retryMicros: 0,
      };
    case "airlock-controller":
      return {
        kind,
        phase: "pressurised",
        endsMicros: 0,
        inner: "closed",
        outer: "closed",
      };
  }
}

/** The door output value of a door state. */
export const doorOutput = (s: DoorState): DoorStateValue =>
  s.open ? "open" : s.locked ? "locked" : "closed";
const sealed = (v: DoorStateValue) => v !== "open";

/** When the device wants to be woken (µs), or 0. */
export function logicTimerOf(state: LogicDeviceState): number {
  if (state.kind === "door") return state.pendingClose ? state.retryMicros : 0;
  if (state.kind === "airlock-controller") return state.endsMicros;
  return 0;
}

/** Parse a stored state, or undefined when it is not a valid state of `kind`. */
export function readLogicState(
  kind: ShipLogicDeviceKind,
  json: string,
): LogicDeviceState | undefined {
  if (json.length > LOGIC_BUDGET.stateBytes) return;
  try {
    const v = JSON.parse(json) as LogicDeviceState;
    if (!v || typeof v !== "object" || v.kind !== kind) return;
    const base = defaultDeviceState(kind) as unknown as Record<string, unknown>;
    for (const [k, d] of Object.entries(base))
      if (typeof (v as unknown as Record<string, unknown>)[k] !== typeof d)
        return;
    return v;
  } catch {
    return;
  }
}

export type LogicEvent =
  | { kind: "press"; device: string }
  | { kind: "timer"; device: string }
  | { kind: "init"; device: string };

export interface LogicEnv {
  /** Event time (µs since the epoch). */
  now: number;
  /** A body stands in the doorway of this door device (a close must wait). */
  obstructed(doorDeviceId: string): boolean;
}

export interface LogicResult {
  /** Final state of every device the event touched, by device id. */
  states: Map<string, LogicDeviceState>;
  deliveries: number;
  /** The budget cut propagation short (depth or delivery count). */
  truncated: boolean;
  /** Bounded human-readable trace (tests, debugging). */
  trace: string[];
}

type Emit = { port: string; value?: string };
type Input =
  | { kind: "signal"; port: string; value?: string }
  | { kind: "press" }
  | { kind: "timer" }
  | { kind: "init" };

function handleButton(s: ButtonState, input: Input, env: LogicEnv) {
  const emits: Emit[] = [];
  if (input.kind === "press") {
    s.pressedMicros = env.now;
    emits.push({ port: "pressed" });
  } else if (input.kind === "signal" && input.port === "light")
    s.light = (input.value as LightValue) ?? "off";
  return emits;
}

function handleDoor(
  node: LogicDeviceNode,
  s: DoorState,
  input: Input,
  env: LogicEnv,
) {
  const before = doorOutput(s);
  const tryClose = (lock: boolean) => {
    if (!s.open) {
      if (lock) s.locked = true;
      s.pendingClose = false;
      s.pendingLock = false;
      return;
    }
    if (env.obstructed(node.id)) {
      // Doors never close on a body: hold open and retry.
      s.pendingClose = true;
      s.pendingLock = s.pendingLock || lock;
      s.retryMicros = env.now + LOGIC_BUDGET.doorRetryMicros;
      return;
    }
    s.open = false;
    if (lock || s.pendingLock) s.locked = true;
    s.pendingClose = false;
    s.pendingLock = false;
    s.retryMicros = 0;
  };
  if (input.kind === "signal" && input.port === "command") {
    const c = input.value as DoorCommand;
    if (c === "open" || (c === "toggle" && !s.open)) {
      if (!s.locked) {
        s.open = true;
        s.pendingClose = false;
        s.pendingLock = false;
        s.retryMicros = 0;
      }
    } else if (c === "close" || c === "toggle") tryClose(false);
    else if (c === "lock") tryClose(true);
    else if (c === "unlock") s.locked = false;
    // Always report after a command: controllers use the report to advance.
    return [{ port: "state", value: doorOutput(s) }];
  }
  if (input.kind === "timer" && s.pendingClose) tryClose(s.pendingLock);
  if (input.kind === "init") return [{ port: "state", value: doorOutput(s) }];
  return doorOutput(s) !== before
    ? [{ port: "state", value: doorOutput(s) }]
    : [];
}

const LIGHT: Record<AirlockStateValue, LightValue> = {
  pressurised: "green",
  depressurising: "amber",
  pressurising: "amber",
  vacuum: "red",
};

function handleAirlock(
  node: LogicDeviceNode,
  s: AirlockControllerState,
  input: Input,
  env: LogicEnv,
) {
  const emits: Emit[] = [];
  const report = () => {
    emits.push({ port: "state", value: s.phase });
    emits.push({ port: "light", value: LIGHT[s.phase] });
  };
  const begin = (phase: "depressurising" | "pressurising") => {
    s.phase = phase;
    s.endsMicros = 0;
    // Interlock: both doors seal before the stage timer starts.
    emits.push({ port: "inner", value: "close" });
    emits.push({ port: "outer", value: "close" });
    report();
  };
  /** Start the stage timer once both doors report sealed. */
  const arm = () => {
    if (
      (s.phase === "depressurising" || s.phase === "pressurising") &&
      !s.endsMicros &&
      sealed(s.inner) &&
      sealed(s.outer)
    )
      s.endsMicros = env.now + node.cycleMicros;
  };
  switch (input.kind) {
    case "init":
      s.phase = "pressurised";
      s.endsMicros = 0;
      emits.push({ port: "outer", value: "close" });
      emits.push({ port: "inner", value: "open" });
      report();
      break;
    case "press":
      break;
    case "timer":
      if (s.endsMicros && env.now >= s.endsMicros) {
        s.endsMicros = 0;
        if (s.phase === "depressurising") {
          s.phase = "vacuum";
          // Interlock: open the outer door only while the inner reports sealed.
          if (sealed(s.inner)) emits.push({ port: "outer", value: "open" });
          report();
        } else if (s.phase === "pressurising") {
          s.phase = "pressurised";
          if (sealed(s.outer)) emits.push({ port: "inner", value: "open" });
          report();
        }
      }
      break;
    case "signal":
      if (input.port === "inner_state" || input.port === "outer_state") {
        const v = (input.value as DoorStateValue) ?? "closed";
        if (input.port === "inner_state") s.inner = v;
        else s.outer = v;
        arm();
      } else if (input.port === "cycle") {
        if (s.phase === "pressurised") begin("depressurising");
        else if (s.phase === "vacuum") begin("pressurising");
      } else if (input.port === "open_outer") {
        if (s.phase === "pressurised") begin("depressurising");
        else if (s.phase === "vacuum" && sealed(s.inner))
          emits.push({ port: "outer", value: "open" });
      } else if (input.port === "open_inner") {
        if (s.phase === "vacuum") begin("pressurising");
        else if (s.phase === "pressurised" && sealed(s.outer))
          emits.push({ port: "inner", value: "open" });
      }
      break;
  }
  return emits;
}

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

/**
 * Evaluate one external event. `read` returns a device's current state (stored or initial); the
 * result holds the final state of every touched device. Deterministic for equal inputs.
 */
export function evaluateLogic(
  graph: LogicGraph,
  read: (deviceId: string) => LogicDeviceState,
  event: LogicEvent,
  env: LogicEnv,
  budget: { maxDeliveries: number; maxDepth: number } = LOGIC_BUDGET,
): LogicResult {
  const states = new Map<string, LogicDeviceState>();
  const trace: string[] = [];
  const stateOf = (id: string) => {
    let s = states.get(id);
    if (!s) {
      s = clone(read(id));
      states.set(id, s);
    }
    return s;
  };
  const note = (t: string) => {
    if (trace.length < 128) trace.push(t);
  };
  let deliveries = 0;
  let truncated = false;
  const run = (id: string, input: Input): Emit[] => {
    const node = graph.devices.get(id);
    if (!node) return [];
    const s = stateOf(id);
    if (s.kind !== node.kind) return [];
    if (s.kind === "button") return handleButton(s, input, env);
    if (s.kind === "door") return handleDoor(node, s, input, env);
    return handleAirlock(node, s, input, env);
  };
  const queue: { device: string; emits: Emit[]; depth: number }[] = [];
  const first = graph.devices.get(event.device);
  if (!first)
    return { states, deliveries: 0, truncated: false, trace: ["unknown device"] };
  note(`${event.kind} ${event.device}`);
  queue.push({
    device: event.device,
    emits: run(event.device, { kind: event.kind }),
    depth: 0,
  });
  // Breadth-first: each device's emits in order, each emit to its wires in wire-id order.
  for (let head = 0; head < queue.length; head++) {
    const { device, emits, depth } = queue[head];
    for (const emit of emits) {
      const targets = graph.wires.get(`${device}.${emit.port}`) ?? [];
      for (const t of targets) {
        if (depth + 1 > budget.maxDepth || deliveries >= budget.maxDeliveries) {
          truncated = true;
          note(`budget: dropped ${device}.${emit.port} -> ${t.device}.${t.port}`);
          continue;
        }
        deliveries++;
        note(
          `${device}.${emit.port}${emit.value ? "=" + emit.value : ""} -> ${t.device}.${t.port}`,
        );
        queue.push({
          device: t.device,
          emits: run(t.device, {
            kind: "signal",
            port: t.port,
            value: emit.value,
          }),
          depth: depth + 1,
        });
      }
    }
  }
  return { states, deliveries, truncated, trace };
}

const initials = new WeakMap<LogicGraph, Map<string, LogicDeviceState>>();
/**
 * The initial state of every device: defaults, then each airlock controller's init event in id
 * order (doors unobstructed). Cached per graph; callers must not mutate the returned states.
 */
export function initialLogicStates(
  graph: LogicGraph,
): ReadonlyMap<string, LogicDeviceState> {
  const hit = initials.get(graph);
  if (hit) return hit;
  const states = new Map<string, LogicDeviceState>();
  for (const node of graph.devices.values())
    states.set(node.id, defaultDeviceState(node.kind));
  for (const node of graph.devices.values()) {
    if (node.kind !== "airlock-controller") continue;
    const r = evaluateLogic(
      graph,
      (id) => states.get(id)!,
      { kind: "init", device: node.id },
      { now: 0, obstructed: () => false },
    );
    for (const [id, s] of r.states) states.set(id, s);
  }
  // Initial states carry no timers.
  for (const s of states.values()) {
    if (s.kind === "airlock-controller") s.endsMicros = 0;
    if (s.kind === "door") {
      s.pendingClose = false;
      s.retryMicros = 0;
    }
  }
  initials.set(graph, states);
  return states;
}

/** Devices of a kind in id order (bounded by the document limits). */
export function logicDevicesOf(graph: LogicGraph, kind: ShipLogicDeviceKind) {
  return [...graph.devices.values()].filter((d) => d.kind === kind);
}

/** The door device that actuates `doorId`, if any. */
export function doorDeviceFor(graph: LogicGraph, doorId: string) {
  for (const d of graph.devices.values())
    if (d.kind === "door" && d.door === doorId) return d;
  return undefined;
}

export { SHIP_LOGIC_DEVICES };
