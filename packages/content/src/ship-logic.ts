/**
 * Ship logic (wiki `Systems/Ship Logic`): the authored side of the general signal system.
 *
 * A ship's logic is DATA in its prefab document (`logic`): devices with typed signal ports and the
 * wires (links) between ports. It is per ship (every instance embeds its document), editable in the
 * Shipyard prefab editor, and evaluated only by the server (`packages/sim/src/ship-logic.ts` rules,
 * `packages/world/src/ship-logic.ts` authority). Clients never evaluate or write signals.
 *
 * Signal ports build on the component catalogue's service ports: every signal travels over the
 * `data` channel (`dat-std` connectors). A device that actuates a catalogue component (an edge-mount
 * airlock hatch) is admitted only when that component has a `data` port.
 *
 * Signals are typed. `pulse` is a momentary event (a button press). Every other type is a
 * value from a closed set; a value input has at most one driver so evaluation is deterministic.
 *
 * This file is self-contained (no imports from `ship-prefab.ts`) so the prefab parser and validator
 * can use it without an import cycle.
 */

export const SHIP_LOGIC_SIGNALS = [
  "pulse",
  "door-command",
  "door-state",
  "airlock-state",
  "light",
] as const;
export type ShipLogicSignal = (typeof SHIP_LOGIC_SIGNALS)[number];

/** Closed value sets of the value signals (pulse carries no value). */
export const SHIP_LOGIC_VALUES = {
  "door-command": ["open", "close", "lock", "unlock", "toggle"],
  "door-state": ["open", "closed", "locked"],
  "airlock-state": ["pressurised", "depressurising", "vacuum", "pressurising"],
  light: ["off", "green", "amber", "red"],
} as const satisfies Record<Exclude<ShipLogicSignal, "pulse">, readonly string[]>;
export type DoorCommand = (typeof SHIP_LOGIC_VALUES)["door-command"][number];
export type DoorStateValue = (typeof SHIP_LOGIC_VALUES)["door-state"][number];
export type AirlockStateValue =
  (typeof SHIP_LOGIC_VALUES)["airlock-state"][number];
export type LightValue = (typeof SHIP_LOGIC_VALUES)["light"][number];

export const SHIP_LOGIC_DEVICE_KINDS = [
  "button",
  "door",
  "airlock-controller",
] as const;
export type ShipLogicDeviceKind = (typeof SHIP_LOGIC_DEVICE_KINDS)[number];

export interface ShipLogicPortSpec {
  id: string;
  direction: "in" | "out";
  signal: ShipLogicSignal;
  label: string;
}

export interface ShipLogicDeviceSpec {
  kind: ShipLogicDeviceKind;
  name: string;
  description: string;
  /**
   * wall: a placed panel on a wall line (`at` + `normal`); door: actuates one door of the deck
   * (`door` = edge id or edge-mount id); virtual: no geometry (a controller hosted on the ship's
   * data network).
   */
  placement: "wall" | "door" | "virtual";
  ports: readonly ShipLogicPortSpec[];
  /** Service channel and connector family the ports use (component catalogue vocabulary). */
  channel: "data";
  connectorFamily: "dat-std";
  /** Runtime art (wall devices), relative to the published runtime root. */
  art?: string;
}

const port = (
  id: string,
  direction: "in" | "out",
  signal: ShipLogicSignal,
  label: string,
): ShipLogicPortSpec => ({ id, direction, signal, label });

/** Device catalogue revision 1. New kinds (sensors, lights, turrets, scripts) extend this table. */
export const SHIP_LOGIC_CATALOG_REVISION = "ship-logic-v1@1";
export const SHIP_LOGIC_DEVICES: Readonly<
  Record<ShipLogicDeviceKind, ShipLogicDeviceSpec>
