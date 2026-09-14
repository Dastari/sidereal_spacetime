import kit from "@sidereal/content/construction-floor-interfaces.json";
import {
  FLOOR_SHAPES,
  stampTile,
  transformPoint,
  type Shape,
  type Point,
} from "@sidereal/content/ship-layout";

export type FloorStamp = Shape | `native:${string}`;
const labels: Record<string, string> = {
  "square-2m": "Square · 2 × 2 m",
  "half-2x1": "Half · 2 × 1 m",
  "quarter-1m": "Quarter · 1 × 1 m",
  "strip-4x1": "Strip · 4 × 1 m",
  "triangle-45": "Triangle · 2 × 2 m",
  "triangle-1m": "Triangle · 1 × 1 m",
  "triangle-long-left": "Long triangle · left",
  "triangle-long-right": "Long triangle · right",
  "triangle-slim-left": "Slim triangle · left",
  "triangle-slim-right": "Slim triangle · right",
  "corner-clipped": "Clipped corner · 2 m",
  "taper-4m": "Taper · 4 m",
};
/** Exact existing native footprints; editor stamps do not grant wall qualification. */
export const NATIVE_FLOOR_STAMPS = kit.parts
  .filter((p) => p.role === "floor")
  .map((p) => ({
    id: `native:${p.id}` as FloorStamp,
    partId: p.id,
    label: labels[p.id] ?? p.id,
    vertices: p.footprint.map(([x, y]): Point => [x, y]),
    shape: (p.footprint.length === 3
      ? "triangle"
      : p.footprint.length > 4
        ? "polygon"
        : p.id.startsWith("taper")
          ? "trapezoid"
          : "rectangle") as Shape,
  }));
export function floorStampDefinition(id: FloorStamp) {
  if (Object.hasOwn(FLOOR_SHAPES, id))
    return { ...FLOOR_SHAPES[id as Shape], shape: id as Shape };
  const part = NATIVE_FLOOR_STAMPS.find((p) => p.id === id);
  if (!part) throw Error("Unknown floor stamp; choose a catalogue tile.");
  return part;
}
export function stampFloor(
  id: string,
  deckId: string,
  stamp: FloorStamp,
  at: Point,
  turns = 0,
) {
  const part = floorStampDefinition(stamp);
  const tile = stampTile(id, deckId, part.shape, at, turns);
  tile.vertices = part.vertices.map((p) => {
    const q = transformPoint(p, turns);
    return [q[0] + at[0], q[1] + at[1]];
  });
  return tile;
}
export function floorStampSpacing(stamp: FloorStamp, turns: number): Point {
  const vertices = floorStampDefinition(stamp).vertices.map((p) =>
    transformPoint(p, turns),
  );
  return [0, 1].map(
    (i) =>
      Math.max(...vertices.map((p) => p[i])) -
      Math.min(...vertices.map((p) => p[i])),
  ) as Point;
}
