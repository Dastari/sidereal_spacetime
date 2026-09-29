/**
 * EVA and ship-logic presentation and input for the game client (wiki `Systems/EVA`,
 * `Systems/Ship Logic`). Pure: reads the own EVA view, `visible_ship_logic` and the own ship pose,
 * returns what the renderer and the HUD need, and maps keys to the ordinary `set_intent` row. The
 * server owns every position, door and button state; nothing here is authority.
 *
 * Same-plane model: a spacewalker in the loaded ship's frame (`local`) is drawn on the deck plane
 * next to the ship in the ordinary deck view; far away (`free`) the top-down space view follows it.
 */
import {
  EVA,
  pointVelocity,
  prefabEvaModel,
  rotate,
  worldToShip,
  wrapAngle,
  type EvaShipModel,
  type ShipPose,
} from "@sidereal/sim/eva";
import {
  reachablePanel,
  shipLogicModel,
  type ShipLogicModel,
} from "@sidereal/sim/ship-logic-model";
import { readShipPrefab } from "@sidereal/content/ship-prefab";
import { evaSuitCheck, evaSuitMessage } from "@sidereal/content/crew-wardrobe";
import { evaExitThrough } from "@sidereal/sim/eva";
import { prefabComponentCatalogFor } from "@sidereal/sim/prefab-catalog";
import type { CrewAppearance } from "@sidereal/render/crew/appearance";

export interface EvaBodyRow {
  characterId: string;
  phase: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  heading: number;
  anchorShipId: string;
  localX: number;
  localY: number;
  localHeading: number;
  forward: number;
  strafe: number;
  turn: number;
  walking: boolean;
  exitShipId: string;
  visitId: string;
  deckId: string;
  returnEndsMicros: bigint;
  stranded: boolean;
}
export interface VisibleEvaRow {
  characterId: string;
  name: string;
  phase: string;
  x: number;
  y: number;
  heading: number;
  anchorShipId: string;
  localX: number;
  localY: number;
  localHeading: number;
  forward: number;
  strafe: number;
  turn: number;
  walking: boolean;
  cycling: boolean;
  dead: boolean;
  connected: boolean;
  appearanceJson: string;
  equipmentJson: string;
  aimActive: boolean;
  aimAngle: number;
  shotSequence: bigint;
  shotX: number;
  shotY: number;
  shotStruck: boolean;
}
export interface ShipLogicRow {
  shipId: string;
  deviceId: string;
  kind: string;
  state: string;
  light: string;
  open: boolean;
  endsMicros: bigint;
  pressedMicros: bigint;
}

interface PrefabModels {
  eva: EvaShipModel;
  logic: ShipLogicModel | null;
}
const models = new Map<string, PrefabModels | null>();
function modelsOfDocument(documentJson: string | undefined) {
  if (!documentJson) return null;
  if (models.has(documentJson)) return models.get(documentJson)!;
  if (models.size > 8) models.clear();
  let out: PrefabModels | null = null;
  try {
    const binding = (
      JSON.parse(documentJson) as {
        prefab?: { document?: unknown; catalog?: unknown };
      }
    ).prefab;
    if (binding && typeof binding === "object") {
      const doc = readShipPrefab(binding.document);
      const catalog = prefabComponentCatalogFor(String(binding.catalog));
      out = {
        eva: prefabEvaModel(doc, catalog),
        logic: shipLogicModel(doc, catalog),
      };
    }
  } catch {
    out = null;
  }
  models.set(documentJson, out);
  return out;
}
/** EVA geometry of a construction instance document (prefab ships only), cached per document. */
export const evaModelOfDocument = (documentJson: string | undefined) =>
  modelsOfDocument(documentJson)?.eva ?? null;
/** Ship logic geometry (panels, doors) of a construction instance document, or null. */
export const logicModelOfDocument = (documentJson: string | undefined) =>
  modelsOfDocument(documentJson)?.logic ?? null;

/** Deck floor top above the ship datum (m): the walking elevation. */
const DECK_FLOOR_M = 0.1875;

export interface EvaScene {
  /** Render clip family: floating (zero-g). `maglocked` is reserved for mag boots aboard. */
  phase: "free" | "maglocked";
  /** In the loaded ship's frame (same plane): drawn in the deck view like a crewmate. */
  local: boolean;
  /** Own-ship-local position and heading (ship convention). */
  localX: number;
  localY: number;
  localHeading: number;
  elevation: number;
  forward: number;
  strafe: number;
  turn: number;
  walking: boolean;
  cycling: boolean;
}