> = {
  button: {
    kind: "button",
    name: "Wall button",
    description:
      "Momentary push button on a wall or hull face, pressed with E within reach on its front side. Its status light shows the light input.",
    placement: "wall",
    ports: [
      port("pressed", "out", "pulse", "Pressed"),
      port("light", "in", "light", "Status light"),
    ],
    channel: "data",
    connectorFamily: "dat-std",
    art: "ship-logic/r001/logic.button.wall.glb",
  },
  door: {
    kind: "door",
    name: "Door actuator",
    description:
      "Opens, closes and locks one door. Never closes on a body: a close waits until the doorway is clear. Reports its state.",
    placement: "door",
    ports: [
      port("command", "in", "door-command", "Command"),
      port("state", "out", "door-state", "State"),
    ],
    channel: "data",
    connectorFamily: "dat-std",
  },
  "airlock-controller": {
    kind: "airlock-controller",
    name: "Airlock controller",
    description:
      "Interlocks an inner and an outer door (never both open) and runs a timed pressurisation cycle between them.",
    placement: "virtual",
    ports: [
      port("cycle", "in", "pulse", "Cycle"),
      port("open_inner", "in", "pulse", "Open inner"),
      port("open_outer", "in", "pulse", "Open outer"),
      port("inner_state", "in", "door-state", "Inner door state"),
      port("outer_state", "in", "door-state", "Outer door state"),
      port("inner", "out", "door-command", "Inner door"),
      port("outer", "out", "door-command", "Outer door"),
      port("state", "out", "airlock-state", "Chamber state"),
      port("light", "out", "light", "Status light"),
    ],
    channel: "data",
    connectorFamily: "dat-std",
  },
};

export const SHIP_LOGIC_LIMITS = {
  devices: 64,
  links: 128,
  /** Airlock controller cycle bounds (s). */
  cycleMinS: 1,
  cycleMaxS: 30,
  cycleDefaultS: 3,
} as const;

export function shipLogicPort(
  kind: ShipLogicDeviceKind,
  portId: string,
): ShipLogicPortSpec | undefined {
  return SHIP_LOGIC_DEVICES[kind]?.ports.find((p) => p.id === portId);
}

// ------------------------------------------------------------------ document data

export type LogicFacing = "fore" | "aft" | "port" | "starboard";

export interface PrefabLogicDevice {
  id: string;
  kind: ShipLogicDeviceKind;
  /** Wall devices: a point on a wall line, prefab plan metres on the 0.25 m grid. */
  at?: [number, number];
  /** Wall devices: the side the panel faces (the side it is pressed from). */
  normal?: LogicFacing;
  /** Door devices: the door edge id or edge-mount id this actuator drives. */
  door?: string;
  /** Airlock controllers: seconds of one pressurise or depressurise stage. */
  cycleS?: number;
}
export interface PrefabLogicEndpoint {
  device: string;
  port: string;
}
export interface PrefabLogicLink {
  id: string;
  from: PrefabLogicEndpoint;
  to: PrefabLogicEndpoint;
}
export interface PrefabLogic {
  devices: PrefabLogicDevice[];
  links: PrefabLogicLink[];
}

const LOGIC_ID = /^[a-z0-9][a-z0-9._-]{0,79}$/;
const PORT_ID = /^[a-z][a-z0-9_]{0,31}$/;
const FACINGS: readonly LogicFacing[] = ["fore", "aft", "port", "starboard"];

function fail(path: string, why: string): never {
  throw Error(`Invalid ship prefab ${path}: ${why}`);
}
function record(
  v: unknown,
  path: string,
  keys: readonly string[],
  optional: readonly string[] = [],
): Record<string, unknown> {
  if (!v || typeof v !== "object" || Array.isArray(v))
    fail(path, "expected an object");
  const o = v as Record<string, unknown>;
  for (const k of Object.keys(o))
    if (!keys.includes(k) && !optional.includes(k))
      fail(path, `unknown field ${k}`);
  for (const k of keys) if (!(k in o)) fail(path, `missing field ${k}`);
  return o;
}
function list(v: unknown, path: string, max: number): unknown[] {
  if (!Array.isArray(v) || v.length > max)
    fail(path, `expected an array of at most ${max}`);
  return v;
}
function text(v: unknown, path: string, re: RegExp): string {
  if (typeof v !== "string" || !re.test(v)) fail(path, "invalid text");
  return v;
}
function quarter(v: unknown, path: string): number {
  if (
    typeof v !== "number" ||
    !Number.isFinite(v) ||
    Math.abs(v) > 128 ||
    !Number.isInteger(v * 4)
  )
    fail(path, "expected a coordinate on the 0.25 m grid");
  return v;
}

