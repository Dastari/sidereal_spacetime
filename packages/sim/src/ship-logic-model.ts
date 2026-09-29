/**
 * Ship logic geometry in the ship-local game frame (x starboard, y fore, metres): where each wall
 * panel is and who can reach it, and where each actuated door is (its doorway zone, for the
 * "never close on a body" rule and for walking/EVA collision). Derived from grammar data only,
 * deterministic, cached per document. Wiki `Systems/Ship Logic`.
 */
import {
  deriveInterior,
  logicWallPlacement,
  prefabOrigin,
  type PrefabComponentCatalog,
  type ShipPrefabDocumentV1,
} from "@sidereal/content/ship-prefab";
import { NORMAL_VECTOR, type FaceNormal } from "@sidereal/content/construction-grammar";
import { logicGraph, type LogicGraph } from "./ship-logic";

export type P2 = [number, number];

/** Reach from the presser's body centre to a panel's front point (m). */
export const LOGIC_PANEL_REACH_M = 1.3;
/** A panel's front point sits this far in front of its surface (where a presser stands). */
export const LOGIC_PANEL_FRONT_M = 0.45;
/** Panel centre height above the deck floor (presentation). */
export const LOGIC_PANEL_HEIGHT_M = 1.25;
/** Doorway zone half depth on each side of a door line (m): bodies here block a close. */
export const LOGIC_DOORWAY_HALF_DEPTH_M = 0.6;

export interface LogicPanel {
  deviceId: string;
  side: "interior" | "exterior";
  wall: "hull" | "partition";
  /** Panel back-face centre on the wall surface (ship-local, at deck level). */
  surface: P2;
  /** Unit normal the panel faces. */
  normal: P2;
  /** Where a presser stands (surface + normal * LOGIC_PANEL_FRONT_M). */
  front: P2;
  room: string | null;
}
export interface LogicDoor {
  deviceId: string;
  doorId: string;
  exterior: boolean;
  /** Door line centre, unit direction along the span, unit normal (outward for exterior doors). */
  center: P2;
  along: P2;
  normal: P2;
  span: number;
  /** Walking-layout opening id of an interior door (`opening-<doorId>`), else null. */
  openingId: string | null;
}
/** An airlock chamber: the room shared by a controller's inner and outer doors. */
export interface LogicChamber {
  controllerId: string;
  room: string;
  /** Ship-local axis-aligned bounds [x0, y0, x1, y1] of the room rectangle. */
  bounds: [number, number, number, number];
}
export interface ShipLogicModel {
  graph: LogicGraph;
  panels: LogicPanel[];
  doors: LogicDoor[];
  chambers: LogicChamber[];
}

const zero = (n: number) => Math.round(n * 1e9) / 1e9 + 0;
const cache = new WeakMap<ShipPrefabDocumentV1, ShipLogicModel | null>();

