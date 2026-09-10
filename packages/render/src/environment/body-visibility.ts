import type { Plane } from "@babylonjs/core/Maths/math.plane";
import type { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Camera } from "@babylonjs/core/Cameras/camera";
import { Frustum } from "@babylonjs/core/Maths/math.frustum";

export function updateBodyRangePlane(camera: Camera | null, plane: Plane) {
  if (!camera || camera.maxZ <= 0) return undefined;
  camera.getViewMatrix();
  camera.getProjectionMatrix();
  Frustum.GetFarPlaneToRef(camera.getTransformationMatrix(), plane);
  return plane;
}

/** Conservative envelope includes rings, atmosphere billboards and weather.
 * This is range admission only; ordinary mesh frustum culling stays in place. */
export function bodyWithinRenderRange(center: Vector3, radius: number, projectedRadius: number, far?: Plane) {
  const envelope = radius * 8;
  return projectedRadius * 8 >= 0.125 && (!far || far.dotCoordinate(center) >= -envelope);
}
export function setBodyRenderEnabled(node: TransformNode | undefined, enabled: boolean) {
  if (node && node.isEnabled(false) !== enabled) node.setEnabled(enabled);
}
