export type Rect = { x: number; y: number; w: number; h: number };
export const contains = (r: Rect, x: number, y: number) =>
  x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h;
/** Equal flexible tracks, with gaps inside the available rectangle. */
export function grid(r: Rect, columns: number, count: number, gap = 8): Rect[] {
  if (columns < 1 || count < 1) return [];
  const rows = Math.ceil(count / columns),
    w = Math.max(0, (r.w - gap * (columns - 1)) / columns),
    h = Math.max(0, (r.h - gap * (rows - 1)) / rows);
  return Array.from({ length: count }, (_, i) => ({
    x: r.x + (i % columns) * (w + gap),
    y: r.y + Math.floor(i / columns) * (h + gap),
    w,
    h,
  }));
}
export function flex(
  r: Rect,
  weights: readonly number[],
  gap = 8,
  vertical = false,
): Rect[] {
  const total = weights.reduce((a, b) => a + Math.max(0, b), 0);
  const available = Math.max(
    0,
    (vertical ? r.h : r.w) - gap * (weights.length - 1),
  );
  let cursor = vertical ? r.y : r.x;
  return weights.map((weight) => {
    const size = total ? (available * Math.max(0, weight)) / total : 0;
    const next = vertical
      ? { ...r, y: cursor, h: size }
      : { ...r, x: cursor, w: size };
    cursor += size + gap;
    return next;
  });
}
export function clampWindow(r: Rect, width: number, height: number): Rect {
  const w = Math.min(Math.max(300, r.w), Math.max(1, width - 24)),
    h = Math.min(Math.max(300, r.h), Math.max(1, height - 24));
  return {
    x: Math.max(12, Math.min(r.x, width - w - 12)),
    y: Math.max(12, Math.min(r.y, height - h - 12)),
    w,
    h,
  };
}
export function gameplayIntent(
  keys: ReadonlySet<string>,
  seated: boolean,
  interior: boolean,
  blocked: boolean,
) {
  const vertical = blocked
    ? 0
    : Number(keys.has("KeyW")) - Number(keys.has("KeyS"));
  const horizontal = blocked
    ? 0
    : Number(keys.has("KeyD")) - Number(keys.has("KeyA"));
  return {
    sprint:
      !blocked &&
      !seated &&
      interior &&
      (horizontal !== 0 || vertical !== 0) &&
      (keys.has("ShiftLeft") || keys.has("ShiftRight")),
    throttle: seated ? vertical : 0,
    turn: seated && horizontal ? -horizontal : 0,
    horizontal: !seated && interior ? horizontal : 0,
    vertical: !seated && interior ? vertical : 0,
  };
}

/** World +Y is heading zero; positive angles turn toward -X, matching sim thrust. */
export function destinationBearing(
  x: number,
  y: number,
  heading: number,
  targetX: number,
  targetY: number,
) {
  const dx = targetX - x,
    dy = targetY - y;
  const distance = Math.hypot(dx, dy);
  const bearing =
    distance < 0.001
      ? heading
      : ((Math.atan2(-dx, dy) * 180) / Math.PI + 360) % 360;
  const turn = ((bearing - heading + 540) % 360) - 180;
  return { distance, bearing, turn };
}
