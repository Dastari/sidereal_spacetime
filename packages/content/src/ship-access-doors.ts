import source from "../../../assets/runtime/ship-access/r002/manifest.json";

/** Proposed, immutable authored art; selecting this pack grants no doorway authority. */
export const SHIP_ACCESS_DOOR_REVISION = "ship-access-r002" as const;
export type ShipAccessDoorVariant =
  "personnel" | "cargo.2m" | "cargo.4m" | "cargo.6m";
export type ShipAccessDoorPart = "frame" | "left" | "right" | "leaf";
export const SHIP_ACCESS_DOOR_PACK = source;
export function shipAccessDoorVariant(id: ShipAccessDoorVariant) {
  const variant = source.variants.find((variant) => variant.id === id);
  if (!variant) throw Error(`Unknown authored access door: ${id}`);
  return variant;
}

/** File metadata only: proposal publication and its byte resolver belong to the caller. */
export type ShipAccessDoorPiece = Readonly<
  Omit<(typeof source.pieces)[number], "boundsMin" | "boundsMax">
> & {
  readonly boundsMin: readonly number[];
  readonly boundsMax: readonly number[];
};
