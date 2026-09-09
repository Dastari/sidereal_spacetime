/** Server-side interest geometry. Cells are candidate filters, never authorization. */
export const SPATIAL_CELL_WIDTH_METERS = 400;
export const SPACE_DISCOVERY_RADIUS_METERS = 400;
/** Bounds keep subtraction, squared distances and integer cell conversion exact enough
 * for authoritative f64 coordinates, including the contact solver’s 1e-5m
 * separation tolerance. These are system-local world XY coordinates, not ship
 * deck coordinates or GPU camera-relative positions. An adapter must reject,
 * not clamp, bad state. */
export const MAX_SPACE_COORDINATE_METERS = 1e9;
export interface SpacePoint {
  x: number;
  y: number;
}
export interface SpatialCell {
  cellX: number;
  cellY: number;
}

export function validateSpacePoint(point: SpacePoint): void {
  if (
    ![point.x, point.y].every(
      (value) =>
        Number.isFinite(value) &&
        Math.abs(value) <= MAX_SPACE_COORDINATE_METERS,
    )
  )
    throw new Error("Invalid bounded space coordinate");
}
function validateWidth(width: number): void {
  if (
    !Number.isFinite(width) ||
    width < 1 ||
    width > MAX_SPACE_COORDINATE_METERS
  )
    throw new Error("Invalid spatial cell width");
}
export function spatialCell(
  point: SpacePoint,
  width = SPATIAL_CELL_WIDTH_METERS,
): SpatialCell {
  validateSpacePoint(point);
  validateWidth(width);
  return {
    cellX: Math.floor(point.x / width) || 0,
    cellY: Math.floor(point.y / width) || 0,
  };
}
/** Stable row-major order, including negative cells. Values safely convert to i64
 * with BigInt(cellX/Y) in the authority adapter. */
export function neighboringSpatialCells(center: SpatialCell): SpatialCell[] {
  if (
    ![center.cellX, center.cellY].every(
      (value) =>
        Number.isSafeInteger(value) &&
        Math.abs(value) <= MAX_SPACE_COORDINATE_METERS,
    )
  )
    throw new Error("Invalid bounded spatial cell");
  const cells: SpatialCell[] = [];
  for (let y = -1; y <= 1; y++)
    for (let x = -1; x <= 1; x++)
      cells.push({ cellX: center.cellX + x, cellY: center.cellY + y });
  return cells;
}
/** Exact-distance second pass after indexed neighborhood lookup. Caller separately
 * proves system membership, admission, discovery and permissible columns. Radius
 * cannot exceed cell width: otherwise nine-cell lookup could omit visible bodies. */
export function withinSpaceDiscovery(
  observer: SpacePoint,
  target: SpacePoint,
  radius = SPACE_DISCOVERY_RADIUS_METERS,
  width = SPATIAL_CELL_WIDTH_METERS,
): boolean {
  validateSpacePoint(observer);
  validateSpacePoint(target);
  validateWidth(width);
  if (!Number.isFinite(radius) || radius < 0 || radius > width)
    throw new Error("Discovery radius exceeds bounded cell neighborhood");
  return (
    (target.x - observer.x) ** 2 + (target.y - observer.y) ** 2 <= radius ** 2
  );
}
