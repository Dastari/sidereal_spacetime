import { systemCenter } from "@sidereal/content/system-map";
import { DEFAULT_SPACE_VISTA } from "@sidereal/content/environment";
import type {
  AsteroidField,
  MapPoint,
  SystemMapDocument,
} from "@sidereal/content/system-map";
import { insidePolygon } from "./system-map";

/** Public presentation geometry only: never resources, population seeds or private bodies. */
export type BackgroundField = Pick<
  AsteroidField,
  | "id"
  | "x"
  | "y"
  | "height"
  | "shape"
  | "width"
  | "length"
  | "depth"
  | "vertices"
  | "backgroundId"
  | "feather"
  | "priority"
>;
export interface SpaceRegion {
  center: MapPoint;
  radius: number;
  backgroundId: string;
  feather?: number;
  fields: BackgroundField[];
}
export interface BackgroundWeight {
  id: string;
  weight: number;
}
export { systemCenter } from "@sidereal/content/system-map";
export function spaceRegion(doc: SystemMapDocument): SpaceRegion {
  const p = systemCenter(doc);
  return {
    center: { x: p.x, y: p.y, height: p.height },
    radius: doc.radius,
    backgroundId: doc.backgroundId,
    feather: doc.feather,
    fields: doc.fields
      .filter((f) => f.backgroundId)
      .map((f) => ({
        id: f.id,
        x: f.x,
        y: f.y,
        height: f.height,
        shape: f.shape,
        width: f.width,
        length: f.length,
        depth: f.depth,
        vertices: f.vertices.map((v) => ({ ...v })),
        backgroundId: f.backgroundId,
        feather: f.feather,
        priority: f.priority,
      })),
  };
}
const smooth = (distance: number, feather: number) => {
  const t =
    feather > 0
      ? Math.max(0, Math.min(1, distance / feather))
      : Number(distance >= 0);
  return t * t * (3 - 2 * t);
};
function edgeDistance(
  x: number,
  y: number,
  a: { x: number; y: number },
  b: { x: number; y: number },
) {
  const dx = b.x - a.x,
    dy = b.y - a.y,
    d = dx * dx + dy * dy;
  const t = d
    ? Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / d))
    : 0;
  return Math.hypot(x - a.x - t * dx, y - a.y - t * dy);
}
export function fieldInteriorDistance(f: BackgroundField, p: MapPoint) {
  const x = p.x - f.x,
    y = p.y - f.y,
    z = p.height - f.height;
  if (f.shape === "ellipsoid")
    return (
      ((1 -
        Math.hypot(x / (f.width / 2), y / (f.length / 2), z / (f.depth / 2))) *
        Math.min(f.width, f.length, f.depth)) /
      2
    );
  const depth = f.depth / 2 - Math.abs(z);
  if (f.shape === "box")
    return Math.min(
      f.width / 2 - Math.abs(x),
      f.length / 2 - Math.abs(y),
      depth,
    );
  const d = Math.min(
    ...f.vertices.map((a, i) =>
      edgeDistance(x, y, a, f.vertices[(i + 1) % f.vertices.length]),
    ),
  );
  return Math.min(insidePolygon({ x, y }, f.vertices) ? d : -d, depth);
}
/** Precompute deterministic ordering/bounds once for a raster or repeated position samples. */
export function prepareSpaceBackground(region: SpaceRegion | undefined) {
  const fields = (region?.fields ?? [])
    .filter((f) => f.backgroundId)
    .sort(
      (a, b) =>
        (a.priority ?? 0) - (b.priority ?? 0) ||
        (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    )
    .map((f) => ({
      field: f,
      minX:
        f.x +
        (f.shape === "polygon"
          ? Math.min(...f.vertices.map((p) => p.x))
          : -f.width / 2),
      maxX:
        f.x +
        (f.shape === "polygon"
          ? Math.max(...f.vertices.map((p) => p.x))
          : f.width / 2),
      minY:
        f.y +
        (f.shape === "polygon"
          ? Math.min(...f.vertices.map((p) => p.y))
          : -f.length / 2),
      maxY:
        f.y +
        (f.shape === "polygon"
          ? Math.max(...f.vertices.map((p) => p.y))
          : f.length / 2),
    }));
  return (p: MapPoint): BackgroundWeight[] => {
    const weights = new Map<string, number>([[DEFAULT_SPACE_VISTA, 1]]);
    const overlay = (id: string, alpha: number) => {
      if (alpha <= 0) return;
      for (const [key, w] of weights) weights.set(key, w * (1 - alpha));
      weights.set(id, (weights.get(id) ?? 0) + alpha);
    };
    if (region) {
      const d =
        region.radius -
        Math.hypot(
          p.x - region.center.x,
          p.y - region.center.y,
          p.height - region.center.height,
        );
      const system = smooth(
        d,
        region.feather ?? Math.min(region.radius * 0.05, 100000),
      );
      overlay(region.backgroundId, system);
      if (system > 0)
        for (const { field: f, minX, maxX, minY, maxY } of fields) {
          if (
            p.x < minX ||
            p.x > maxX ||
            p.y < minY ||
            p.y > maxY ||
            Math.abs(p.height - f.height) > f.depth / 2
          )
            continue;
          overlay(
            f.backgroundId!,
            system *
              smooth(
                fieldInteriorDistance(f, p),
                f.feather ?? Math.min(f.width, f.length, f.depth) * 0.1,
              ),
          );
        }
    }
    return [...weights]
      .filter(([, weight]) => weight > 0)
      .map(([id, weight]) => ({ id, weight }));
  };
}
/** Deep space, system, then higher-priority fields; all weights remain normalized. */
export function resolveSpaceBackground(
  region: SpaceRegion | undefined,
  p: MapPoint,
): BackgroundWeight[] {
  return prepareSpaceBackground(region)(p);
}
