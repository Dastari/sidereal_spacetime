/** Authored native traversal delivery contract. No built-in qualified ladder is
 * declared here: staged art cannot acquire gameplay readiness through this DTO. */
export type TraversalPoint3 = [number, number, number];
export interface TraversalBounds3 {
  min: TraversalPoint3;
  max: TraversalPoint3;
}
export interface NativeTraversalPart {
  id: string;
  sourceId: string;
  nodePrefix: string;
  originM: TraversalPoint3;
  quarterTurns: number;
}
export interface NativeTraversalAperture {
  id: string;
  role: "lower-roof" | "upper-floor";
  boundsM: TraversalBounds3;
}
export interface NativeTraversalAudit {
  schema: "sidereal.native-traversal-audit.v1";
  adapterId: string;
  revision: string;
  qualification: {
    nativeMeshMatch: boolean;
    physicalApertures: boolean;
    capsuleSweepClear: boolean;
    guardedLandings: boolean;
  };
  body: { radiusM: number; heightM: number };
  decks: {
    lower: { originZ: number; walkingZ: number };
    upper: { originZ: number; walkingZ: number };
  };
  parts: NativeTraversalPart[];
  apertures: NativeTraversalAperture[];
  /** Lower standing anchor, climb path, upper standing anchor; feet coordinates. */
  pathM: TraversalPoint3[];
  /** One certified full-body free box per segment, not one enclosing room AABB. */
  corridorFreeBoundsM: TraversalBounds3[];
  landings: {
    lower: { anchorM: TraversalPoint3; freeBoundsM: TraversalBounds3 };
    upper: { anchorM: TraversalPoint3; freeBoundsM: TraversalBounds3 };
  };
}
/** Trusted publication registry input; never reducer parameters. Qualification
 * means delivered native geometry passed its exact audit, not final owner art sign-off. */
export interface NativeTraversalDelivery {
  adapterId: string;
  revision: string;
  status: "staged" | "native-geometry-qualified";
  auditSha256: string;
  sources: Record<string, { sha256: string }>;
}
export interface InstalledTraversalPart extends Omit<
  NativeTraversalPart,
  "id"
> {
  id: string;
  sourcePartId: string;
  sha256: string;
}
export interface InstalledTraversalAperture extends Omit<
  NativeTraversalAperture,
  "id"
> {
  id: string;
  sourceApertureId: string;
  /** Derived from actual installed slab geometry; a hidden intact panel is covered. */
  state: "physical-opening" | "covered";
}
