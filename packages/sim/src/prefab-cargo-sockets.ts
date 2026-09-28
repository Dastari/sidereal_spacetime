/**
 * Storage sockets of a trusted prefab deck (cargo crates, lockers) in the ship-local game frame.
 *
 * Prefab deck objects are derived from the room grammar (`deriveInterior(...).sockets`); they
 * are presentation until an operator binds an authoritative container to one. This pure planner
 * gives each storage socket a stable key and the candidate approach points in front of (then
 * beside) the object. The server still qualifies every candidate against the current collision
 * frame and standing support before it writes a container; nothing here grants access.
 *
 * Frames: prefab plan +X fore / +Y port (m); ship-local x = -(py - oy), y = px - ox (m).
 */
import {
  deriveInterior,
  prefabOrigin,
  type PrefabComponentCatalog,
  type ShipPrefabDocumentV1,
} from "@sidereal/content/ship-prefab";
import type { FaceNormal } from "@sidereal/content/construction-grammar";

/** Deck-object designs that can hold an operator-bound cargo container. */
export const PREFAB_STORAGE_DESIGNS: readonly string[] = [
  "cargo.standard.medium",
  "shipyard.equipment.wall-locker",
];

export interface PrefabCargoSocket {
  /** `<room>/<designId>` plus `#<n>` for the second and later socket of a design in a room. */
  key: string;
  designId: string;
  room: string;
  /** Footprint centre in the ship-local frame (m). */
  centreM: [number, number];
  facing: FaceNormal;
  /** Approach points (ship-local m), front first, nearest first. */
  approachesM: [number, number][];
}

const PLAN_NORMAL: Record<FaceNormal, [number, number]> = {
  fore: [1, 0],
  aft: [-1, 0],
  port: [0, 1],
  starboard: [0, -1],
};
const APPROACH_GAPS_M = [0.45, 0.6, 0.8];

export function prefabCargoSockets(
  doc: ShipPrefabDocumentV1,
  deck: number,
  catalog?: PrefabComponentCatalog,
): PrefabCargoSocket[] {
  const [ox, oy] = prefabOrigin(doc);
  // Micrometre rounding keeps plan decimals (0.05 m sockets) exact and deterministic.
  const round = (v: number) => Math.round(v * 1e6) / 1e6 + 0;
  const local = (px: number, py: number): [number, number] => [
    round(-(py - oy)),
    round(px - ox),
  ];
  const seen = new Map<string, number>();
  const out: PrefabCargoSocket[] = [];
  for (const s of deriveInterior(doc, deck, catalog).sockets) {
    if (!PREFAB_STORAGE_DESIGNS.includes(s.designId)) continue;
    const base = `${s.room}/${s.designId}`;
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    const cx = s.at[0] + s.size[0] / 2,
      cy = s.at[1] + s.size[1] / 2;
    const sides: FaceNormal[] = [
      s.facing,
      ...(["fore", "aft", "port", "starboard"] as const).filter(
        (f) => f !== s.facing,
      ),
    ];
    const approachesM: [number, number][] = [];
    for (const side of sides) {
      const [nx, ny] = PLAN_NORMAL[side];
      const half = Math.abs(nx) * (s.size[0] / 2) + Math.abs(ny) * (s.size[1] / 2);
      for (const gap of APPROACH_GAPS_M)
        approachesM.push(
          local(cx + nx * (half + gap), cy + ny * (half + gap)),
        );
    }
    out.push({
      key: n ? `${base}#${n}` : base,
      designId: s.designId,
      room: s.room,
      centreM: local(cx, cy),
      facing: s.facing,
      approachesM,
    });
  }
  return out;
}
