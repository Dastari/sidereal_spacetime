import { SOLAR_SYSTEM } from "./solar-system";
import { SPACE_VISTAS } from "./environment";
export const MAP_WORKSPACE = "universe-map";
export const MAP_BACKGROUNDS = SPACE_VISTAS.map(
  ({ id, name, nebulaAsset }) => ({
    id,
    name,
    asset: nebulaAsset ?? "veil-nebula-v1.png",
  }),
);
export const MAP_RESOURCES = [
  "iron",
  "nickel",
  "copper",
  "silicate",
  "ice",
  "uranium",
] as const;
export interface MapPoint {
  x: number;
  y: number;
  height: number;
}
export interface MapBody extends MapPoint {
  id: string;
  name: string;
  kind: string;
  radius: number;
}
export interface AsteroidField extends MapPoint {
  id: string;
  name: string;
  shape: "ellipsoid" | "box" | "polygon";
  /** Full dimensions, metres. Polygon XY dimensions come from vertices. */
  width: number;
  length: number;
  depth: number;
  vertices: { x: number; y: number }[];
  density: number;
  seed: number;
  minRadius: number;
  maxRadius: number;
  resources: { resource: string; chance: number }[];
}
export interface SystemMapDocument {
  version: 1;
  id: string;
  name: string;
  center: MapPoint;
  radius: number;
  backgroundId: string;
  bodies: MapBody[];
  fields: AsteroidField[];
}
export interface FieldAsteroid extends MapPoint {
  id: string;
  fieldId: string;
  radius: number;
  seed: number;
  resources: string[];
}
export function newSystemMap(
  id: string,
  bodies: MapBody[] = [],
): SystemMapDocument {
  const radius = Math.max(
    10000,
    ...bodies.map((b) => Math.hypot(b.x, b.y, b.height) + b.radius + 1000),
  );
  return {
    version: 1,
    id,
    name: "New system",
    center: { x: 0, y: 0, height: 0 },
    radius,
    backgroundId: "helion-reach",
    bodies,
    fields: [],
  };
}
export function newAsteroidField(id: string, x = 0, y = 0): AsteroidField {
  return {
    id,
    name: "Asteroid field",
    shape: "ellipsoid",
    x,
    y,
    height: 0,
    width: 1000,
    length: 1000,
    depth: 500,
    vertices: [],
    density: 100,
    seed: 1,
    minRadius: 2,
    maxRadius: 8,
    resources: [
      { resource: "iron", chance: 35 },
      { resource: "ice", chance: 15 },
    ],
  };
}

export function mapBodyName(id: string, fallback: string) {
  return SOLAR_SYSTEM.bodies.find((b) => b.id === id)?.name ?? fallback;
}
export function mapBodyRole(body: Pick<MapBody, "id" | "kind">) {
  const source = SOLAR_SYSTEM.bodies.find((b) => b.id === body.id),
    parent = SOLAR_SYSTEM.bodies.find((b) => b.id === source?.parentId);
  return parent && parent.kind !== "star" ? "moon" : body.kind;
}
