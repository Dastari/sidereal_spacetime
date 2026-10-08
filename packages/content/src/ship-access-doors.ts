import source from "../../../assets/runtime/ship-access/r002/manifest.json";

/** Proposed, immutable authored art; selecting this pack grants no doorway authority. */
export const SHIP_ACCESS_DOOR_REVISION = "ship-access-r002" as const;
export type ShipAccessDoorVariant =
  "personnel" | "personnel.reverse" | "cargo.2m" | "cargo.4m" | "cargo.6m";
export type ShipAccessDoorPart = "frame" | "left" | "right" | "leaf";
export const SHIP_ACCESS_DOOR_PACK = source;
export function shipAccessDoorVariant(
  id: ShipAccessDoorVariant,
  pack: ShipAccessDoorPack = source,
) {
  const variant = pack.variants.find((variant) => variant.id === id);
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

export type ShipAccessDoorVariantSpec = Readonly<
  Omit<(typeof source.variants)[number], "parts">
> & {
  readonly parts: Readonly<Partial<Record<ShipAccessDoorPart, string>>>;
  readonly leafDirection?: -1 | 1;
};
export interface ShipAccessDoorPack {
  readonly schema: string;
  readonly revision: string;
  readonly pieces: readonly ShipAccessDoorPiece[];
  readonly variants: readonly ShipAccessDoorVariantSpec[];
}

/** Capture a complete metadata revision before any caller byte resolver can run. */
export function snapshotShipAccessDoorPack(
  pack: ShipAccessDoorPack,
): ShipAccessDoorPack {
  if (
    pack.schema !== "sidereal.ship-access-doors/v1" ||
    !/^[a-z0-9-]+$/.test(pack.revision) ||
    pack.pieces.length < 1 ||
    pack.pieces.length > 64 ||
    pack.variants.length < 1 ||
    pack.variants.length > 16
  )
    throw Error("Invalid authored access pack schema/revision");
  const ids = new Set<string>();
  const pieces = pack.pieces.map((p) => {
    if (
      ids.has(p.id) ||
      !p.id ||
      !/^[a-f0-9]{64}$/.test(p.sha256) ||
      !/^[a-z0-9.-]+\.glb$/.test(p.file) ||
      p.boundsMin.length !== 3 ||
      p.boundsMax.length !== 3 ||
      p.boundsMin.some(
        (n, i) =>
          !Number.isFinite(n) ||
          !Number.isFinite(p.boundsMax[i]) ||
          n >= p.boundsMax[i],
      ) ||
      !Number.isSafeInteger(p.bytes) ||
      p.bytes <= 0 ||
      !Number.isSafeInteger(p.triangles) ||
      p.triangles <= 0
    )
      throw Error("Invalid authored access part metadata");
    ids.add(p.id);
    return Object.freeze({
      ...p,
      boundsMin: Object.freeze([...p.boundsMin]),
      boundsMax: Object.freeze([...p.boundsMax]),
    });
  });
  const variantIds = new Set<string>();
  const variants = pack.variants.map((v) => {
    if (
      variantIds.has(v.id) ||
      !v.id ||
      [
        v.spanM,
        v.clearWidthM,
        v.clearHeightM,
        v.outerHeightM,
        v.depthM,
        v.strokeM,
      ].some((n) => !Number.isFinite(n) || n <= 0) ||
      v.clearWidthM > v.spanM ||
      v.clearHeightM > v.outerHeightM ||
      !Number.isFinite(v.requiresPocketReservationM) ||
      v.requiresPocketReservationM < v.strokeM ||
      (v.motion !== "single-sliding" && v.motion !== "split-sliding") ||
      (v.leafDirection !== undefined &&
        v.leafDirection !== -1 &&
        v.leafDirection !== 1) ||
      (v.motion === "single-sliding"
        ? !v.parts.leaf
        : !v.parts.left || !v.parts.right) ||
      !v.parts.frame ||
      Object.values(v.parts).some((id) => !id || !ids.has(id))
    )
      throw Error("Invalid authored access variant metadata");
    variantIds.add(v.id);
    return Object.freeze({ ...v, parts: Object.freeze({ ...v.parts }) });
  });
  return Object.freeze({
    schema: pack.schema,
    revision: pack.revision,
    pieces: Object.freeze(pieces),
    variants: Object.freeze(variants),
  });
}
