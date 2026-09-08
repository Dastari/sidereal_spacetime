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
export function integrate(
  state: Motion,
  intent: Intent,
  massKg: number,
  thrustN: number,
  turnAcceleration: number,
): Motion {
  if (
    ![
      state.x,
      state.y,
      state.vx,
      state.vy,
      state.heading,
      state.omega,
      intent.throttle,
      intent.turn,
      massKg,
      thrustN,
      turnAcceleration,
    ].every(Number.isFinite) ||
    massKg <= 0
  )
    throw new Error("Invalid physical state");
  const omega =
    state.omega +
    Math.max(-1, Math.min(1, intent.turn)) * turnAcceleration * DT;
  const heading = state.heading + omega * DT;
  const acceleration =
    (Math.max(-1, Math.min(1, intent.throttle)) * thrustN) / massKg;
  const vx = state.vx - Math.sin(heading) * acceleration * DT;
  const vy = state.vy + Math.cos(heading) * acceleration * DT;
  return { x: state.x + vx * DT, y: state.y + vy * DT, vx, vy, heading, omega };
}
export function walk(
  x: number,
  y: number,
  dx: number,
  dy: number,
): { x: number; y: number } {
  const norm = Math.max(1, Math.hypot(dx, dy));
  return {
    x: Math.max(-4, Math.min(4, x + (dx / norm) * 2.5 * DT)),
    y: Math.max(-8, Math.min(8, y + (dy / norm) * 2.5 * DT)),
  };
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
