import type { SharedWorldStore } from "@sidereal/net";
import {
  SHARED_SYSTEM_SEED,
  SOLAR_SYSTEM,
} from "@sidereal/content/shared-system";
const displayNames = new Map(
  SOLAR_SYSTEM.bodies.map((body) => [body.id, body.name]),
);
const names = new Map<string, string>(
  SHARED_SYSTEM_SEED.bodies.map((body) => [body.id, body.key]),
);
/** The seed supplies display keys only. Every physical field comes from the
 * authorized projection and accepted/interpolated motion, never seed positions. */
export function sharedBodyPresentation(
  store: SharedWorldStore,
  nowMs: number,
  interpolate = true,
) {
  const snapshot = store.getSnapshot(),
    admission = snapshot.admission[0];
  if (!admission) return [];
  return snapshot.bodyDescription.flatMap((description) => {
    const motion = interpolate
      ? store.sampleBody(description.bodyId, nowMs)
      : snapshot.bodyMotion.find((row) => row.bodyId === description.bodyId);
    if (!motion || motion.systemId !== admission.systemId) return [];
    return [
      {
        id: description.bodyId,
        key:
          names.get(description.bodyId) ??
          `${description.kind}-${description.bodyId.slice(0, 8)}`,
        kind: description.kind,
        appearance: description.appearance,
        radius: description.radius,
        height: description.height,
        seed: description.seed,
        x: motion.x,
        y: motion.y,
        vx: motion.vx,
        vy: motion.vy,
        heading: motion.heading,
        omega: motion.omega,
      },
    ];
  });
}
export function bodyDestinations(
  bodies: readonly {
    id: string;
    key: string;
    kind: string;
    x: number;
    y: number;
  }[],
) {
  return bodies
    .filter((body) => body.kind === "planet" || body.kind === "star")
    .map(({ id, key, kind, x, y }) => ({
      id,
      kind,
      x,
      y,
      name:
        displayNames.get(id) ??
        key
          .split("-")
          .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
          .join(" "),
    }));
}