/** The logic model of a prefab document, or null when it has no logic. */
export function shipLogicModel(
  doc: ShipPrefabDocumentV1,
  catalog: PrefabComponentCatalog,
): ShipLogicModel | null {
  if (cache.has(doc)) return cache.get(doc)!;
  if (!doc.logic) {
    cache.set(doc, null);
    return null;
  }
  const [ox, oy] = prefabOrigin(doc);
  const toShip = (p: readonly number[]): P2 => [zero(-(p[1] - oy)), zero(p[0] - ox)];
  const toShipDir = (v: readonly number[]): P2 => [zero(-v[1]), zero(v[0])];
  const interior = deriveInterior(doc, 0, catalog);
  const panels: LogicPanel[] = [];
  const doors: LogicDoor[] = [];
  for (const d of [...doc.logic.devices].sort((a, b) => (a.id < b.id ? -1 : 1))) {
    if (d.kind === "button") {
      const place = logicWallPlacement(doc, d, catalog);
      if ("error" in place) continue;
      const surface = toShip(place.surface);
      const normal = toShipDir(place.normal);
      panels.push({
        deviceId: d.id,
        side: place.side,
        wall: place.wall,
        surface,
        normal,
        front: [
          zero(surface[0] + normal[0] * LOGIC_PANEL_FRONT_M),
          zero(surface[1] + normal[1] * LOGIC_PANEL_FRONT_M),
        ],
        room: place.room,
      });
    } else if (d.kind === "door" && d.door) {
      const door = interior.doors.find((x) => x.id === d.door);
      if (!door) continue;
      const a = toShip(door.a),
        b = toShip(door.b);
      const span = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (span < 0.5) continue;
      const along: P2 = [zero((b[0] - a[0]) / span), zero((b[1] - a[1]) / span)];
      let normal: P2 = [zero(-along[1]), zero(along[0])];
      if (door.exterior) {
        const mount = doc.mounts.find((m) => m.id === door.id);
        if (mount?.normal)
          normal = toShipDir(NORMAL_VECTOR[mount.normal as FaceNormal]);
      }
      doors.push({
        deviceId: d.id,
        doorId: door.id,
        exterior: door.exterior,
        center: [zero((a[0] + b[0]) / 2), zero((a[1] + b[1]) / 2)],
        along,
        normal,
        span,
        openingId: door.exterior ? null : `opening-${door.id}`,
      });
    }
  }
  const graph = logicGraph(doc.logic);
  const chambers: LogicChamber[] = [];
  for (const node of graph.devices.values()) {
    if (node.kind !== "airlock-controller") continue;
    const doorOf = (port: string) => {
      const target = graph.wires.get(`${node.id}.${port}`)?.[0]?.device;
      const device = target ? graph.devices.get(target) : undefined;
      return device?.door
        ? interior.doors.find((d) => d.id === device.door)
        : undefined;
    };
    const inner = doorOf("inner"),
      outer = doorOf("outer");
    const room = inner?.rooms.find(
      (r) => r !== null && outer?.rooms.includes(r),
    );
    const rect = room ? doc.rooms.find((r) => r.id === room)?.rect : undefined;
    if (!room || !rect) continue;
    const a = toShip([rect[0], rect[1]]),
      b = toShip([rect[2], rect[3]]);
    chambers.push({
      controllerId: node.id,
      room,
      bounds: [
        Math.min(a[0], b[0]),
        Math.min(a[1], b[1]),
        Math.max(a[0], b[0]),
        Math.max(a[1], b[1]),
      ],
    });
  }
  const model = { graph, panels, doors, chambers };
  cache.set(doc, model);
  return model;
}

/** Whether a ship-local point is inside a chamber room's rectangle. */
export const inChamber = (c: LogicChamber, p: readonly [number, number]) =>
  p[0] >= c.bounds[0] &&
  p[0] <= c.bounds[2] &&
  p[1] >= c.bounds[1] &&
  p[1] <= c.bounds[3];

/** Whether a body centre at `p` is in a door's doorway zone (blocks a close). */
export function inDoorway(door: LogicDoor, p: readonly [number, number], radius = 0.3) {
  const rx = p[0] - door.center[0],
    ry = p[1] - door.center[1];
  const u = rx * door.along[0] + ry * door.along[1];
  const v = rx * door.normal[0] + ry * door.normal[1];
  return (
    Math.abs(u) <= door.span / 2 + radius &&
    Math.abs(v) <= LOGIC_DOORWAY_HALF_DEPTH_M + radius
  );
}

/**
 * The panel a body at `p` can press: on the panel's front side, within reach of its front point,
 * nearest first. `side` restricts to panels pressed from aboard (interior) or from space.
 */
export function reachablePanel(
  model: Pick<ShipLogicModel, "panels">,
  p: readonly [number, number],
  side: "interior" | "exterior",
): LogicPanel | undefined {
  let best: { d: number; panel: LogicPanel } | undefined;
  for (const panel of model.panels) {
    if (panel.side !== side) continue;
    const ahead =
      (p[0] - panel.surface[0]) * panel.normal[0] +
      (p[1] - panel.surface[1]) * panel.normal[1];
    if (ahead <= 0.05) continue;
    const d = Math.hypot(p[0] - panel.front[0], p[1] - panel.front[1]);
    if (d <= LOGIC_PANEL_REACH_M && (!best || d < best.d)) best = { d, panel };
  }
  return best?.panel;
}
