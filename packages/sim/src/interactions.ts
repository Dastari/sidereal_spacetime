export type InteractionAction =
  "sit" | "stand" | "set-light-on" | "set-light-off";
/** Reach and offered verbs from the object's pinned interaction definition (X-3b). */
export interface InteractionRules {
  reachM: number;
  verbs: readonly string[];
}
/** Reach of an object without a definition (the seed value). */
export const DEFAULT_INTERACTION_REACH_M = 1.8;
export function validateInteraction(
  kind: string,
  action: string,
  distance: number,
  occupied: boolean,
  seatedByYou: boolean,
  rules?: InteractionRules,
) {
  if (
    !Number.isFinite(distance) ||
    distance > (rules?.reachM ?? DEFAULT_INTERACTION_REACH_M)
  )
    throw new Error("Move closer to the object");
  if (rules && !rules.verbs.includes(action))
    throw new Error("Action unavailable for this object");
  if (kind === "seat" && action === "sit") {
    if (occupied && !seatedByYou) throw new Error("Seat occupied");
    if (seatedByYou) throw new Error("Already sitting");
  } else if (kind === "seat" && action === "stand") {
    if (!seatedByYou) throw new Error("You are not sitting here");
  } else if (!(
    kind === "light" &&
    (action === "set-light-on" || action === "set-light-off")
  ))
    throw new Error("Action unavailable for this object");
}

/** Planar fixture visibility. Door openings remain openings; solid partitions block spill. */
export function interactionLineOfSight(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  partitions: readonly { x: number; y: number; width: number; depth: number }[],
): boolean {
  return !partitions.some((box) => {
    let lo = 0,
      hi = 1;
    for (const [origin, delta, min, max] of [
      [ax, bx - ax, box.x - box.width / 2, box.x + box.width / 2],
      [ay, by - ay, box.y - box.depth / 2, box.y + box.depth / 2],
    ]) {
      if (Math.abs(delta) < 1e-9) {
        if (origin < min || origin > max) return false;
      } else {
        const a = (min - origin) / delta,
          b = (max - origin) / delta;
        lo = Math.max(lo, Math.min(a, b));
        hi = Math.min(hi, Math.max(a, b));
        if (lo > hi) return false;
      }
    }
    return hi > 1e-6 && lo < 1 - 1e-6;
  });
}
