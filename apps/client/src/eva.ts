/**
 * EVA presentation and input for the game client (design: wiki `Systems/EVA`). Pure: reads the
 * own EVA views and the own ship pose, returns what the renderer and the HUD need, and maps keys
 * to the ordinary `set_intent` row. The server owns every position; nothing here is authority.
 */
import {
  EVA,
  airlockFromInside,
  airlockFromOutside,
  hullSurfaceAt,
  maglockPoint,
  pointVelocity,
  prefabEvaModel,
  rotate,
  worldToShip,
  wrapAngle,
  type EvaShipModel,
  type ShipPose,
} from "@sidereal/sim/eva";
import { readShipPrefab } from "@sidereal/content/ship-prefab";
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
export interface EvaCycleRow {
  characterId: string;
  shipId: string;
  airlockId: string;
  direction: string;
  startedMicros: bigint;
  endsMicros: bigint;
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

const models = new Map<string, EvaShipModel | null>();
/** EVA geometry of a construction instance document (prefab ships only), cached per document. */
export function evaModelOfDocument(
  documentJson: string | undefined,
): EvaShipModel | null {
  if (!documentJson) return null;
  if (models.has(documentJson)) return models.get(documentJson)!;
  if (models.size > 8) models.clear();
  let model: EvaShipModel | null = null;
  try {
    const binding = (
      JSON.parse(documentJson) as {
        prefab?: { document?: unknown; catalog?: unknown };
      }
    ).prefab;
    if (binding && typeof binding === "object")
      model = prefabEvaModel(
        readShipPrefab(binding.document),
        prefabComponentCatalogFor(String(binding.catalog)),
      );
  } catch {
    model = null;
  }
  models.set(documentJson, model);
  return model;
}

/** Presentation height of a body over the hull (m): maglocked on the roof, else floating above. */
const FLOAT_ABOVE_ROOF_M = 0.2;
const OPEN_SPACE_HEIGHT_M = 2.2;

export interface EvaScene {
  phase: "free" | "maglocked";
  /** Own-ship-local position and heading (ship convention), what the avatar under the ship uses. */
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
 * The own body in the own ship's frame. A maglocked body on the own ship uses its accepted local
 * point; any other body is the world pose transformed by the accepted ship pose (both rows come
 * from the same server tick, so the relative pose is consistent while the ship moves).
 */
export function evaScene(
  body: EvaBodyRow,
  ship: ShipPose & { id: string },
  model: EvaShipModel | null,
  cycling: boolean,
): EvaScene {
  const anchored = body.phase === "maglocked" && body.anchorShipId === ship.id;
  const local = anchored
    ? ([body.localX, body.localY] as [number, number])
    : worldToShip(ship, [body.x, body.y]);
  const localHeading = anchored
    ? body.localHeading
    : wrapAngle(body.heading - ship.heading);
  const roof = model ? hullSurfaceAt(model, local) : undefined;
  const elevation =
    body.phase === "maglocked"
      ? (roof ?? OPEN_SPACE_HEIGHT_M)
      : Math.max(roof ?? 0, OPEN_SPACE_HEIGHT_M - FLOAT_ABOVE_ROOF_M) +
        FLOAT_ABOVE_ROOF_M;
  return {
    phase: body.phase === "maglocked" ? "maglocked" : "free",
    localX: local[0],
    localY: local[1],
    localHeading,
    elevation,
    forward: body.forward,
    strafe: body.strafe,
    turn: body.turn,
    walking: body.walking,
    cycling,
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
    standingElevationM: 0.1875,
  };
}

export type EvaAction =
  | { kind: "cycle"; shipId: string; airlockId: string; label: string }
  | undefined;

/**
 * What E does about airlocks: from the deck at a hatch, cycle out; from space within reach of a
 * hatch's outside point, cycle in; while cycling, cancel. The server rechecks all of it.
 */
export function evaAirlockAction(input: {
  shipId: string | undefined;
  model: EvaShipModel | null;
  aboard: { localX: number; localY: number } | undefined;
  eva: EvaScene | undefined;
  cycle: EvaCycleRow | undefined;
}): EvaAction {
  const { shipId, model, aboard, eva, cycle } = input;
  if (cycle)
    return {
      kind: "cycle",
      shipId: cycle.shipId,
      airlockId: cycle.airlockId,
      label: "Cancel airlock cycle",
    };
  if (!shipId || !model) return;
  if (eva) {
    const lock = airlockFromOutside(model, [eva.localX, eva.localY]);
    return lock
      ? {
          kind: "cycle",
          shipId,
          airlockId: lock.id,
          label: "Cycle airlock (enter)",
        }
      : undefined;
  }
  if (!aboard) return;
  const lock = airlockFromInside(model, [aboard.localX, aboard.localY]);
  return lock
    ? {
        kind: "cycle",
        shipId,
        airlockId: lock.id,
        label: "Cycle airlock (EVA)",
      }
    : undefined;
}

/** Whether M would lock the boots onto the own hull (the server also tries nearby hulls). */
export function evaCanMaglock(
  body: EvaBodyRow | undefined,
  ship: ShipPose | undefined,
  model: EvaShipModel | null,
) {
  if (!body || body.phase !== "free" || !ship || !model) return false;
  const local = worldToShip(ship, [body.x, body.y]);
  if (!maglockPoint(model, local)) return false;
  const v = pointVelocity(ship, [body.x, body.y]);
  return Math.hypot(body.vx - v[0], body.vy - v[1]) <= EVA.maglockMaxRelSpeed;
}

const pressed = (keys: ReadonlySet<string>, code: string) =>
  Number(keys.has(code));

/**
 * Keys to the ordinary input row while outside. Free (jetpack): W/S thrust along the heading,
 * A/D turn (A = counter-clockwise, like the helm), Shift+A/D strafe. Maglocked: WASD walks
 * screen-relative; `screenToShip` turns the screen direction into the ship-local walk direction.
 */
export function evaIntent(
  keys: ReadonlySet<string>,
  phase: "free" | "maglocked" | undefined,
  blocked: boolean,
  screenToShip: (h: number, v: number) => { dx: number; dy: number },
) {
  const none = { throttle: 0, turn: 0, dx: 0, dy: 0, sprint: false };
  if (blocked || !phase) return none;
  const vertical = pressed(keys, "KeyW") - pressed(keys, "KeyS");
  const horizontal = pressed(keys, "KeyD") - pressed(keys, "KeyA");
  if (phase === "maglocked") {
    const walk = screenToShip(horizontal, vertical);
    return { ...none, dx: walk.dx, dy: walk.dy };
  }
  const shift = keys.has("ShiftLeft") || keys.has("ShiftRight");
  return {
    ...none,
    throttle: vertical,
    turn: shift || !horizontal ? 0 : -horizontal,
    dx: shift ? horizontal : 0,
  };
}

/**
 * Screen direction to a ship-local direction for the top-down EVA camera (north-up: screen up is
 * world +Y, screen right is world +X), rotated into the ship frame.
 */
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

/** HUD line for the own EVA state. */
export function evaStatusLabel(
  body: EvaBodyRow,
  cycle: EvaCycleRow | undefined,
  ship: ShipPose | undefined,
  nowMicros: bigint,
) {
  if (cycle) {
    const left = Number(cycle.endsMicros - nowMicros) / 1e6;
    return `Airlock cycling ${cycle.direction === "in" ? "in" : "out"} · ${Math.max(0, Math.ceil(left))} s`;
  }
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
  return body.phase === "maglocked"
    ? `EVA · Maglocked on hull`
    : `EVA · Jetpack · ${rel.toFixed(1)} m/s · ship ${distance.toFixed(0)} m${body.stranded ? " · STRANDED" : ""}`;
}

export const EVA_HELP =
  "W/S thrust · A/D turn · Shift+A/D strafe · M maglock · E airlock · V combat";
export const EVA_MAGLOCK_HELP =
  "WASD walk on the hull · M release boots · E airlock · V combat";

/** Other EVA bodies as own-ship-local remote crew states (the renderer draws them like crewmates). */
export function evaBodiesForScene(
  rows: Iterable<VisibleEvaRow>,
  ownId: string,
  ship: (ShipPose & { id: string }) | undefined,
  model: EvaShipModel | null,
  look: (
    appearanceJson: string,
    equipmentJson: string,
  ) => { crewAppearance: CrewAppearance; equippedAsset: string | null },
) {
  if (!ship) return [];
  const out = [];
  for (const row of rows) {
    if (row.characterId === ownId) continue;
    const { crewAppearance, equippedAsset } = look(
      row.appearanceJson,
      row.equipmentJson,
    );
    const scene = evaScene(
      {
        ...row,
        vx: 0,
        vy: 0,
        exitShipId: "",
        visitId: "",
        deckId: "",
        returnEndsMicros: 0n,
        stranded: false,
      },
      ship,
      model,
      row.cycling,
    );
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
      heldAsset: equippedAsset,
      eva: scene,
    });
  }
  return out;
}
