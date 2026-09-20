import { SOLAR_SYSTEM } from "./solar-system";
import { SPACE_VISTAS, DEFAULT_SPACE_VISTA } from "./environment";
export const MAP_WORKSPACE = "universe-map";
export const MAP_BACKGROUNDS = SPACE_VISTAS.map(
  ({ id, name, nebulaAsset }) => ({
    id,
    name,
    asset: id === "deep-space" ? null : (nebulaAsset ?? "veil-nebula-v1.png"),
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
  parentId?: string | null;
  appearance?: string;
  seed?: number;
  id: string;
  name: string;
  kind: string;
  radius: number;
}
export interface AsteroidField extends MapPoint {
  backgroundId?: string;
  feather?: number;
  priority?: number;
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
  primaryStarId?: string;
  feather?: number;
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
  bodies = bodies.map((b) => ({ ...mapBodyMetadata(b.id), ...b }));
  const primary = bodies.find((b) => b.kind === "star");
  const center = primary
    ? { x: primary.x, y: primary.y, height: primary.height }
    : { x: 0, y: 0, height: 0 };
  const radius = Math.max(
    10000,
    ...bodies.map(
      (b) =>
        Math.hypot(b.x - center.x, b.y - center.y, b.height - center.height) +
        b.radius +
        1000,
    ),
  );
  return {
    version: 1,
    id,
    name: "New system",
    center,
    primaryStarId: primary?.id,
    radius,
    backgroundId: DEFAULT_SPACE_VISTA,
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
export function mapBodyRole(
  body: Pick<MapBody, "id" | "kind" | "parentId">,
  bodies?: readonly MapBody[],
) {
  const source = SOLAR_SYSTEM.bodies.find((b) => b.id === body.id);
  const parentId =
    body.parentId === undefined ? source?.parentId : body.parentId;
  const parent =
    bodies?.find((b) => b.id === parentId) ??
    SOLAR_SYSTEM.bodies.find((b) => b.id === parentId);
  return parent && parent.kind !== "star" ? "moon" : body.kind;
}
/** Stable parent-first outline, including malformed/orphan local drafts without hiding data. */
export function mapBodyOutline(bodies: readonly MapBody[]) {
  const result: MapBody[] = [],
    seen = new Set<string>();
  const visit = (b: MapBody) => {
    if (seen.has(b.id)) return;
    seen.add(b.id);
    result.push(b);
    bodies.filter((c) => c.parentId === b.id).forEach(visit);
  };
  bodies
    .filter((b) => !b.parentId || !bodies.some((p) => p.id === b.parentId))
    .forEach(visit);
  bodies.forEach(visit);
  return result;
}

export function mapBodyMetadata(id: string) {
  const b = SOLAR_SYSTEM.bodies.find((b) => b.id === id);
  return b
    ? { parentId: b.parentId, appearance: b.appearance, seed: b.seed }
    : {};
}

/** Move a parent and descendants as one draft operation; orbit guides stay relative. */
export function moveMapBody(
  doc: SystemMapDocument,
  id: string,
  point: MapPoint,
) {
  const body = doc.bodies.find((b) => b.id === id);
  if (!body) return;
  const dx = point.x - body.x,
    dy = point.y - body.y,
    dz = point.height - body.height;
  const moving = new Set([id]);
  for (let i = 0; i < doc.bodies.length; i++)
    for (const b of doc.bodies)
      if (b.parentId && moving.has(b.parentId)) moving.add(b.id);
  for (const b of doc.bodies)
    if (moving.has(b.id)) {
      b.x += dx;
      b.y += dy;
      b.height += dz;
    }
  if (doc.primaryStarId && moving.has(doc.primaryStarId)) {
    const star = doc.bodies.find((b) => b.id === doc.primaryStarId)!;
    doc.center = { x: star.x, y: star.y, height: star.height };
    // Fields are authored in world space and move only through their own controls.
  }
}

export function systemCenter(
  doc: Pick<SystemMapDocument, "center" | "primaryStarId" | "bodies">,
): MapPoint {
  return (
    doc.bodies.find((b) => b.id === doc.primaryStarId && b.kind === "star") ??
    doc.center
  );
}
