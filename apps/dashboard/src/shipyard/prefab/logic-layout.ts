/**
 * Where the plan draws ship logic (wiki `Systems/Ship Logic`), in prefab plan metres: wall buttons
 * on their wall, door actuators at their door centre, and airlock controllers (virtual devices) as
 * a chip in the room shared by the doors they drive, or the ship centre when unwired. Pure; the
 * plan, the hit test and issue focusing share it.
 */
import { NORMAL_VECTOR, type Pt } from "@sidereal/content/construction-grammar";
import type { PrefabLogicDevice } from "@sidereal/content/ship-logic";
import {
  logicWallPlacement,
  type DerivedDoor,
  type PrefabComponentCatalog,
  type ShipPrefabDocumentV1,
  type VolumeGeometry,
} from "@sidereal/content/ship-prefab";

export interface LogicAnchor {
  device: PrefabLogicDevice;
  /** Marker centre (buttons: on the panel face; doors: door centre; controllers: chip centre). */
  at: Pt;
  /** Buttons: unit plan normal of the facing side. */
  normal?: Pt;
  /** Buttons: the placement is valid. Doors: the door exists. Controllers: always true. */
  placed: boolean;
}

/** Controller chip size (m). */
export const CONTROLLER_CHIP: [number, number] = [1.4, 0.5];
/** Button panel half size and door marker radius (m). */
export const BUTTON_HALF = 0.15;
export const DOOR_MARKER_R = 0.2;

export function logicAnchors(
  doc: ShipPrefabDocumentV1,
  catalog: PrefabComponentCatalog,
  doors: readonly DerivedDoor[],
  geoms: readonly VolumeGeometry[],
): Map<string, LogicAnchor> {
  const out = new Map<string, LogicAnchor>();
  const logic = doc.logic;
  if (!logic) return out;
  const devices = new Map(logic.devices.map((d) => [d.id, d]));
  const doorOf = (d?: PrefabLogicDevice) =>
    d?.kind === "door" ? doors.find((x) => x.id === d.door) : undefined;
  for (const d of logic.devices) {
    if (d.kind === "button" && d.at && d.normal) {
      const place = logicWallPlacement(doc, d, catalog);
      const n = NORMAL_VECTOR[d.normal];
      const at: Pt =
        "error" in place
          ? [d.at[0] + n[0] * 0.08, d.at[1] + n[1] * 0.08]
          : [place.surface[0] + n[0] * 0.08, place.surface[1] + n[1] * 0.08];
      out.set(d.id, {
        device: d,
        at,
        normal: [n[0], n[1]],
        placed: !("error" in place),
      });
    } else if (d.kind === "door") {
      const door = doorOf(d);
      out.set(d.id, {
        device: d,
        at: door
          ? [(door.a[0] + door.b[0]) / 2, (door.a[1] + door.b[1]) / 2]
          : shipCentre(geoms),
        placed: !!door,
      });
    }
  }
  // Controllers: the room every door they drive or read opens into.
  const chips = new Map<string, number>();
  for (const d of logic.devices) {
    if (d.kind !== "airlock-controller") continue;
    const driven = logic.links
      .flatMap((l) =>
        l.from.device === d.id
          ? [l.to.device]
          : l.to.device === d.id
            ? [l.from.device]
            : [],
      )
      .map((id) => doorOf(devices.get(id)))
      .filter((x): x is DerivedDoor => !!x);
    let at = shipCentre(geoms);
    let key = "ship";
    if (driven.length) {
      const counts = new Map<string, number>();
      for (const door of driven)
        for (const r of new Set(door.rooms))
          if (r) counts.set(r, (counts.get(r) ?? 0) + 1);
      const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
      const room = doc.rooms.find((r) => r.id === best);
      if (room) {
        at = [
          (room.rect[0] + room.rect[2]) / 2,
          (room.rect[1] + room.rect[3]) / 2,
        ];
        key = room.id;
      }
    }
    // Several controllers in one room stack downwards.
    const n = chips.get(key) ?? 0;
    chips.set(key, n + 1);
    out.set(d.id, {
      device: d,
      at: [at[0], at[1] - n * (CONTROLLER_CHIP[1] + 0.15)],
      placed: true,
    });
  }
  return out;
}

export function shipCentre(geoms: readonly VolumeGeometry[]): Pt {
  const g = geoms.filter((x) => x.volume.tiles.length);
  if (!g.length) return [0, 0];
  const x0 = Math.min(...g.map((x) => x.bounds[0]));
  const y0 = Math.min(...g.map((x) => x.bounds[1]));
  const x1 = Math.max(...g.map((x) => x.bounds[2]));
  const y1 = Math.max(...g.map((x) => x.bounds[3]));
  return [(x0 + x1) / 2, (y0 + y1) / 2];
}

/** The logic device under a plan point, if any (smallest marker first). */
export function logicHit(
  anchors: ReadonlyMap<string, LogicAnchor>,
  p: Pt,
  tolerance: number,
): string | null {
  let best: { id: string; d: number } | null = null;
  for (const [id, a] of anchors) {
    let d: number;
    if (a.device.kind === "airlock-controller") {
      const inside =
        Math.abs(p[0] - a.at[0]) <= CONTROLLER_CHIP[0] / 2 + tolerance &&
        Math.abs(p[1] - a.at[1]) <= CONTROLLER_CHIP[1] / 2 + tolerance;
      if (!inside) continue;
      d = Math.hypot(p[0] - a.at[0], p[1] - a.at[1]) + 0.5;
    } else {
      const r = a.device.kind === "button" ? BUTTON_HALF * 1.2 : DOOR_MARKER_R;
      d = Math.hypot(p[0] - a.at[0], p[1] - a.at[1]);
      if (d > r + tolerance) continue;
    }
    if (!best || d < best.d) best = { id, d };
  }
  return best?.id ?? null;
}
