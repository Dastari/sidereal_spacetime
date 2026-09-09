import interfaces from "./construction-roof-interfaces.json";

/** Native candidate geometry is separate from pressure/damage certification. */
export const CONSTRUCTION_ROOF_PIN = {
  id: "shipyard.structure.roof-kit",
  revision: "r001",
  sha256: "ffa320a5edc5b99a45ff50a4d33f94c0346fe87972358a73a4fee8375de68a57",
} as const;
export const CONSTRUCTION_ROOF_GLB_SHA =
  "fe5646a431fcaa21033ca235094188b450c33e55e15735b7834fc18623fb3711";
export const CONSTRUCTION_ROOF_URL = "/assets/construction/roof-r001/kit.glb";
export const CONSTRUCTION_ROOF_INTERFACES = interfaces;
export interface ConstructionRoofPlacement {
  key: string;
  floorId: string;
  partId: string;
  origin: [number, number, number];
  quarterTurns: number;
}