/**
 * A body in the loaded ship's frame: a body in that ship's frame uses its accepted local point;
 * any other body is the world pose transformed by the accepted ship pose (both rows come from the
 * same server tick, so the relative pose is consistent while the ship moves). Same plane: the body
 * floats just above deck height.
 */
export function evaScene(
  body: Pick<
    EvaBodyRow,
    | "phase"
    | "x"
    | "y"
    | "heading"
    | "anchorShipId"
    | "localX"
    | "localY"
    | "localHeading"
    | "forward"
    | "strafe"
    | "turn"
    | "walking"
  >,
  ship: ShipPose & { id: string },
): EvaScene {
  const local =
    (body.phase === "local" || body.phase === "maglocked") &&
    body.anchorShipId === ship.id;
  const p = local
    ? ([body.localX, body.localY] as [number, number])
    : worldToShip(ship, [body.x, body.y]);
  return {
    phase: "free",
    local,
    localX: p[0],
    localY: p[1],
    localHeading: local
      ? body.localHeading
      : wrapAngle(body.heading - ship.heading),
    elevation: DECK_FLOOR_M + EVA.floatElevationM,
    forward: body.forward,
    strafe: 0,
    turn: 0,
    walking: false,
    cycling: false,
  };
}

/** The aboard location the owner keeps while outside (the server's read-only home location). */
export function evaHomeVisit(
  body: EvaBodyRow | undefined,
  actor: { id: string; shipId: string } | undefined,
) {
  if (!body || !actor || !body.visitId || body.exitShipId !== actor.shipId)
    return undefined;
  return {
    characterId: actor.id,
    visitId: body.visitId,
    instanceId: actor.shipId,
    deckId: body.deckId,
    revision: 0n,
    standingElevationM: DECK_FLOOR_M,
  };
}

export type EvaAction =
  | { kind: "button"; shipId: string; deviceId: string; label: string }
  | undefined;

const BUTTON_LABELS: Record<string, string> = {
  cycle: "Cycle airlock",
  open_outer: "Open airlock (outer door)",
  open_inner: "Open airlock (inner door)",
};

/**
 * What E does at a wall button: the nearest panel on the right side within reach (from the deck:
 * interior panels; from space in the ship's frame: exterior panels). The server rechecks all of it.
 */
export function logicButtonAction(input: {
  shipId: string | undefined;
  logic: ShipLogicModel | null;
  aboard?: readonly [number, number];
  outside?: readonly [number, number];
}): EvaAction {
  const { shipId, logic } = input;
  if (!shipId || !logic) return;
  const at = input.aboard ?? input.outside;
  if (!at) return;
  const panel = reachablePanel(logic, at, input.aboard ? "interior" : "exterior");
  if (!panel) return;
  const port = logic.graph.wires.get(`${panel.deviceId}.pressed`)?.[0]?.port;
  return {
    kind: "button",
    shipId,
    deviceId: panel.deviceId,
    label: (port && BUTTON_LABELS[port]) || "Press button",
  };
}

/** Door id → open, for the loaded ship's logic-actuated doors (renderer door leaves). */
export function logicDoorStates(
  rows: Iterable<ShipLogicRow>,
  shipId: string | undefined,
  logic: ShipLogicModel | null,
): Map<string, boolean> {
  const out = new Map<string, boolean>();
  if (!shipId || !logic) return out;
  const byDevice = new Map<string, ShipLogicRow>();
  for (const r of rows) if (r.shipId === shipId) byDevice.set(r.deviceId, r);
  for (const d of logic.doors) {
    const row = byDevice.get(d.deviceId);
    out.set(d.doorId, !!row?.open);
  }
  return out;
}
/** Button device id → status light, for the loaded ship (renderer panels). */
export function logicPanelLights(
  rows: Iterable<ShipLogicRow>,
  shipId: string | undefined,
): Map<string, { light: string; pressedMicros: number }> {
  const out = new Map<string, { light: string; pressedMicros: number }>();
  if (!shipId) return out;
  for (const r of rows)
    if (r.shipId === shipId && r.kind === "button")
      out.set(r.deviceId, {
        light: r.light,
        pressedMicros: Number(r.pressedMicros),
      });
  return out;
}