/**
 * Strict structural admission of a document's `logic` (unknown fields rejected, bounded sizes,
 * known kinds). Wiring and placement rules are checked by `validateShipPrefab` (issues, not throws),
 * so the Shipyard can show them while editing.
 */
export function readPrefabLogic(value: unknown): PrefabLogic {
  const o = record(value, "logic", ["devices", "links"]);
  const devices = list(o.devices, "logic.devices", SHIP_LOGIC_LIMITS.devices).map(
    (v, i) => {
      const p = `logic.devices[${i}]`;
      const r = record(v, p, ["id", "kind"], ["at", "normal", "door", "cycleS"]);
      const kind = r.kind as ShipLogicDeviceKind;
      if (!SHIP_LOGIC_DEVICE_KINDS.includes(kind))
        fail(`${p}.kind`, `expected one of ${SHIP_LOGIC_DEVICE_KINDS.join(", ")}`);
      const d: PrefabLogicDevice = { id: text(r.id, `${p}.id`, LOGIC_ID), kind };
      const placement = SHIP_LOGIC_DEVICES[kind].placement;
      if (placement === "wall") {
        const at = list(r.at, `${p}.at`, 2);
        if (at.length !== 2) fail(`${p}.at`, "expected [x, y]");
        d.at = [quarter(at[0], `${p}.at[0]`), quarter(at[1], `${p}.at[1]`)];
        if (!FACINGS.includes(r.normal as LogicFacing))
          fail(`${p}.normal`, `expected one of ${FACINGS.join(", ")}`);
        d.normal = r.normal as LogicFacing;
      } else if (r.at !== undefined || r.normal !== undefined)
        fail(p, `${kind} devices take no at or normal`);
      if (placement === "door") d.door = text(r.door, `${p}.door`, LOGIC_ID);
      else if (r.door !== undefined) fail(p, `${kind} devices take no door`);
      if (kind === "airlock-controller") {
        if (r.cycleS !== undefined) {
          const s = r.cycleS;
          if (
            typeof s !== "number" ||
            !Number.isFinite(s) ||
            s < SHIP_LOGIC_LIMITS.cycleMinS ||
            s > SHIP_LOGIC_LIMITS.cycleMaxS ||
            !Number.isInteger(s * 10)
          )
            fail(
              `${p}.cycleS`,
              `expected ${SHIP_LOGIC_LIMITS.cycleMinS}..${SHIP_LOGIC_LIMITS.cycleMaxS} s in 0.1 s steps`,
            );
          d.cycleS = s;
        }
      } else if (r.cycleS !== undefined) fail(p, `${kind} devices take no cycleS`);
      return d;
    },
  );
  const endpoint = (v: unknown, p: string): PrefabLogicEndpoint => {
    const r = record(v, p, ["device", "port"]);
    return {
      device: text(r.device, `${p}.device`, LOGIC_ID),
      port: text(r.port, `${p}.port`, PORT_ID),
    };
  };
  const links = list(o.links, "logic.links", SHIP_LOGIC_LIMITS.links).map(
    (v, i) => {
      const p = `logic.links[${i}]`;
      const r = record(v, p, ["id", "from", "to"]);
      return {
        id: text(r.id, `${p}.id`, LOGIC_ID),
        from: endpoint(r.from, `${p}.from`),
        to: endpoint(r.to, `${p}.to`),
      };
    },
  );
  const seen = new Set<string>();
  for (const id of devices.map((d) => d.id)) {
    if (seen.has(id)) fail("logic.devices", `duplicate id ${id}`);
    seen.add(id);
  }
  seen.clear();
  for (const id of links.map((l) => l.id)) {
    if (seen.has(id)) fail("logic.links", `duplicate id ${id}`);
    seen.add(id);
  }
  return { devices, links };
}

