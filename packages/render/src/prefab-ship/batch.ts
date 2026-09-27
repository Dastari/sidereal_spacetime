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

export interface MergeGroup {
  key: string;
  positions: number[];
  normals: number[];
  indices: number[];
}

/** Append `positions/normals/indices` transformed by a 4x4 (Babylon row-vector layout). */
export function appendTransformed(
  group: MergeGroup,
  positions: ArrayLike<number>,
  normals: ArrayLike<number> | null,
  indices: ArrayLike<number>,
  m: ArrayLike<number>,
) {
  const base = group.positions.length / 3;
  const M = Matrix.FromArray(m as number[]);
  const p = new Vector3();
  const n = new Vector3();
  const tp = new Vector3();
  const tn = new Vector3();
  for (let i = 0; i < positions.length; i += 3) {
    p.set(positions[i], positions[i + 1], positions[i + 2]);
    Vector3.TransformCoordinatesToRef(p, M, tp);
    group.positions.push(tp.x, tp.y, tp.z);
    if (normals) {
      n.set(normals[i], normals[i + 1], normals[i + 2]);
      Vector3.TransformNormalToRef(n, M, tn);
      tn.normalize();
      group.normals.push(tn.x, tn.y, tn.z);
    } else group.normals.push(0, 0, 1);
  }
  // A mirrored transform flips winding; keep front faces outward.
  const flip = M.determinant() < 0;
  for (let i = 0; i < indices.length; i += 3) {
    if (flip) group.indices.push(base + indices[i], base + indices[i + 2], base + indices[i + 1]);
    else group.indices.push(base + indices[i], base + indices[i + 1], base + indices[i + 2]);
  }
}

/** Geometry of a mesh in its own local space. */
export function meshGeometry(mesh: Mesh) {
  const positions = mesh.getVerticesData(VertexBuffer.PositionKind);
  const normals = mesh.getVerticesData(VertexBuffer.NormalKind);
  const indices = mesh.getIndices();
  if (!positions || !indices) return null;
  return { positions, normals: normals ?? null, indices };
}

/** Matrix taking `mesh` local space into its parent's space. */
export function localToParent(mesh: Mesh): Float32Array {
  const world = mesh.computeWorldMatrix(true);
  const parent = mesh.parent ? (mesh.parent as Mesh).computeWorldMatrix(true) : Matrix.Identity();
  const inv = new Matrix();
  parent.invertToRef(inv);
  return world.multiply(inv).toArray() as Float32Array;
}