const pressed = (keys: ReadonlySet<string>, code: string) =>
  Number(keys.has(code));

/**
 * Keys to the ordinary input row while outside: WASD is the jetpack thrust direction, screen
 * relative. `screenToFrame` maps it into the body's frame: the deck camera's ship-local mapping
 * while in the ship's frame, the north-up world mapping while free.
 */
export function evaIntent(
  keys: ReadonlySet<string>,
  active: boolean,
  blocked: boolean,
  screenToFrame: (h: number, v: number) => { dx: number; dy: number },
) {
  const none = { throttle: 0, turn: 0, dx: 0, dy: 0, sprint: false };
  if (blocked || !active) return none;
  const vertical = pressed(keys, "KeyW") - pressed(keys, "KeyS");
  const horizontal = pressed(keys, "KeyD") - pressed(keys, "KeyA");
  if (!vertical && !horizontal) return none;
  const d = screenToFrame(horizontal, vertical);
  return { ...none, dx: d.dx, dy: d.dy };
}

/**
 * Facing target of the suit IFCS from the pointer's aim angle (combat convention, own-ship frame:
 * 0 = +Y, clockwise): a heading in the body's frame (ship-local while riding along, world while
 * free).
 */
export function evaFacingFromAim(
  aimLocal: number,
  local: boolean,
  shipHeading: number,
): number {
  return wrapAngle(local ? -aimLocal : shipHeading - aimLocal);
}

/**
 * Jetpack intent from the keys, relative to a facing (any direction is reachable by pointing, not
 * only eight). Stabilised: `facing` is the pointer; W/S toward/away from it, A/D strafe. Free
 * (Newtonian): `facing` is the body's current heading; W/S along it, A/D yaw torque, Shift+A/D
 * strafe. Returns the frame direction and the yaw command.
 */
export function evaThrustFromKeys(
  keys: ReadonlySet<string>,
  facing: number,
  blocked: boolean,
  free = false,
) {
  const none = { throttle: 0, turn: 0, dx: 0, dy: 0, sprint: false };
  if (blocked) return none;
  const forward = pressed(keys, "KeyW") - pressed(keys, "KeyS");
  const side = pressed(keys, "KeyD") - pressed(keys, "KeyA");
  const shift = keys.has("ShiftLeft") || keys.has("ShiftRight");
  const turn = free && !shift ? -side : 0;
  const strafe = free && !shift ? 0 : side;
  if (!forward && !strafe) return { ...none, turn };
  const len = Math.hypot(forward, strafe);
  const f = [-Math.sin(facing), Math.cos(facing)],
    r = [Math.cos(facing), Math.sin(facing)];
  return {
    ...none,
    turn,
    dx: (f[0] * forward + r[0] * strafe) / len,
    dy: (f[1] * forward + r[1] * strafe) / len,
  };
}

/** The suit rule on the client (the server checks the same): refusal message, or "". */
export function evaSuitRefusalOf(
  items: Iterable<{ equipmentSlot: string; definitionId: string }>,
): string {
  const equipped = [];
  for (const i of items)
    if (i.equipmentSlot)
      equipped.push({ slot: i.equipmentSlot, id: i.definitionId });
  const check = evaSuitCheck(equipped);
  return check.ready ? "" : evaSuitMessage(check.missing);
}

/** Whether pressing `deviceId` now would start depressurising an airlock (needs a suit). */
export function buttonDepressurises(
  logic: ShipLogicModel | null,
  rows: Iterable<ShipLogicRow>,
  shipId: string | undefined,
  deviceId: string,
): boolean {
  if (!logic || !shipId) return false;
  const target = logic.graph.wires.get(`${deviceId}.pressed`)?.[0];
  if (!target || (target.port !== "cycle" && target.port !== "open_outer"))
    return false;
  for (const r of rows)
    if (r.shipId === shipId && r.deviceId === target.device)
      return r.state === "pressurised";
  return false;
}

