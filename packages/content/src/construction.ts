import type { LayoutDocument } from "./ship-layout";
import type { InterfacePlacement } from "./tileset-interfaces";
export const CONSTRUCTION_SCHEMA = "sidereal.construction.v1" as const;
export const CONSTRUCTION_COMPILER = "construction-1" as const;
export const CONSTRUCTION_LIMITS = {
  bytes: 262144,
  decks: 8,
  floors: 512,
  parts: 1000,
  grants: 64,
  receipts: 4096,
} as const;
export type ConstructionCapability =
  | "draft.read"
  | "draft.write"
  | "blueprint.publish"
  | "instance.spawn"
  | "instance.refit"
  | "instance.capture"
  | "grant.manage";
export interface ConstructionGrant {
  id: string;
  principal: string;
  workspaceId: string;
  capability: ConstructionCapability;
  expiresMicros: bigint | null;
  revoked: boolean;
}
export interface ConstructionFloor extends InterfacePlacement {
  deckId: string;
}
export interface NativeStairRoomBinding {
  pin: { id: string; revision: string; sha256: string };
  lowerDeckId: string;
  upperDeckId: string;
  stairId: string;
  parts: { id: string; sourcePartId: string }[];
  apertures: { id: string; sourceApertureId: string }[];
  supports: { id: string; sourceSupportId: string }[];
}
/** Source and semantic geometry must agree. Native visual placements never infer floor topology. */
export interface ConstructionDocument {
  schema: typeof CONSTRUCTION_SCHEMA;
  compiler: typeof CONSTRUCTION_COMPILER;
  layout: LayoutDocument;
  floorKit: { id: string; revision: string; sha256: string };
  floors: ConstructionFloor[];
  /** Optional exact native wall/door candidate. Absence preserves historical floor-only reviews. */
  boundaryKit?: { id: string; revision: string; sha256: string };
  /** Matching native ceiling surfaces only on decks with an authored roof. */
  roofKit?: { id: string; revision: string; sha256: string };
  /** Exact bounded native enclosure review, not a generic pressure flag. */
  /** Exact supported-walking native stair fixture; no pressure qualification. */
  stairRoom?: NativeStairRoomBinding;
  pressureRoom?: { id: string; revision: string; sha256: string };
  /** Exact native two-deck manual traversal fixture; no pressure qualification. */
  traversalRoom?: {
    pin: { id: string; revision: string; sha256: string };
    lowerDeckId: string;
    upperDeckId: string;
    linkId: string;
    parts: { id: string; sourcePartId: string }[];
    apertures: { id: string; sourceApertureId: string }[];
  };
}
export interface ConstructionReadiness {
  geometry: boolean;
  nativeFloors: boolean;
  pressure: boolean;
  services: boolean;
  nativeDamage: boolean;
  flight: boolean;
}
export interface ConstructionSnapshot {
  schema: typeof CONSTRUCTION_SCHEMA;
  compiler: typeof CONSTRUCTION_COMPILER;
  canonical: string;
  sha256: string;
  readiness: ConstructionReadiness;
}
export interface ConstructionReceipt {
  request: string;
  resultId: string;
  revision: bigint;
}
