import { insidePolygon } from "@sidereal/content/construction-grammar";
import {
  validateShipVisualLayers,
  type ShipVisualLayer,
  type ShipVisualRole,
} from "@sidereal/content/ship-visual";
import type { ShipKitSlot } from "@sidereal/content/ship-kit";

export interface VisualCell {
  x: number;
  y: number;
  z: number;
  role: ShipVisualRole;
  slot: ShipKitSlot;
  family: string;
  normalHint?: readonly [number, number, number];
  normalChart?: string;
  /** Bit axis*2+(positive?1:0); only faces exposed in the intact sampled plate get its analytic normal. */
  normalFaces?: number;
  normalSide?: ShipVisualLayer["normalSide"];
  /** Independent original exposed XY-side mask, frozen before damage removal. */
  normalSideFaces?: number;
  surfaceRole?: ShipVisualLayer["surfaceRole"];
}
export type VisualVolume = Map<string, VisualCell>;
export const visualCellKey = (x: number, y: number, z: number): string =>
  `${x},${y},${z}`;
export const VISUAL_NEIGHBOURS = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
] as const;

export function polygonBoundarySample(
  p: readonly [number, number],
  poly: readonly (readonly [number, number])[],
) {
  let distance = Infinity,
    alongAxis = 0,
    edgeIndex = 0,
    edgeT = 0,
    edgeLength = 0,
    normalHint: [number, number, number] = [0, 0, 0];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i],
      b = poly[(i + 1) % poly.length],
      dx = b[0] - a[0],
      dy = b[1] - a[1],
      length = Math.hypot(dx, dy);
    const t = Math.max(
      0,
      Math.min(
        1,
        ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (length * length || 1),
      ),
    );
    const d = Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
    if (d < distance) {
      distance = d;
      edgeIndex = i;
      edgeT = t;
      edgeLength = length;
      alongAxis = Math.abs(dx) >= Math.abs(dy) ? 0 : 1;
      normalHint = [dy / (length || 1), -dx / (length || 1), 0];
    }
  }
  return { distance, alongAxis, normalHint, edgeIndex, edgeT, edgeLength };
}
export function polygonBoundaryDistance(
  p: readonly [number, number],
  poly: readonly (readonly [number, number])[],
): number {
  return polygonBoundarySample(p, poly).distance;
}

/** Cell centres in the placed global lattice; later role layers win, including explicit voids. */
export function sampleShipVisualLayers(
  layers: readonly ShipVisualLayer[],
  maxCells = 4000000,
): VisualVolume {
  validateShipVisualLayers(layers);
  const cells: VisualVolume = new Map();
  let visits = 0;
  for (const l of layers) {
    const [x0, y0, z0, x1, y1, z1] = l.bounds;
    for (let y = y0; y < y1; y++)
      for (let x = x0; x < x1; x++) {
        const p: [number, number] = [x + 0.5, y + 0.5];
        if (
          l.polygon &&
          (!insidePolygon(l.polygon, p[0], p[1]) ||
            l.holes?.some((h) => insidePolygon(h, p[0], p[1])) ||
            (l.band !== undefined &&
              polygonBoundaryDistance(p, l.polygon) > l.band))
        )
          continue;
        for (let z = z0; z < z1; z++) {
          if (++visits > maxCells * 16)
            throw Error("Visual sampling work exceeds limit");
          const key = visualCellKey(x, y, z);
          if (l.role === "void") cells.delete(key);
          else
            cells.set(key, {
              x,
              y,
              z,
              role: l.role,
              slot: l.slot,
              family: l.support ?? l.id,
              ...(l.normalHint ? { normalHint: l.normalHint } : {}),
              ...(l.normalChart ? { normalChart: l.normalChart } : {}),
              ...(l.surfaceRole ? { surfaceRole: l.surfaceRole } : {}),
              ...(l.normalSide ? { normalSide: l.normalSide } : {}),
            });
          if (cells.size > maxCells) throw Error("Visual volume exceeds limit");
        }
      }
  }
  // Capture original face ownership once. Synthetic removals retain this mask, so fresh
  // damage cuts never inherit intact slope shading. True patch/glass/void edges stay hard.
  for (const c of cells.values()) {
    if (c.normalSide) {
      let sideMask = 0;
      for (let axis = 0; axis < 2; axis++)
        for (const side of [-1, 1]) {
          const bit = 1 << (axis * 2 + (side > 0 ? 1 : 0));
          const p = [c.x, c.y, c.z];
          p[axis] += side;
          if (
            c.normalSide.faces & bit &&
            c.normalSide.normal[axis] * side > 0 &&
            !cells.has(visualCellKey(p[0], p[1], p[2]))
          )
            sideMask |= bit;
        }
      c.normalSideFaces = sideMask;
    }
    if (!c.normalChart || !c.normalHint) continue;
    let mask = 0;
    for (let axis = 0; axis < 3; axis++)
      for (const side of [-1, 1]) {
        const p = [c.x, c.y, c.z];
        p[axis] += side;
        if (cells.has(visualCellKey(p[0], p[1], p[2]))) continue;
        if (axis === 2) {
          if (side > 0) mask |= 1 << (axis * 2 + 1);
          continue;
        }
        const drop =
          Math.ceil(Math.abs(c.normalHint[axis]) / c.normalHint[2]) + 1;
        for (let dz = 1; dz <= drop; dz++) {
          const lower = cells.get(visualCellKey(p[0], p[1], p[2] - dz));
          if (lower?.normalChart === c.normalChart) {
            mask |= 1 << (axis * 2 + (side > 0 ? 1 : 0));
            break;
          }
        }
      }
    c.normalFaces = mask;
  }
  return cells;
}

/** Review fixture only: remove cells first, then retain only components connected to surviving cores. */
export function removeShipVisualCells(
  base: VisualVolume,
  removed: ReadonlySet<string>,
): VisualVolume {
  const result = new Map([...base].filter(([key]) => !removed.has(key)));
  const supported = new Set<string>();
  const queue: VisualCell[] = [];
  for (const [key, c] of result)
    if (c.role === "core" || c.role === "floor" || c.role === "roof") {
      supported.add(key);
      queue.push(c);
    }
  for (let i = 0; i < queue.length; i++)
    for (const n of VISUAL_NEIGHBOURS) {
      const c = queue[i],
        key = visualCellKey(c.x + n[0], c.y + n[1], c.z + n[2]);
      if (supported.has(key)) continue;
      const next = result.get(key);
      if (next) {
        supported.add(key);
        queue.push(next);
      }
    }
  for (const key of result.keys()) if (!supported.has(key)) result.delete(key);
  return result;
}
