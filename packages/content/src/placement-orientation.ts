/** Additive authoring contract only. Existing drafts/readers and asset qualifications
 * are unchanged; callers must explicitly migrate before persisting this form. */
export const YAW_STEPS = 72;
export const YAW_STEP_RADIANS = Math.PI / 36;
export type PlacementPoint = readonly [number, number];

/** Admission never normalizes persisted input. */
export function readYawStep(value: unknown): number {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 0 ||
    value >= YAW_STEPS
  )
    throw Error("Persisted yawStep must be an integer from 0 through 71");
  return value === 0 ? 0 : value;
}

/** UI commands may wrap, but must not accumulate unsafe or fractional integers. */
export function normalizeYawStep(value: number): number {
  if (!Number.isSafeInteger(value))
    throw Error("Yaw command must be a safe integer");
  return ((value % YAW_STEPS) + YAW_STEPS) % YAW_STEPS;
}

export function yawStepRadians(value: number): number {
  return readYawStep(value) * YAW_STEP_RADIANS;
}

export function quarterTurnsToYawStep(value: number): number {
  if (!Number.isInteger(value) || value < 0 || value > 3)
    throw Error("Legacy quarterTurns must be an integer from 0 through 3");
  return value === 0 ? 0 : value * 18;
}

export type LegacyYawClassification = {
  /** The caller supplies the original bytes, not a reserialized source. */
  sourceRaw: string;
  sourceRadians: number;
} & (
  | { status: "representable"; yawStep: number }
  | {
      status: "unresolved";
      reason: string;
      proposal: { yawStep: number; angularDeltaRadians: number } | null;
    }
);

/** Recognize float encoding noise, not an editor snapping tolerance. The allowance
 * is 32 machine epsilons scaled by the source angle, capped at 1e-10 rad. Inputs
 * whose float uncertainty exceeds that cap remain unresolved without a proposal.
 * Even representable results retain source bytes; this function applies no edit.
 * A migration UI must separately calculate anchor/reservation displacement. */
export function classifyLegacyYaw(
  sourceRadians: number,
  sourceRaw: string,
): LegacyYawClassification {
  const source = { sourceRaw, sourceRadians };
  const tolerance = 32 * Number.EPSILON * Math.max(1, Math.abs(sourceRadians));
  if (!Number.isFinite(sourceRadians) || tolerance > 1e-10)
    return {
      ...source,
      status: "unresolved",
      reason: "Non-finite or insufficiently precise legacy angle",
      proposal: null,
    };
  const nearest = Math.round(sourceRadians / YAW_STEP_RADIANS);
  const yawStep = normalizeYawStep(nearest);
  const angularDeltaRadians = nearest * YAW_STEP_RADIANS - sourceRadians;
  if (Math.abs(angularDeltaRadians) <= tolerance)
    return { ...source, status: "representable", yawStep };
  return {
    ...source,
    status: "unresolved",
    reason: "Legacy angle is not representable on the 5 degree lattice",
    proposal: { yawStep, angularDeltaRadians },
  };
}

export interface OrientationCapability {
  allowedYawSteps: readonly number[];
  reflection: "forbidden" | "allowed";
}

/** No missing-capability fallback can accidentally qualify an asset for fine yaw. */
export function orientationCapabilityError(
  yawStep: number,
  reflected: boolean,
  capability: OrientationCapability | undefined,
): string | undefined {
  readYawStep(yawStep);
  if (typeof reflected !== "boolean") throw Error("Reflection must be boolean");
  if (!capability) return "Asset orientation capability is unqualified";
  if (
    !Array.isArray(capability.allowedYawSteps) ||
    capability.allowedYawSteps.length > YAW_STEPS ||
    !["forbidden", "allowed"].includes(capability.reflection)
  )
    throw Error("Invalid orientation capability");
  capability.allowedYawSteps.forEach(readYawStep);
  if (
    new Set(capability.allowedYawSteps).size !==
    capability.allowedYawSteps.length
  )
    throw Error("Duplicate permitted yawStep");
  if (!capability.allowedYawSteps.includes(yawStep))
    return "Asset does not support this yawStep";
  if (reflected && capability.reflection === "forbidden")
    return "Asset does not support reflection";
  return undefined;
}

/** Mirror local east first, then rotate counterclockwise in east/north. This also
 * transforms socket directions. Output stays continuous; never round to lattice. */
export function transformPlacementPoint(
  point: PlacementPoint,
  yawStep: number,
  reflected = false,
): [number, number] {
  readYawStep(yawStep);
  if (
    typeof reflected !== "boolean" ||
    point.length !== 2 ||
    !point.every(Number.isFinite)
  )
    throw Error("Invalid placement point or reflection");
  const cardinal: readonly PlacementPoint[] = [
    [1, 0],
    [0, 1],
    [-1, 0],
    [0, -1],
  ];
  const [c, s] =
    yawStep % 18 === 0
      ? cardinal[yawStep / 18]
      : [Math.cos(yawStepRadians(yawStep)), Math.sin(yawStepRadians(yawStep))];
  const x = reflected ? -point[0] : point[0];
  const result: [number, number] = [c * x - s * point[1], s * x + c * point[1]];
  if (!result.every(Number.isFinite))
    throw Error("Transformed placement point overflow");
  return result.map((n) => (n === 0 ? 0 : n)) as [number, number];
}
