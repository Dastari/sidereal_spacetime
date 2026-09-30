/** Greedy exposed-face meshing in global ship-local cells. UV phase survives cuts and rebases. */
import type { ShipKitSlot } from "@sidereal/content/ship-kit";
import type {
  ShipVisualRole,
  ShipVisualLayer,
} from "@sidereal/content/ship-visual";
import {
  visualCellKey,
  type VisualVolume,
  type VisualCell,
} from "@sidereal/sim/ship-visual-compiler";
import { sampledCornerLight } from "./sampled-ao";
import { sampledFacetBoundary } from "./sampled-facets";

export interface SampledGeometry {
  surfaceCharts: string[];
  slot: ShipKitSlot;
  role: ShipVisualRole;
  surfaceRole?: ShipVisualLayer["surfaceRole"];
  positions: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
  indices: Uint32Array;
  colors?: Float32Array;
  triangles: number;
}
interface Face {
  u: number;
  v: number;
  family: string;
  normalHint?: readonly [number, number, number];
  chartFace?: boolean;
  lights?: number[];
}
interface Plane {
  axis: number;
  side: number;
  at: number;
  slot: ShipKitSlot;
  role: ShipVisualRole;
  surfaceRole?: ShipVisualLayer["surfaceRole"];
  faces: Map<string, Face>;
}
function faceShading(c: VisualCell, axis: number, side: number) {
  const bit = 1 << (axis * 2 + (side > 0 ? 1 : 0));
  const sideFace = Boolean((c.normalSideFaces ?? 0) & bit),
    shoulderFace = Boolean(c.normalChart && (c.normalFaces ?? 0) & bit);
  const normalHint = shoulderFace
    ? c.normalHint
    : sideFace
      ? c.normalSide!.normal
      : c.normalChart
        ? undefined
        : c.normalHint;
  const chartFace = Boolean((sideFace || shoulderFace) && normalHint);
  const normal = [0, 0, 0];
  normal[axis] = side;
  if (chartFace && normalHint)
    for (let a = 0; a < 3; a++) normal[a] = normalHint[a];
  else if (axis < 2 && normalHint) {
    const dot = side * normalHint[axis];
    if (Math.abs(dot) > 0.3)
      for (let a = 0; a < 3; a++)
        normal[a] = normalHint[a] * (dot < 0 ? -1 : 1);
  }
  return { normalHint, chartFace, normal };
}
export function meshSampledStructure(
  cells: VisualVolume,
  options: { ambientOcclusion?: boolean } = {},
): SampledGeometry[] {
  const facets = sampledFacetBoundary(cells);
  const orderedCells = facets.special.size
    ? [...cells.values()].sort((a, b) => a.z - b.z || a.y - b.y || a.x - b.x)
    : cells.values();
  const planes = new Map<string, Plane>();
  for (const c of orderedCells)
    if (!facets.special.has(visualCellKey(c.x, c.y, c.z)))
      for (let axis = 0; axis < 3; axis++)
        for (const side of [-1, 1]) {
          const p = [c.x, c.y, c.z],
            n = [...p];
          n[axis] += side;
          if (cells.has(visualCellKey(n[0], n[1], n[2]))) continue;
          const at = p[axis] + (side > 0 ? 1 : 0),
            u = (axis + 1) % 3,
            v = (axis + 2) % 3;
          const shaded = faceShading(c, axis, side),
            normalHint = shaded.normalHint;
          const key = `${axis}:${side}:${at}:${c.slot}:${c.role}:${c.surfaceRole ?? ""}`;
          let plane = planes.get(key);
          if (!plane)
            planes.set(
              key,
              (plane = {
                axis,
                side,
                at,
                slot: c.slot,
                role: c.role,
                ...(c.surfaceRole ? { surfaceRole: c.surfaceRole } : {}),
                faces: new Map(),
              }),
            );
          plane.faces.set(`${p[u]},${p[v]}`, {
            u: p[u],
            v: p[v],
            family: c.family,
            normalHint,
            ...(shaded.chartFace ? { chartFace: true } : {}),
            ...(options.ambientOcclusion
              ? {
                  lights: [
                    [0, 0],
                    [1, 0],
                    [1, 1],
                    [0, 1],
                  ].map(([u, v]) =>
                    c.role === "frame" ||
                    normalHint !== undefined ||
                    ["emit_a", "emit_b", "glass"].includes(c.slot)
                      ? 1
                      : sampledCornerLight(
                          cells,
                          [c.x, c.y, c.z],
                          axis,
                          side,
                          u as 0 | 1,
                          v as 0 | 1,
                        ),
                  ),
                }
              : {}),
          });
        }
  const groups = new Map<
    string,
    {
      charts: Set<string>;
      slot: ShipKitSlot;
      role: ShipVisualRole;
      surfaceRole?: ShipVisualLayer["surfaceRole"];
      positions: number[];
      normals: number[];
      uvs: number[];
      indices: number[];
      colors?: number[];
    }
  >();
  for (const plane of planes.values()) {
    const key = `${plane.slot}:${plane.role}:${plane.surfaceRole ?? ""}`;
    let g = groups.get(key);
    if (!g)
      groups.set(
        key,
        (g = {
          charts: new Set(),
          slot: plane.slot,
          role: plane.role,
          ...(plane.surfaceRole ? { surfaceRole: plane.surfaceRole } : {}),
          positions: [],
          normals: [],
          uvs: [],
          indices: [],
          ...(options.ambientOcclusion ? { colors: [] } : {}),
        }),
      );
    g.charts.add(`axis:${plane.axis}:${plane.side}`);
    const faces = [...plane.faces.values()].sort(
      (a, b) => a.v - b.v || a.u - b.u,
    );
    for (const f of faces) {
      if (!plane.faces.has(`${f.u},${f.v}`)) continue;
      const same = (u: number, v: number) =>
        plane.faces.get(`${u},${v}`)?.family === f.family &&
        plane.faces.get(`${u},${v}`)?.chartFace === f.chartFace &&
        plane.faces.get(`${u},${v}`)?.normalHint?.join(",") ===
          f.normalHint?.join(",") &&
        plane.faces.get(`${u},${v}`)?.lights?.join(",") === f.lights?.join(",");
      let width = 1;
      // A straight contact gradient is invariant along the seam. Merge that axis
      // while retaining its two endpoint brightnesses; asymmetric corners stay local.
      const mergeU =
        !f.lights ||
        (f.lights[0] === f.lights[1] && f.lights[3] === f.lights[2]);
      const mergeV =
        !f.lights ||
        (f.lights[0] === f.lights[3] && f.lights[1] === f.lights[2]);
      while (mergeU && same(f.u + width, f.v)) width++;
      let height = 1;
      next: while (mergeV) {
        for (let u = 0; u < width; u++)
          if (!same(f.u + u, f.v + height)) break next;
        height++;
      }
      for (let v = 0; v < height; v++)
        for (let u = 0; u < width; u++)
          plane.faces.delete(`${f.u + u},${f.v + v}`);
      const U = (plane.axis + 1) % 3,
        V = (plane.axis + 2) % 3,
        normal = [0, 0, 0];
      normal[plane.axis] = plane.side;
      if (f.chartFace && f.normalHint) {
        // Intact analytic tread/riser ownership was qualified above. No dot threshold:
        // a shallow roof has a small lateral normal component but still owns its step riser.
        for (let a = 0; a < 3; a++) normal[a] = f.normalHint[a];
      } else if (plane.axis < 2 && f.normalHint) {
        const dot = normal[plane.axis] * f.normalHint[plane.axis];
        if (Math.abs(dot) > 0.3)
          for (let a = 0; a < 3; a++)
            normal[a] = f.normalHint[a] * (dot < 0 ? -1 : 1);
      }
      const base = g.positions.length / 3;
      const corners = [
        [f.u, f.v],
        [f.u + width, f.v],
        [f.u + width, f.v + height],
        [f.u, f.v + height],
      ];
      for (const [corner, [u, v]] of corners.entries()) {
        const p = [0, 0, 0];
        p[plane.axis] = plane.at;
        p[U] = u;
        p[V] = v;
        g.positions.push(p[0] / 16, p[1] / 16, p[2] / 16);
        g.normals.push(...normal);
        g.uvs.push(u / 16, (plane.side * v) / 16);
        if (g.colors) {
          const light = f.lights![corner];
          g.colors.push(light, light, light, 1);
        }
      }
      // Geometry stays in the global prefab frame; ship-view applies its origin frame once.
      const brighterOtherDiagonal =
        f.lights && f.lights[0] + f.lights[2] < f.lights[1] + f.lights[3];
      const triangles = brighterOtherDiagonal
        ? [0, 1, 3, 1, 2, 3]
        : [0, 1, 2, 0, 2, 3];
      for (let t = 0; t < triangles.length; t += 3) {
        const a = base + triangles[t],
          b = base + triangles[t + 1],
          c = base + triangles[t + 2];
        g.indices.push(a, plane.side > 0 ? b : c, plane.side > 0 ? c : b);
      }
    }
  }
  for (const face of facets.polygons) {
    const c = face.cell,
      key = `${c.slot}:${c.role}:${c.surfaceRole ?? ""}`;
    let g = groups.get(key);
    if (!g)
      groups.set(
        key,
        (g = {
          charts: new Set(),
          slot: c.slot,
          role: c.role,
          ...(c.surfaceRole ? { surfaceRole: c.surfaceRole } : {}),
          positions: [],
          normals: [],
          uvs: [],
          indices: [],
          ...(options.ambientOcclusion ? { colors: [] } : {}),
        }),
      );
    g.charts.add(face.plane ? `facet:${face.plane}` : "facet:hard-interface");
    const base = g.positions.length / 3;
    const axis = face.normal.findIndex((n) => n !== 0),
      u = (axis + 1) % 3,
      v = (axis + 2) % 3;
    const shaded = face.unchangedRaw
      ? faceShading(c, axis, face.normal[axis] > 0 ? 1 : -1)
      : undefined;
    for (const p of face.points) {
      g.positions.push(...p.map((n) => n / 16));
      g.normals.push(...(shaded?.normal ?? face.normal));
      g.uvs.push(p[u] / 16, ((face.normal[axis] > 0 ? 1 : -1) * p[v]) / 16);
      if (g.colors) {
        const light =
          face.plane ||
          c.role === "frame" ||
          shaded?.normalHint !== undefined ||
          ["glass", "emit_a", "emit_b"].includes(c.slot)
            ? 1
            : sampledCornerLight(
                cells,
                [c.x, c.y, c.z],
                axis,
                face.normal[axis] > 0 ? 1 : -1,
                p[u] > [c.x, c.y, c.z][u] ? 1 : 0,
                p[v] > [c.x, c.y, c.z][v] ? 1 : 0,
              );
        g.colors.push(light, light, light, 1);
      }
    }
    for (let i = 1; i < face.points.length - 1; i++)
      g.indices.push(base, base + i, base + i + 1);
  }
  return [...groups.values()].map((g) => {
    const { colors, ...geometry } = g;
    return {
      ...geometry,
      surfaceCharts: [...g.charts],
      positions: Float32Array.from(g.positions),
      normals: Float32Array.from(g.normals),
      uvs: Float32Array.from(g.uvs),
      indices: Uint32Array.from(g.indices),
      triangles: g.indices.length / 3,
      ...(colors ? { colors: Float32Array.from(colors) } : {}),
    };
  });
}
