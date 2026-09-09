import interfaces from "./construction-boundary-interfaces.json";
/** Exact native candidate, explicitly opted into an immutable construction document.
 * Approval of numerical geometry does not confer art, sealing or damage readiness. */
export const CONSTRUCTION_BOUNDARY_PIN = Object.freeze({
  id: "shipyard.structure.boundary-kit",
  revision: "r001",
  sha256: "33347b32b1675fee00d36046a05de37013fa32eca6e2a4d671464da3499972d9",
});
export const CONSTRUCTION_BOUNDARY_GLB_SHA =
  "4c631ad5517bf6d6cc88af29aba4a6890808c33effeed4205acb26a022758426";
export const CONSTRUCTION_BOUNDARY_URL =
  "/assets/construction/boundary-r001/kit.glb";
export const CONSTRUCTION_BOUNDARY_INTERFACES = interfaces;
export type ConstructionBoundaryPartId =
  (typeof interfaces.parts)[number]["id"];
export interface ConstructionBoundaryPlacement {
  key: string;
  partId: ConstructionBoundaryPartId;
  origin: [number, number, number];
  quarterTurns: number;
  openingId?: string;
  cutawayNormals?: [number, number][];
}
