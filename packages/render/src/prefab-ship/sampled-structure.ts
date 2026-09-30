/** Greedy exposed-face meshing in global ship-local cells. UV phase survives cuts and rebases. */
import type { ShipKitSlot } from "@sidereal/content/ship-kit";
import type { ShipVisualRole } from "@sidereal/content/ship-visual";
import {
  visualCellKey,
  type VisualVolume,
} from "@sidereal/sim/ship-visual-compiler";

export interface SampledGeometry {
  surfaceCharts: string[];
  slot: ShipKitSlot;
  role: ShipVisualRole;
  positions: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
  indices: Uint32Array;
  triangles: number;
}
interface Face {
  u: number;
  v: number;
  family: string;
  normalHint?: readonly [number, number, number];
}
interface Plane {
  axis: number;
  side: number;
  at: number;
  slot: ShipKitSlot;
  role: ShipVisualRole;
  faces: Map<string, Face>;
}
export function meshSampledStructure(cells: VisualVolume): SampledGeometry[] {
  const planes = new Map<string, Plane>();
  for (const c of cells.values())
    for (let axis = 0; axis < 3; axis++)
      for (const side of [-1, 1]) {
        const p = [c.x, c.y, c.z],
          n = [...p];
        n[axis] += side;
        if (cells.has(visualCellKey(n[0], n[1], n[2]))) continue;
        const at = p[axis] + (side > 0 ? 1 : 0),
          u = (axis + 1) % 3,
          v = (axis + 2) % 3;
        const key = `${axis}:${side}:${at}:${c.slot}:${c.role}`;
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
              faces: new Map(),
            }),
          );
        plane.faces.set(`${p[u]},${p[v]}`, {
          u: p[u],
          v: p[v],
          family: c.family,
          normalHint: c.normalHint,
        });
      }
  const groups = new Map<
    string,
    {
      charts: Set<string>;
      slot: ShipKitSlot;
      role: ShipVisualRole;
      positions: number[];
      normals: number[];
      uvs: number[];
      indices: number[];
    }
  >();
  for (const plane of planes.values()) {
    const key = `${plane.slot}:${plane.role}`;
    let g = groups.get(key);
    if (!g)
      groups.set(
        key,
        (g = {
          charts: new Set(),
          slot: plane.slot,
          role: plane.role,
          positions: [],
          normals: [],
          uvs: [],
          indices: [],
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
        plane.faces.get(`${u},${v}`)?.normalHint?.join(",") ===
          f.normalHint?.join(",");
      let width = 1;
      while (same(f.u + width, f.v)) width++;
      let height = 1;
      next: while (true) {
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
      if (plane.axis < 2 && f.normalHint) {
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
      for (const [u, v] of corners) {
        const p = [0, 0, 0];
        p[plane.axis] = plane.at;
        p[U] = u;
        p[V] = v;
        g.positions.push(p[0] / 16, p[1] / 16, p[2] / 16);
        g.normals.push(...normal);
        g.uvs.push(u / 16, (plane.side * v) / 16);
      }
      // Geometry stays in the global prefab frame; ship-view applies its origin frame once.
      if (plane.side > 0)
        g.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
      else g.indices.push(base, base + 2, base + 1, base, base + 3, base + 2);
    }
  }
  return [...groups.values()].map((g) => ({
    ...g,
    surfaceCharts: [...g.charts],
    positions: Float32Array.from(g.positions),
    normals: Float32Array.from(g.normals),
    uvs: Float32Array.from(g.uvs),
    indices: Uint32Array.from(g.indices),
    triangles: g.indices.length / 3,
  }));
}
