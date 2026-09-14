import type { Point } from "./ship-layout";
/** Authoring units are 1/32 m. This declares design intent, never physical qualification. */
export interface HullEnvelope {
  id: string;
  revision: string;
  name: string;
  width: number;
  length: number;
  height: number;
  /** Minimum structural X/Y and lowest floor-bottom datum. This is not navigation clearance. Armor has separate declared reservations. */
  origin: [number, number, number];
}
export interface FloorStyle {
  material?: string;
  /** Exact native asset revision; assigning this does not qualify its geometry. */
  model?: { assetId: string; revision: string };
}
export interface LayoutStructureV1 {
  schema: "sidereal.layout-structure.v1";
  hull: HullEnvelope;
  /** Wall nodes on supported subdivisions of the 64-unit / 2 m module. */
  grid: 16 | 32 | 64;
  /** Left/right relative to the directed source wall a→b, never camera orientation. */
  wallFaces: Record<string, { left?: string; right?: string }>;
  tileStyles: Record<string, FloorStyle>;
  armor: {
    id: string;
    deckId: string;
    boundaryId: string;
    footprint: Point[];
    bottom: number;
    top: number;
  }[];
}

/** Explicit opt-in. Retained v1 documents keep their original interpretation. */
export interface LayoutStructureV2 extends Omit<LayoutStructureV1, "schema"> {
  schema: "sidereal.layout-structure.v2";
  wallConvention: "inset250-v1";
  boundaryTreatments: import("./layout-boundary-treatments").BoundaryTreatmentOverride[];
  navigationReservations: import("./layout-boundary-treatments").NavigationReservation[];
  deckProfiles: import("./layout-boundary-treatments").StructuralDeckProfile[];
}
export type LayoutStructure = LayoutStructureV1 | LayoutStructureV2;
