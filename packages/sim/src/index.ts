export type Motion = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  heading: number;
  omega: number;
};
export type Intent = { throttle: number; turn: number };
export const DT = 1 / 60;
export const WALK_SPEED_MPS = 2.5;
export const SPRINT_SPEED_MPS = 4.5;
export function walk(
  x: number,
  y: number,
  dx: number,
  dy: number,
  obstacles: readonly {
    x: number;
    y: number;
    width: number;
    depth: number;
  }[] = [],
  sprint = false,
  constrain: (x: number, y: number) => { x: number; y: number } = (px, py) => ({
    x: Math.max(-4, Math.min(4, px)),
    y: Math.max(-8, Math.min(8, py)),
  }),
): { x: number; y: number } {
  if (![x, y, dx, dy].every(Number.isFinite) || typeof sprint !== "boolean")
    throw new Error("Invalid walking state");
  const norm = Math.max(1, Math.hypot(dx, dy));
  const speed = sprint ? SPRINT_SPEED_MPS : WALK_SPEED_MPS;
  const next = { x: constrain(x + (dx / norm) * speed * DT, y).x, y };
  // An axis step may hit a narrowing boundary; it must not teleport the other
  // coordinate through an intervening wall to satisfy the footprint clamp.
  const rawY = y + (dy / norm) * speed * DT;
  // Fixed substeps are shorter than the smallest blocker. Axis separation allows
  // sliding along partitions; the 0.3 m crew radius must fit through the doorway.
  const blocked = (px: number, py: number) =>
    obstacles.some(
      (o) =>
        Math.abs(px - o.x) < o.width / 2 + 0.3 &&
        Math.abs(py - o.y) < o.depth / 2 + 0.3,
    );
  if (blocked(next.x, y)) next.x = x;
  const constrainedY = constrain(next.x, rawY);
  if (
    Math.abs(constrainedY.x - next.x) < 1e-9 &&
    !blocked(next.x, constrainedY.y)
  )
    next.y = constrainedY.y;
  return next;
}
export function assertRevision(actual: bigint, expected: bigint): void {
  if (actual !== expected)
    throw new Error(
      "Revision conflict: reload the current ship before applying this edit",
    );
}
export function inventoryFits(
  container: { width: number; height: number },
  item: { width: number; height: number },
  x: number,
  y: number,
): boolean {
  return (
    [container.width, container.height, item.width, item.height, x, y].every(
      Number.isInteger,
    ) &&
    item.width > 0 &&
    item.height > 0 &&
    x >= 0 &&
    y >= 0 &&
    x + item.width <= container.width &&
    y + item.height <= container.height
  );
}
