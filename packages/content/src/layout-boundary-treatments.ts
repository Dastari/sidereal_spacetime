import type { Point } from "./ship-layout";

/** These are authored intents. Presence in this list does not certify a native kit. */
export const BOUNDARY_TREATMENTS = [
  "auto",
  "vertical-hull",
  "sloped-hull",
  "low-hull",
  "cockpit-glass",
  "window",
  "bulkhead",
  "airlock",
  "door",
  "ramp",
  "hangar-door",
  "engine-interface",
  "docking-interface",
  "open-bay",
  "open",
  "custom",
] as const;
export type BoundaryTreatmentId = (typeof BOUNDARY_TREATMENTS)[number];
export interface BoundaryTreatmentOverride {
  id: string;
  deckId: string;
  source: "perimeter" | "partition";
  /** Partition ID or exact compiler perimeter anchor at authoring time. */
  sourceAnchorId: string;
  a: Point;
  b: Point;
  treatment: BoundaryTreatmentId;
  /** Internal partition only; left/right are relative to authored a→b. Never inferred from room labels. */
  reservationSide?: "left" | "right" | "center";
  /** Measured above the supporting floor. Missing means the deck's clear height. */
  heightUnits?: number;
  /** Immutable native treatment assembly, not a client assertion of physical roles. */
  native?: { id: string; revision: string; sha256: string };
}
export interface NavigationReservation {
  id: string;
  deckId: string;
  vertices: Point[];
  reason: "nonwalkable" | "insufficient-headroom" | "reserved-access";
}
export interface StructuralDeckProfile {
  deckId: string;
  floorThickness: number;
  clearHeight: number;
  roofThickness: number;
  serviceVoid: number;
  /** Floor-bottom to next floor-bottom; equals the four component heights. */
  pitch: number;
}