export interface ShipLogicIssue {
  severity: "error" | "warning";
  code: string;
  message: string;
  /** Device or link id. */
  ref: { kind: "device" | "link"; id: string };
}

/**
 * Wiring rules that need no geometry: ports exist with the right direction, both ends carry the
 * same signal type, no duplicate wire, a value input has at most one driver, door actuators are
 * unique per door, and controllers are complete. Placement rules live in `validateShipPrefab`.
 */
export function validateLogicWiring(logic: PrefabLogic): ShipLogicIssue[] {
  const issues: ShipLogicIssue[] = [];
  const push = (
    severity: "error" | "warning",
    code: string,
    message: string,
    ref: ShipLogicIssue["ref"],
  ) => issues.push({ severity, code, message, ref });
  const byId = new Map(logic.devices.map((d) => [d.id, d]));
  const pairs = new Set<string>();
  const drivers = new Map<string, string>();
  for (const link of logic.links) {
    const ref = { kind: "link" as const, id: link.id };
    const from = byId.get(link.from.device);
    const to = byId.get(link.to.device);
    if (!from || !to) {
      push("error", "logic.link.device", "Wire ends at a missing device", ref);
      continue;
    }
    const out = shipLogicPort(from.kind, link.from.port);
    const inp = shipLogicPort(to.kind, link.to.port);
    if (!out || out.direction !== "out") {
      push(
        "error",
        "logic.link.from",
        `${from.id} has no output ${link.from.port}`,
        ref,
      );
      continue;
    }
    if (!inp || inp.direction !== "in") {
      push("error", "logic.link.to", `${to.id} has no input ${link.to.port}`, ref);
      continue;
    }
    if (out.signal !== inp.signal)
      push(
        "error",
        "logic.link.type",
        `${out.signal} output cannot drive a ${inp.signal} input`,
        ref,
      );
    if (link.from.device === link.to.device)
      push("error", "logic.link.self", "A device cannot wire to itself", ref);
    const key = `${link.from.device}.${link.from.port}>${link.to.device}.${link.to.port}`;
    if (pairs.has(key))
      push("error", "logic.link.duplicate", "Duplicate wire", ref);
    pairs.add(key);
    if (inp.signal !== "pulse") {
      const target = `${link.to.device}.${link.to.port}`;
      if (drivers.has(target))
        push(
          "error",
          "logic.link.drivers",
          `${target} already has a driver (${drivers.get(target)})`,
          ref,
        );
      else drivers.set(target, link.id);
    }
  }
  const doors = new Map<string, string>();
  for (const d of logic.devices) {
    const ref = { kind: "device" as const, id: d.id };
    if (d.kind === "door" && d.door) {
      if (doors.has(d.door))
        push(
          "error",
          "logic.door.duplicate",
          `Door ${d.door} already has an actuator (${doors.get(d.door)})`,
          ref,
        );
      doors.set(d.door, d.id);
    }
    if (d.kind === "airlock-controller") {
      const wired = (port: string, dir: "from" | "to") =>
        logic.links.some((l) => l[dir].device === d.id && l[dir].port === port);
      for (const [p, dir] of [
        ["inner", "from"],
        ["outer", "from"],
        ["inner_state", "to"],
        ["outer_state", "to"],
      ] as const)
        if (!wired(p, dir))
          push(
            "error",
            "logic.airlock.incomplete",
            `Airlock controller ${d.id} needs its ${p} wired to a door`,
            ref,
          );
    }
    if (d.kind === "button") {
      const used = logic.links.some(
        (l) => l.from.device === d.id && l.from.port === "pressed",
      );
      if (!used)
        push(
          "warning",
          "logic.button.unwired",
          `Button ${d.id} is not wired to anything`,
          ref,
        );
    }
  }
  return issues;
}
