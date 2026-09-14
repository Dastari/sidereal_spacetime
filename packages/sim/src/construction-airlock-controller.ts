import {
  transitionAirlock,
  type AirlockSide,
  type AirlockPressure,
} from "./construction-topology";
import {
  sealedDoorMotionStep,
  validateSealedDoorMotion,
  type SealedDoorMotion,
  type SealMotionPolicy,
} from "./construction-seal-motion";

/** Pure controller only. World adapters supply current authorized intent, actual
 * gas pressure, installed seal proof, supply state and swept obstruction. */
export interface NativeAirlockState {
  inner: SealedDoorMotion;
  outer: SealedDoorMotion;
  pumpTarget: AirlockSide | null;
}
export interface NativeAirlockContext {
  pressure: AirlockPressure;
  powered: boolean;
  /** Optional per-mechanism actuation scope (e.g. one manual service worker). */
  actuatedSides?: readonly AirlockSide[];
  chamberIntact: boolean;
  sealsQualified: Record<AirlockSide, boolean>;
  motion: Record<
    AirlockSide,
    Omit<SealMotionPolicy, "actuationAllowed" | "deploymentAllowed">
  >;
}
export type NativeAirlockCommand =
  | { kind: "open" | "close" | "startPump"; side: AirlockSide }
  | { kind: "stopPump" };
const sides = ["inner", "outer"] as const;
const closed = (d: SealedDoorMotion) =>
  d.hingeFraction === 0 && d.sealRetraction === 0 && !d.targetOpen;
function validate(state: NativeAirlockState) {
  for (const side of sides) validateSealedDoorMotion(state[side]);
  if (state.pumpTarget !== null && !sides.includes(state.pumpTarget))
    throw Error("Airlock: invalid pump target");
  if (state.inner.targetOpen && state.outer.targetOpen)
    throw Error("Airlock: conflicting opening targets");
}
function mechanical(state: NativeAirlockState, ctx: NativeAirlockContext) {
  return {
    inner: {
      open: !closed(state.inner),
      obstructed:
        ctx.motion.inner.hingeObstructed || ctx.motion.inner.sealObstructed,
      sealIntact: ctx.sealsQualified.inner,
    },
    outer: {
      open: !closed(state.outer),
      obstructed:
        ctx.motion.outer.hingeObstructed || ctx.motion.outer.sealObstructed,
      sealIntact: ctx.sealsQualified.outer,
    },
    powered: ctx.powered,
    chamberBreached: !ctx.chamberIntact,
    pumpTarget: state.pumpTarget,
  };
}
/** Commands reserve a mechanism target, never assert that the leaf has moved.
 * No manual emergency bypass is enabled without a separate qualified contract. */
export function requestNativeAirlock(
  state: NativeAirlockState,
  ctx: NativeAirlockContext,
  command: NativeAirlockCommand,
  authorized: boolean,
): { ok: true; state: NativeAirlockState } | { ok: false; reason: string } {
  validate(state);
  if (!authorized) return { ok: false, reason: "permission" };
  const decision = transitionAirlock(
    mechanical(state, ctx),
    ctx.pressure,
    command,
  );
  if (!decision.ok) return decision;
  const next = {
    ...state,
    inner: { ...state.inner },
    outer: { ...state.outer },
  };
  next.pumpTarget = decision.state.pumpTarget;
  if (command.kind === "open" || command.kind === "close")
    next[command.side].targetOpen = command.kind === "open";
  return { ok: true, state: next };
}
/** Rechecks interlocks while consuming movement, including partly open hinges
 * and partly retracted gaskets. Power loss holds physical support/pose; it never
 * snaps a leaf closed. Gas transfer remains a separate conserved transaction. */
export function stepNativeAirlock(
  state: NativeAirlockState,
  ctx: NativeAirlockContext,
  seconds: number,
): NativeAirlockState {
  validate(state);
  const next = {
    ...state,
    inner: { ...state.inner },
    outer: { ...state.outer },
  };
  if (next.pumpTarget !== null) {
    const check = transitionAirlock(mechanical(state, ctx), ctx.pressure, {
      kind: "startPump",
      side: next.pumpTarget,
    });
    if (!check.ok) next.pumpTarget = null;
  }
  for (const side of sides) {
    const door = state[side];
    const allowed =
      !door.targetOpen ||
      transitionAirlock(
        mechanical({ ...state, pumpTarget: next.pumpTarget }, ctx),
        ctx.pressure,
        { kind: "open", side },
      ).ok;
    next[side] = sealedDoorMotionStep(door, seconds, {
      ...ctx.motion[side],
      actuationAllowed:
        ctx.powered &&
        allowed &&
        (!ctx.actuatedSides || ctx.actuatedSides.includes(side)),
      deploymentAllowed: ctx.sealsQualified[side] && ctx.chamberIntact,
    });
  }
  return next;
}
/** This gate authorizes no teleport and supplies no landing coordinates. The
 * world must separately prove a continuous supported destination in the same
 * accepted instance/deck, or a qualified docking/EVA traversal attachment. */
export function nativeAirlockPassageAllowed(
  state: NativeAirlockState,
  side: AirlockSide,
  gate: {
    authorized: boolean;
    supportedRoute: boolean;
    destinationExposureAllowed: boolean;
  },
) {
  validate(state);
  return (
    gate.authorized &&
    gate.supportedRoute &&
    gate.destinationExposureAllowed &&
    state[side].hingeFraction === 1 &&
    state[side].sealRetraction === 1 &&
    !state[side].blocked
  );
}
