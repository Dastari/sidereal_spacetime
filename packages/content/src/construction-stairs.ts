import type {
  NativeTraversalPart,
  NativeTraversalAperture,
  InstalledTraversalPart,
  InstalledTraversalAperture,
  TraversalPoint3,
  TraversalBounds3,
  NativeTraversalDelivery,
} from "./construction-traversal";

export type StairPoint2 = [number, number];
export interface StairBounds2 {
  min: StairPoint2;
  max: StairPoint2;
}
/** Actual horizontal contact patch in the native audit frame. */
export interface NativeStairSupport {
  id: string;
  partId: string;
  boundsM: StairBounds2;
  topZM: number;
  kind: "lower-landing" | "tread" | "intermediate" | "upper-landing";
  neighbours: string[];
}
/** Conservative evaluated-native solid; never a visible-geometry replacement. */
export interface NativeStairSolid {
  id: string;
  partId: string;
  boundsM: TraversalBounds3;
}
/** All resting positions in fromBoundsM are valid. The target is the same XY
 * position plus advanceM, on toSupportId. Sweeps cover that entire strip.
 * A reverse step is the exact reversed lift/forward/settle path. */
export interface NativeStairStep {
  id: string;
  fromSupportId: string;
  toSupportId: string;
  fromBoundsM: StairBounds2;
  advanceM: StairPoint2;
  /** Feet datum during forward phase, at least max(sourceTop,targetTop). */
  clearanceZM: number;
}
export interface NativeStairAudit {
  schema: "sidereal.native-stair-audit.v1";
  adapterId: string;
  revision: string;
  qualification: {
    nativeMeshMatch: boolean;
    physicalApertures: boolean;
    fullBodyStepSweeps: boolean;
    supportedStops: boolean;
    guardedLandings: boolean;
  };
  body: { radiusM: number; heightM: number };
  decks: {
    lower: { originZ: number; walkingZ: number };
    upper: { originZ: number; walkingZ: number };
  };
  parts: NativeTraversalPart[];
  apertures: NativeTraversalAperture[];
  supports: NativeStairSupport[];
  solids: NativeStairSolid[];
  steps: NativeStairStep[];
  limits: {
    maxRiseM: number;
    maxDropM: number;
    maxAdvanceM: number;
    maxLiftM: number;
  };
}
/** Delivery is trusted build content. Native-art qualification is not owner final
 * signoff; staged/headroom-only audits cannot create a walking compiler. */
export type NativeStairDelivery = NativeTraversalDelivery;
export interface StairInstallation {
  instanceId: string;
  stairId: string;
  instanceRevision: bigint;
  stairRevision: bigint;
  originM: TraversalPoint3;
  quarterTurns: 0 | 1 | 2 | 3;
  lowerDeckId: string;
  upperDeckId: string;
  parts: readonly InstalledTraversalPart[];
  apertures: readonly InstalledTraversalAperture[];
  supports: readonly { id: string; sourceSupportId: string }[];
  /** Server-owned movement tuning, independent of source art ratings. */
  policy: { id: string; walkMps: number; verticalMps: number };
}
