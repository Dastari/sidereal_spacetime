import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";
import {
  appendTransformed,
  transformSurfaceFrame,
  type MergeGroup,
} from "./batch";
import type { AuthoredPrimitive } from "./wayfarer-authored-study";

export type ClipPlane = readonly [number, number, number, number];
export type VerticalProfile = {
  bottom: readonly [number, number, number];
  top: readonly [number, number, number];
};
/** Same normalized-height warp for surface vertices and object-owned light sockets. */
export function authoredProfilePoint(
  point: Vector3,
  profile: VerticalProfile,
  origin: readonly [number, number],
) {
  if (![...profile.bottom, ...profile.top].every(Number.isFinite))
    throw Error("Invalid authored vertical profile");
  const [bx, by, bc] = profile.bottom,
    [tx, ty, tc] = profile.top;
  const x = origin[0] - point.z,
    y = origin[1] - point.x,
    s = point.y;
  const bottom = bx * x + by * y + bc;
  const height = (tx - bx) * x + (ty - by) * y + tc - bc;
  if (height <= 1e-8) throw Error("Inverted authored vertical profile");
  const dx = bx + s * (tx - bx),
    dy = by + s * (ty - by);
  return {
    position: new Vector3(point.x, bottom + s * height, point.z),
    jacobian: Matrix.FromArray([
      1,
      -dy,
      0,
      0,
      0,
      height,
      0,
      0,
      0,
      -dx,
      1,
      0,
      0,
      0,
      0,
      1,
    ]),
  };
}
type Vertex = {
  p: number[];
  n: number[];
  uv?: number[];
  uv2?: number[];
  t?: number[];
};
const mix = (a: number[], b: number[], f: number) =>
  a.map((v, i) => v + (b[i] - v) * f);
const unit = (v: number[]) => {
  const l = Math.hypot(...v);
  return l > 1e-12 ? v.map((x) => x / l) : [0, 1, 0];
};
const distance = (v: Vertex, p: ClipPlane) =>
  v.p[0] * p[0] + v.p[1] * p[1] + v.p[2] * p[2] + p[3];
function interpolate(a: Vertex, b: Vertex, f: number): Vertex {
  const n = unit(mix(a.n, b.n, f));
  const t = a.t && b.t ? mix(a.t, b.t, f) : undefined;
  if (t) {
    const dot = t[0] * n[0] + t[1] * n[1] + t[2] * n[2];
    const dir = unit(t.slice(0, 3).map((v, i) => v - dot * n[i]));
    t.splice(0, 3, ...dir);
    t[3] = a.t![3];
  }
  return {
    p: mix(a.p, b.p, f),
    n,
    uv: a.uv && b.uv ? mix(a.uv, b.uv, f) : undefined,
    uv2: a.uv2 && b.uv2 ? mix(a.uv2, b.uv2, f) : undefined,
    t,
  };
}

/** Clip native triangles without losing normal-map channels or reflected winding.
 * Planes are in the transformed renderer-local frame; their positive half-space survives. */
export function clipAuthoredGeometry(
  source: AuthoredPrimitive,
  transform: Matrix,
  planes: readonly ClipPlane[],
  profile?: VerticalProfile,
  origin: readonly [number, number] = [0, 0],
): AuthoredPrimitive {
  if (
    !planes.every(
      (p) =>
        p.length === 4 &&
        p.every(Number.isFinite) &&
        Math.hypot(...p.slice(0, 3)) > 1e-12,
    )
  )
    throw Error("Invalid authored clipping plane");
  const native: MergeGroup = {
    key: "clip",
    positions: [],
    normals: [],
    indices: [],
  };
  appendTransformed(
    native,
    source.positions,
    source.normals,
    source.indices,
    transform.asArray(),
    source,
    { correctNormals: true },
  );
  if (profile) {
    for (let i = 0; i < native.positions.length / 3; i++) {
      const { position, jacobian } = authoredProfilePoint(
        Vector3.FromArray(native.positions, i * 3),
        profile,
        origin,
      );
      const adjusted = transformSurfaceFrame(
        native.normals.slice(i * 3, i * 3 + 3),
        native.tangents?.slice(i * 4, i * 4 + 4),
        jacobian,
      );
      native.positions[i * 3 + 1] = position.y;
      native.normals.splice(i * 3, 3, ...adjusted.normal);
      if (native.tangents && adjusted.tangent)
        native.tangents.splice(i * 4, 4, ...adjusted.tangent);
    }
  }
  const out: AuthoredPrimitive = {
    positions: [],
    normals: [],
    indices: [],
    ...(native.uvs ? { uvs: [] } : {}),
    ...(native.uvs2 ? { uvs2: [] } : {}),
    ...(native.tangents ? { tangents: [] } : {}),
  };
  const vertex = (i: number): Vertex => ({
    p: native.positions.slice(i * 3, i * 3 + 3),
    n: native.normals.slice(i * 3, i * 3 + 3),
    uv: native.uvs?.slice(i * 2, i * 2 + 2),
    uv2: native.uvs2?.slice(i * 2, i * 2 + 2),
    t: native.tangents?.slice(i * 4, i * 4 + 4),
  });
  for (let i = 0; i < native.indices.length; i += 3) {
    let polygon = native.indices.slice(i, i + 3).map(vertex);
    for (const plane of planes) {
      const result: Vertex[] = [];
      for (let j = 0; j < polygon.length; j++) {
        const a = polygon[j],
          b = polygon[(j + 1) % polygon.length];
        const da = distance(a, plane),
          db = distance(b, plane);
        const ai = da >= -1e-9,
          bi = db >= -1e-9;
        if (ai) result.push(a);
        if (ai !== bi) result.push(interpolate(a, b, da / (da - db)));
      }
      polygon = result;
      if (polygon.length < 3) break;
    }
    for (let j = 1; j + 1 < polygon.length; j++) {
      const tri = [polygon[0], polygon[j], polygon[j + 1]];
      const a = tri[1].p.map((v, k) => v - tri[0].p[k]),
        b = tri[2].p.map((v, k) => v - tri[0].p[k]);
      if (
        Math.hypot(
          a[1] * b[2] - a[2] * b[1],
          a[2] * b[0] - a[0] * b[2],
          a[0] * b[1] - a[1] * b[0],
        ) < 1e-12
      )
        continue;
      for (const v of tri) {
        out.indices.push(out.positions.length / 3);
        out.positions.push(...v.p);
        out.normals.push(...v.n);
        if (out.uvs && v.uv) out.uvs.push(...v.uv);
        if (out.uvs2 && v.uv2) out.uvs2.push(...v.uv2);
        if (out.tangents && v.t) out.tangents.push(...v.t);
      }
    }
  }
  return out;
}

/** Prefab +X fore/+Y port/+Z up planes into the standard ship-local renderer frame. */
export function prefabClipPlanes(
  planes: readonly ClipPlane[],
  origin: readonly [number, number],
): ClipPlane[] {
  return planes.map(([x, y, z, d]) => [
    -y,
    z,
    -x,
    d + x * origin[0] + y * origin[1],
  ]);
}
