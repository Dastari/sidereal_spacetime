/**
 * Roof mount tiles (owner decision 2026-09-29, wiki `Decisions/2026-09-29 Sensors Mounts and
 * Starter Handling` items 3-4): every ship weapon and sensor mounts on the ROOF through a special
 * roof tile. Engines are the only side/aft-mounted equipment.
 *
 * - FIXED directional mounts carry full-size items along a fixed boresight with a narrow cone.
 * - TURRET mounts rotate, but carry one size smaller: a size-2 (LG) turret holds one size-1 (MD)
 *   item or two size-0 (SM) items. Dual and quad configurations are linked identical items.
 *
 * The data (sizes, mass, power, heat, arcs, capacity) lives in `construction-grammar.v1.json`
 * `mountTiles`; this module is the pure rulebook over it. Proposed balance, not owner-approved.
 * Arc data is recorded for ship-weapon fire; ship weapons do not fire yet (Systems/Combat M6).
 */
import {
  G,
  MOUNT_SIZE_IDS,
  mountSizeRank,
  type FaceNormal,
  type MountSizeId,
  type MountTileKind,
  type MountTileSpec,
} from "./construction-grammar";

export type MountTileCount = 1 | 2 | 4;
export const MOUNT_TILE_COUNTS: readonly MountTileCount[] = [1, 2, 4];

/** Tile sizes offered per kind (turrets start at MD: an SM turret could carry nothing). */
export function mountTileSizes(kind: MountTileKind): MountSizeId[] {
  return MOUNT_SIZE_IDS.filter((s) => G.mountTiles.kinds[kind][s]);
}

export function mountTileSpec(
  kind: MountTileKind,
  size: MountSizeId,
): MountTileSpec | undefined {
  return G.mountTiles.kinds[kind][size];
}

/** Largest item size for `count` linked items on this tile, or undefined when not allowed. */
export function mountTileCapacity(
  kind: MountTileKind,
  size: MountSizeId,
  count: number,
): MountSizeId | undefined {
  const row = G.mountTiles.capacity[kind][size];
  return row ? row[String(count) as "1" | "2" | "4"] : undefined;
}

/** Every allowed configuration of a tile, e.g. turret LG -> [{1, MD}, {2, SM}]. */
export function mountTileConfigs(
  kind: MountTileKind,
  size: MountSizeId,
): { count: MountTileCount; maxItem: MountSizeId }[] {
  return MOUNT_TILE_COUNTS.flatMap((count) => {
    const maxItem = mountTileCapacity(kind, size, count);
    return maxItem ? [{ count, maxItem }] : [];
  });
}

/** True when `count` items of `item` size fit the tile (undersized items are allowed). */
export function mountTileAccepts(
  kind: MountTileKind,
  size: MountSizeId,
  count: number,
  item: MountSizeId,
): boolean {
  const max = mountTileCapacity(kind, size, count);
  return !!max && mountSizeRank(item) <= mountSizeRank(max);
}

export const mountTileRequired = (category: string): boolean =>
  G.mountTiles.families.includes(category);

export const mountTileHeightTexels = (kind: MountTileKind): number =>
  G.mountTiles.heightTexels[kind];

/** Kit piece id of the Blender-authored tile (bundle `mount-tiles.glb`). */
export const mountTilePiece = (kind: MountTileKind, size: MountSizeId) =>
  `mount.${kind}.${size.toLowerCase()}`;

/** Plan heading of a facing (radians, 0 = fore (+X), counter-clockwise towards port (+Y)). */
export const FACING_RADIANS: Record<FaceNormal, number> = {
  fore: 0,
  port: Math.PI / 2,
  aft: Math.PI,
  starboard: -Math.PI / 2,
};

/**
 * Item slot centres on a tile, in the tile frame [across, along] (m) relative to the tile centre:
 * along = the boresight, across = to its left (counter-clockwise). Single items sit at the centre;
 * dual items side by side across the boresight; quad items in a 2 x 2 block.
 */
export function mountTileSlots(
  size: MountSizeId,
  count: number,
): [number, number][] {
  const q = G.mountSizes[size].cells / 4;
  if (count === 2)
    return [
      [q, 0],
      [-q, 0],
    ];
  if (count === 4)
    return [
      [q, q],
      [-q, q],
      [q, -q],
      [-q, -q],
    ];
  return [[0, 0]];
}

export interface MountArc {
  kind: MountTileKind;
  /** Plan boresight (fixed) or rest direction (turret), radians as FACING_RADIANS. */
  boresightRad: number;
  /** Full width of the field of fire (or sensor coverage) centred on the boresight (deg). */
  arcDeg: number;
  /** How fast the item can slew within its arc (deg/s); 0 = no traverse (fixed sensors). */
  traverseDegPerS: number;
}

/**
 * Field of fire of an item on a tile.
 * - Fixed: the narrower of the tile cone and the item's own arc; the item's tracking gimbals it
 *   within the cone.
 * - Turret: the item's own arc (its traverse range) around the rest direction; slewing is the
 *   slower of the ring and the item's tracking.
 * - Sensors: an omnidirectional sensor (360 degrees) covers everything on either tile; a
 *   directional sensor (dish) looks along the boresight on a fixed tile and sweeps 360 degrees
 *   on a turret.
 */
export function mountArc(
  kind: MountTileKind,
  size: MountSizeId,
  facing: FaceNormal,
  item: { category: string; arcDeg?: number; trackingDegPerS?: number },
): MountArc {
  const tile = mountTileSpec(kind, size);
  const own = item.arcDeg ?? 360;
  const tracking = item.trackingDegPerS ?? 0;
  const boresightRad = FACING_RADIANS[facing];
  if (item.category === "sensor")
    return {
      kind,
      boresightRad,
      arcDeg: own >= 360 || kind === "turret" ? 360 : own,
      traverseDegPerS: kind === "turret" ? (tile?.traverseDegPerS ?? 0) : 0,
    };
  if (kind === "fixed")
    return {
      kind,
      boresightRad,
      arcDeg: Math.min(own, tile?.arcDeg ?? 0),
      traverseDegPerS: tracking,
    };
  return {
    kind,
    boresightRad,
    arcDeg: Math.min(own, tile?.arcDeg ?? 360),
    traverseDegPerS: Math.min(tracking || Infinity, tile?.traverseDegPerS ?? 0),
  };
}

/** Whether a plan bearing (radians, same convention) lies inside the arc. */
export function arcAllows(arc: MountArc, bearingRad: number): boolean {
  if (arc.arcDeg >= 360) return true;
  const d = Math.atan2(
    Math.sin(bearingRad - arc.boresightRad),
    Math.cos(bearingRad - arc.boresightRad),
  );
  return Math.abs(d) <= (arc.arcDeg * Math.PI) / 360 + 1e-9;
}
