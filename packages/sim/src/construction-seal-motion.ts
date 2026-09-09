/** Sequencing for a retractable gasket and hinged leaf. Geometry/contact, power,
 * permissions and gas conductance are supplied by separate authoritative adapters.
 * A deployed morph is a physical pose, never proof of airtightness. */
export interface SealedDoorMotion {
  hingeFraction: number;
  /** Native SealRetracted weight: 0 deployed, 1 fully retracted. */
  sealRetraction: number;
  targetOpen: boolean;
  blocked: boolean;
}
export interface SealMotionPolicy {
  hingeSeconds: number;
  sealSeconds: number;
  actuationAllowed: boolean;
  deploymentAllowed: boolean;
  hingeObstructed: boolean;
  sealObstructed: boolean;
}
export type SealMotionPhase =
  "retracting" | "opening" | "closing" | "deploying" | "open" | "closed";
function requireState(ok: boolean, message: string): asserts ok {
  if (!ok) throw Error("Construction seal: " + message);
}
export function validateSealedDoorMotion(state: SealedDoorMotion) {
  requireState(
    [state.hingeFraction, state.sealRetraction].every(
      (n) => Number.isFinite(n) && n >= 0 && n <= 1,
    ),
    "invalid fractions",
  );
  requireState(
    typeof state.targetOpen === "boolean" && typeof state.blocked === "boolean",
    "invalid flags",
  );
  requireState(
    state.hingeFraction === 0 || state.sealRetraction === 1,
    "hinge requires fully retracted gasket",
  );
}
export function sealedDoorPhase(state: SealedDoorMotion): SealMotionPhase {
  validateSealedDoorMotion(state);
  if (state.targetOpen) {
    if (state.sealRetraction < 1) return "retracting";
    return state.hingeFraction < 1 ? "opening" : "open";
  }
  if (state.hingeFraction > 0) return "closing";
  return state.sealRetraction > 0 ? "deploying" : "closed";
}
/** Consumes at most one bounded simulation step. Remainder passes across phase
 * boundaries, preserving the timing under subdivision. Never skips an obstruction
 * or uses epsilon to accept a physically nonzero hinge with an extended gasket. */
export function sealedDoorMotionStep(
  state: SealedDoorMotion,
  seconds: number,
  policy: SealMotionPolicy,
): SealedDoorMotion {
  validateSealedDoorMotion(state);
  requireState(
    Number.isFinite(seconds) && seconds >= 0 && seconds <= 0.25,
    "invalid step",
  );
  requireState(
    [policy.hingeSeconds, policy.sealSeconds].every(
      (n) => Number.isFinite(n) && n >= 0.1 && n <= 60,
    ),
    "invalid durations",
  );
  requireState(
    [
      policy.actuationAllowed,
      policy.deploymentAllowed,
      policy.hingeObstructed,
      policy.sealObstructed,
    ].every((v) => typeof v === "boolean"),
    "invalid policy",
  );
  const next = { ...state, blocked: false };
  let remaining = seconds;
  // At most a seal phase plus hinge phase, or hinge plus seal. The third iteration
  // observes the resulting endpoint without authorizing another mechanism.
  for (let i = 0; i < 3; i++) {
    const phase = sealedDoorPhase(next);
    if (phase === "open" || phase === "closed") return next;
    const seal = phase === "retracting" || phase === "deploying";
    const obstructed =
      !policy.actuationAllowed ||
      (seal ? policy.sealObstructed : policy.hingeObstructed) ||
      (phase === "deploying" && !policy.deploymentAllowed);
    if (obstructed) return { ...next, blocked: true };
    if (remaining === 0) return next;
    const key = seal ? "sealRetraction" : "hingeFraction";
    const target = phase === "retracting" || phase === "opening" ? 1 : 0;
    const duration = seal ? policy.sealSeconds : policy.hingeSeconds;
    const needed = Math.abs(target - next[key]) * duration;
    if (remaining >= needed) {
      next[key] = target;
      remaining -= needed;
    } else {
      next[key] += ((target > next[key] ? 1 : -1) * remaining) / duration;
      return next;
    }
  }
  validateSealedDoorMotion(next);
  return next;
}
