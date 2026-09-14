import type { Point, ServiceChannel } from "./ship-layout";

/** Metres never depend on a model's decorative bounds or damage-cell density. */
export const TILESET_INTERFACE_SCHEMA =
  "sidereal.tileset-interface.v1" as const;
export const STRUCTURAL_LATTICE_PER_METER = 32;
export const STRUCTURAL_MODULE_UNITS = 64;
export const TILESET_INTERFACE_LIMITS = {
  coordinate: 8192,
  parts: 2048,
  vertices: 16,
  interfaces: 8192,
} as const;
export type ConstructionRole =
  | "floor"
  | "roof"
  | "pressure-wall"
  | "partition"
  | "armor"
  | "external-system"
  | "interior-equipment"
  | "cargo"
  | "decoration";
export type DamageMode = "voxel" | "entity-health" | "none";
export type LatticePoint3 = [number, number, number];
export type NativeAssetPin = {
  assetId: string;
  revision: string;
  sha256: string;
  nodePrefix?: string;
  sourceToNominal: {
    translation: LatticePoint3;
    quarterTurns: 0 | 1 | 2 | 3;
    reflected: boolean;
  };
};
export type SealPatch = {
  a: Point;
  b: Point;
  bottom: number;
  top: number;
  family: string;
  /** Approved physical rule; null is fitting evidence only. */ definitionId:
    string | null;
};
export type NominalEdge = {
  id: string;
  a: Point;
  b: Point;
  profile: string;
  bottom: number;
  top: number;
  seals: SealPatch[];
};
export type NominalMount = {
  id: string;
  family: string;
  position: LatticePoint3;
  normal: LatticePoint3;
  definitionId: string | null;
};
export type NominalPort = {
  id: string;
  mountId: string;
  channel: ServiceChannel;
  medium: string;
  direction: "in" | "out" | "both";
  definitionId: string | null;
  sealedPenetrationDefinitionId: string | null;
};
export interface NominalPartInterface {
  id: string;
  role: ConstructionRole;
  /** Counter-clockwise convex nominal footprint, canonical minimum-X/minimum-Y origin. */
  footprint: Point[];
  bottom: number;
  top: number;
  quarterTurns: (0 | 1 | 2 | 3)[];
  /** Reflection must be explicitly validated/authored, never inferred from shape symmetry. */
  reflection: "forbidden" | "validated";
  edges: NominalEdge[];
  mounts: NominalMount[];
  ports: NominalPort[];
  native: NativeAssetPin;
  damageMode: DamageMode;
  /** Separate representation; missing means not damage-ready, even with voxel damageMode. */
  damageAdapter: {
    id: string;
    revision: string;
    proxySha256: string;
    nativeClipAdapterId: string;
  } | null;
  structuralDefinitionId: string | null;
}
export interface TilesetInterface {
  schema: typeof TILESET_INTERFACE_SCHEMA;
  id: string;
  revision: string;
  family: string;
  latticePerMeter: typeof STRUCTURAL_LATTICE_PER_METER;
  moduleUnits: typeof STRUCTURAL_MODULE_UNITS;
  coordinateMapping: "BlenderXYZ-to-renderer-XZ-minusY";
  /** Named layer planes in lattice units, not appearance-derived measurements. */
  datums: {
    floorBottom: number;
    floorTop: number;
    roofBottom: number | null;
    roofTop: number | null;
    serviceBottom: number | null;
    serviceTop: number | null;
  };
  profiles: { id: string; mates: string[] }[];
  parts: NominalPartInterface[];
}
export interface InterfacePlacement {
  id: string;
  partId: string;
  origin: LatticePoint3;
  quarterTurns: 0 | 1 | 2 | 3;
  reflected: boolean;
}
export const constructionDamageMode = (role: ConstructionRole): DamageMode =>
  [
    "floor",
    "roof",
    "pressure-wall",
    "partition",
    "armor",
    "external-system",
  ].includes(role)
    ? "voxel"
    : role === "decoration"
      ? "none"
      : "entity-health";

/** Owner decision 2026-09-11. Extends the existing lattice contract; historical
 * centred/outward families retain their original pins and qualification status. */
export const TILESET_WALL_CONVENTION = {
  schema: "sidereal.tileset-wall-convention.v1",
  baseInterfaceSchema: TILESET_INTERFACE_SCHEMA,
  latticePerMeter: STRUCTURAL_LATTICE_PER_METER,
  moduleUnits: STRUCTURAL_MODULE_UNITS,
  boundary: "outer-construction-edge",
  reservationSide: "inside-floorplan",
  thicknessUnits: 8,
  heightQuarters: [1, 2, 3, 4],
  verticalDimensions: "owner-approved-20260911",
  standardDeck: {
    floorThicknessUnits: 6,
    clearHeightUnits: 96,
    roofThicknessUnits: 4,
    serviceVoidUnits: 6,
    pitchUnits: 112,
  },
  smallerDecks: "explicit-profile-and-clearance-qualification",
  nativeQualification: "pending",
} as const;

/** Directed edge and explicit interior side avoid double walls between rooms.
 * Coordinates are structural lattice units. Fractions never round a datum. */
export interface TileWallReservationInput {
  id: string;
  a: Point;
  b: Point;
  interiorSide: "left" | "right";
  floorTop: number;
  fullWallHeight: number;
  heightQuarters: 1 | 2 | 3 | 4;
}
