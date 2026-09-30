/**
 * Static batching for prefab ship views: bakes every thin-instanced kit piece / component
 * primitive and every static slot mesh into ONE mesh per (view tag, material slot, role).
 * Draw calls then scale with the number of slots and roles (tens), not with pieces (hundreds).
 * View toggles stay a setEnabled per merged mesh; roles survive for mesh-role consumers.
 *
 * Pure geometry helpers are exported for tests; `mergeGroups` builds Babylon meshes.
 */
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import {
  appendSurfaceChannels,
  type MutableSurfaceChannels,
  type SurfaceChannels,
} from "./surface-attributes";

export interface MergeGroup extends MutableSurfaceChannels {
  key: string;
  positions: number[];
  normals: number[];
  indices: number[];
}

/** Correct affine normal/tangent transform for explicitly selected detail geometry.
 * Legacy normals retain their existing transform until an opted-in visual revision. */
export function transformSurfaceFrame(
  normal: ArrayLike<number>,
  tangent: ArrayLike<number> | undefined,
  matrix: Matrix,
  normalMatrix?: Matrix,
): { normal: number[]; tangent?: number[] } {
  const determinant = matrix.determinant();
  if (!Number.isFinite(determinant) || Math.abs(determinant) < 1e-12)
    throw Error("Surface transform must be invertible");
  const n = Vector3.TransformNormal(
    Vector3.FromArray(normal),
    normalMatrix ?? Matrix.Transpose(matrix.clone().invert()),
  ).normalize();
  if (!tangent) return { normal: n.asArray() };
  const t = Vector3.TransformNormal(Vector3.FromArray(tangent), matrix);
  t.subtractInPlace(n.scale(Vector3.Dot(t, n))).normalize();
  return {
    normal: n.asArray(),
    tangent: [...t.asArray(), tangent[3] * (determinant < 0 ? -1 : 1)],
  };
}

/** Append `positions/normals/indices` transformed by a 4x4 (Babylon row-vector layout). */
export function appendTransformed(
  group: MergeGroup,
  positions: ArrayLike<number>,
  normals: ArrayLike<number> | null,
  indices: ArrayLike<number>,
  m: ArrayLike<number>,
  channels: SurfaceChannels = {},
  options: { correctNormals?: boolean } = {},
) {
  const base = group.positions.length / 3;
  const M = Matrix.FromArray(m as number[]);
  const p = new Vector3();
  const n = new Vector3();
  const tp = new Vector3();
  const tn = new Vector3();
  const normalMatrix =
    options.correctNormals || channels.tangents
      ? Matrix.Transpose(M.clone().invert())
      : undefined;
  let tangents: number[] | undefined;
  if (channels.tangents && normals) {
    tangents = [];
    for (let i = 0; i < positions.length / 3; i++) {
      const transformed = transformSurfaceFrame(
        [normals[i * 3], normals[i * 3 + 1], normals[i * 3 + 2]],
        [
          channels.tangents[i * 4],
          channels.tangents[i * 4 + 1],
          channels.tangents[i * 4 + 2],
          channels.tangents[i * 4 + 3],
        ],
        M,
        normalMatrix,
      );
      tangents.push(...transformed.tangent!);
    }
  }
  appendSurfaceChannels(
    group,
    { ...channels, tangents },
    base,
    positions.length / 3,
  );
  for (let i = 0; i < positions.length; i += 3) {
    p.set(positions[i], positions[i + 1], positions[i + 2]);
    Vector3.TransformCoordinatesToRef(p, M, tp);
    group.positions.push(tp.x, tp.y, tp.z);
    if (normals) {
      n.set(normals[i], normals[i + 1], normals[i + 2]);
      if (options.correctNormals) {
        tn.copyFromFloats(
          ...(transformSurfaceFrame(n.asArray(), undefined, M, normalMatrix)
            .normal as [number, number, number]),
        );
      } else {
        Vector3.TransformNormalToRef(n, M, tn);
        tn.normalize();
      }
      group.normals.push(tn.x, tn.y, tn.z);
    } else group.normals.push(0, 0, 1);
  }
  // A mirrored transform flips winding; keep front faces outward.
  const flip = M.determinant() < 0;
  for (let i = 0; i < indices.length; i += 3) {
    if (flip)
      group.indices.push(
        base + indices[i],
        base + indices[i + 2],
        base + indices[i + 1],
      );
    else
      group.indices.push(
        base + indices[i],
        base + indices[i + 1],
        base + indices[i + 2],
      );
  }
}

/** Geometry of a mesh in its own local space. */
export function meshGeometry(mesh: Mesh) {
  const positions = mesh.getVerticesData(VertexBuffer.PositionKind);
  const normals = mesh.getVerticesData(VertexBuffer.NormalKind);
  const indices = mesh.getIndices();
  if (!positions || !indices) return null;
  return {
    positions,
    normals: normals ?? null,
    indices,
    uvs: mesh.getVerticesData(VertexBuffer.UVKind) ?? undefined,
    uvs2: mesh.getVerticesData(VertexBuffer.UV2Kind) ?? undefined,
    tangents: mesh.getVerticesData(VertexBuffer.TangentKind) ?? undefined,
  };
}

/** Matrix taking `mesh` local space into its parent's space. */
export function localToParent(mesh: Mesh): Float32Array {
  const world = mesh.computeWorldMatrix(true);
  const parent = mesh.parent
    ? (mesh.parent as Mesh).computeWorldMatrix(true)
    : Matrix.Identity();
  const inv = new Matrix();
  parent.invertToRef(inv);
  return world.multiply(inv).toArray() as Float32Array;
}
