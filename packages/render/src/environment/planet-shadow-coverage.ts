import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";

/** Conservative world-space envelope, evaluated when the active selection changes.
 * Authored bounds include rings and raised terrain without reading vertex buffers.
 */
export function planetShadowCoverage(
  root: TransformNode,
  meshes: readonly AbstractMesh[],
  minimumRadius: number,
): number {
  root.computeWorldMatrix(true);
  const center = root.getAbsolutePosition();
  let extent = minimumRadius;
  for (const mesh of meshes) {
    mesh.computeWorldMatrix(true);
    const authoredRadius = mesh.metadata?.planetShadowRadius;
    if (Number.isFinite(authoredRadius) && authoredRadius > 0) {
      const scale = mesh.absoluteScaling;
      extent = Math.max(
        extent,
        Vector3.Distance(center, mesh.getAbsolutePosition()) +
          authoredRadius *
            Math.max(Math.abs(scale.x), Math.abs(scale.y), Math.abs(scale.z)),
      );
      continue;
    }
    const sphere = mesh.getBoundingInfo().boundingSphere;
    const radius =
      Vector3.Distance(center, sphere.centerWorld) + sphere.radiusWorld;
    if (Number.isFinite(radius)) extent = Math.max(extent, radius);
  }
  return extent;
}
