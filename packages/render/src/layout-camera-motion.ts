import type { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";

/** Direct manipulation: consume each input once, with no acceleration or coast. */
export function configureLayoutCameraMotion(camera: ArcRotateCamera): void {
  camera.inertia = 0;
  camera.panningInertia = 0;
  // Default 0.9 inertia spreads 10× the input over its decay tail. Preserve
  // that total travel, applying it immediately instead of making controls 10×
  // slower when damping is removed. These are pixels per radian / world metre.
  camera.angularSensibilityX = 100;
  camera.angularSensibilityY = 100;
  camera.panningSensibility = 100;
  camera.wheelPrecision = 1.2;
}