/** A walker stands in an open exterior doorway, at the hull line (where stepping out happens). */
export function atOpenHatch(
  model: EvaShipModel | null,
  doors: ReadonlyMap<string, boolean>,
  p: readonly [number, number],
): boolean {
  if (!model) return false;
  const open = new Set([...doors].filter(([, v]) => v).map(([k]) => k));
  return model.entries.some(
    (e) => open.has(e.id) && !!evaExitThrough(model, p, e.normal, open),
  );
}

/** Screen direction to a world direction for the top-down EVA camera (north-up). */
export function screenToWorldTopDown(
  h: number,
  v: number,
): { dx: number; dy: number } {
  const len = Math.hypot(h, v);
  return len < 1e-9 ? { dx: 0, dy: 0 } : { dx: h / len, dy: v / len };
}
/** Screen direction (north-up top-down camera) to a ship-local direction. */
export function screenToShipTopDown(
  h: number,
  v: number,
  shipHeading: number,
): { dx: number; dy: number } {
  const len = Math.hypot(h, v);
  if (len < 1e-9) return { dx: 0, dy: 0 };
  const local = rotate([h / len, v / len], -shipHeading);
  return { dx: local[0], dy: local[1] };
}

/** World aim angle (combat convention: 0 = +Y, clockwise) from an own-ship-local aim angle. */
export const worldAimAngle = (localAngle: number, shipHeading: number) =>
  wrapAngle(localAngle - shipHeading);
export const localAimAngle = (worldAngle: number, shipHeading: number) =>
  wrapAngle(worldAngle + shipHeading);

/** HUD line for the own EVA state (suit mode and spin when known). */
export function evaStatusLabel(
  body: EvaBodyRow,
  ship: ShipPose | undefined,
  nowMicros: bigint,
  suit?: { mode: string; omega: number; massKg: number },
) {
  if (body.returnEndsMicros > 0n) {
    const left = Number(body.returnEndsMicros - nowMicros) / 1e6;
    return `Rescue beacon · return in ${Math.max(0, Math.ceil(left))} s`;
  }
  const rel = ship
    ? (() => {
        const v = pointVelocity(ship, [body.x, body.y]);
        return Math.hypot(body.vx - v[0], body.vy - v[1]);
      })()
    : Math.hypot(body.vx, body.vy);
  const distance = ship ? Math.hypot(body.x - ship.x, body.y - ship.y) : 0;
  const frame = body.phase === "local" ? "riding along" : "free";
  const mode = suit
    ? ` · ${suit.mode === "free" ? "FREE" : "STABILISED"} · ${((suit.omega * 180) / Math.PI).toFixed(0)}°/s · ${suit.massKg.toFixed(0)} kg`
    : "";
  return `EVA · ${frame}${mode} · ${rel.toFixed(1)} m/s · ship ${distance.toFixed(0)} m${body.stranded ? " · STRANDED" : ""}`;
}

export const EVA_HELP =
  "Stabilised: mouse faces, W/S toward/away, A/D strafe · X free (Newtonian): W/S thrust, A/D spin, Shift+A/D strafe · E button · V combat";

/** Other EVA bodies as own-ship-local remote crew states (the renderer draws them like crewmates). */
export function evaBodiesForScene(
  rows: Iterable<VisibleEvaRow>,
  ownId: string,
  ship: (ShipPose & { id: string }) | undefined,
  look: (
    appearanceJson: string,
    equipmentJson: string,
  ) => { crewAppearance: CrewAppearance; heldItem: string | null },
) {
  if (!ship) return [];
  const out = [];
  for (const row of rows) {
    if (row.characterId === ownId) continue;
    const { crewAppearance, heldItem } = look(
      row.appearanceJson,
      row.equipmentJson,
    );
    const scene = evaScene(row, ship);
    const shot = worldToShip(ship, [row.shotX, row.shotY]);
    out.push({
      id: row.characterId,
      name: row.name,
      localX: scene.localX,
      localY: scene.localY,
      elevation: scene.elevation,
      connected: row.connected,
      sprinting: false,
      seated: false,
      dead: row.dead,
      aimActive: row.aimActive,
      aimAngle: row.aimActive ? localAimAngle(row.aimAngle, ship.heading) : 0,
      shotSequence: row.shotSequence,
      shot: row.shotSequence
        ? { x: shot[0], y: shot[1], struck: row.shotStruck }
        : undefined,
      appearance: crewAppearance,
      heldItem,
      eva: scene,
    });
  }
  return out;
}
