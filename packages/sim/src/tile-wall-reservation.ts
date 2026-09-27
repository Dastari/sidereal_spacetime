import {
  TILESET_INTERFACE_LIMITS,
  TILESET_WALL_CONVENTION,
  type TileWallReservationInput,
} from "@sidereal/content/tileset-interfaces";

type XY = readonly [number, number];
export interface TileWallReservation {
  id: string;
  /** Metres. Offset diagonal corners are continuous, not lattice vertices. */
  corners: readonly [XY, XY, XY, XY];
  bottom: number;
  top: number;
  length: number;
  inward: XY;
  tangent: XY;
  thickness: number;
}

/** Nominal wall-body reservation, not a mesh, join or pressure qualification.
 * The exterior edge never moves; all thickness is on the declared floor side.
 * Endpoint/corner mating geometry must be qualified separately by the native kit. */
export function tileWallReservation(
  input: TileWallReservationInput,
): TileWallReservation {
  const fail = (reason: string): never => {
    throw Error(`${input.id}: ${reason}`);
  };
  const limit = TILESET_INTERFACE_LIMITS.coordinate;
  if (!input.id || input.id.length > 160) fail("invalid wall identity");
  for (const point of [input.a, input.b]) {
    if (
      !Array.isArray(point) ||
      point.length !== 2 ||
      !point.every((n) => Number.isSafeInteger(n) && Math.abs(n) <= limit)
    )
      fail("wall endpoints must be bounded lattice coordinates");
  }
  if (!["left", "right"].includes(input.interiorSide))
    fail("wall requires an explicit interior side");
  if (
    !Number.isSafeInteger(input.floorTop) ||
    Math.abs(input.floorTop) > limit ||
    !Number.isSafeInteger(input.fullWallHeight) ||
    input.fullWallHeight <= 0 ||
    input.fullWallHeight > limit
  )
    fail("wall requires bounded floor-top and full-height datums");
  if (
    !TILESET_WALL_CONVENTION.heightQuarters.some(
      (q) => q === input.heightQuarters,
    )
  )
    fail("unsupported wall height fraction");
  const height = (input.fullWallHeight * input.heightQuarters) / 4;
  if (!Number.isSafeInteger(height))
    fail(
      "fractional wall top is not on the structural lattice; choose compatible datums",
    );
  if (Math.abs(input.floorTop + height) > limit)
    fail("wall top exceeds the coordinate budget");
  const units = TILESET_WALL_CONVENTION.latticePerMeter;
  const a: XY = [input.a[0] / units, input.a[1] / units];
  const b: XY = [input.b[0] / units, input.b[1] / units];
  const dx = b[0] - a[0],
    dy = b[1] - a[1],
    length = Math.hypot(dx, dy);
  if (length === 0) fail("wall edge has zero length");
  const tangent: XY = [dx / length, dy / length];
  const side = input.interiorSide === "left" ? 1 : -1;
  const inward: XY = [-tangent[1] * side, tangent[0] * side];
  const thickness = TILESET_WALL_CONVENTION.thicknessUnits / units;
  const shifted = (p: XY): XY => [
    p[0] + inward[0] * thickness,
    p[1] + inward[1] * thickness,
  ];
  return {
    id: input.id,
    corners: [a, b, shifted(b), shifted(a)],
    bottom: input.floorTop / units,
    top: (input.floorTop + height) / units,
    length,
    tangent,
    inward,
    thickness,
  };
}

/** Closed nominal-volume test in metres. Contact policy is deliberately separate
 * from this geometric predicate; editor/entity placement must validate full bodies. */
export function pointInTileWall(
  reservation: TileWallReservation,
  point: readonly [number, number, number],
): boolean {
  if (point.length !== 3 || !point.every(Number.isFinite))
    throw Error(`${reservation.id}: invalid test point`);
  const dx = point[0] - reservation.corners[0][0],
    dy = point[1] - reservation.corners[0][1];
  const along = dx * reservation.tangent[0] + dy * reservation.tangent[1];
  const inward = dx * reservation.inward[0] + dy * reservation.inward[1];
  return (
    along >= 0 &&
    along <= reservation.length &&
    inward >= 0 &&
    inward <= reservation.thickness &&
    point[2] >= reservation.bottom &&
    point[2] <= reservation.top
  );
}
