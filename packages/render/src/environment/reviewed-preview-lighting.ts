import { Color3 } from "@babylonjs/core/Maths/math.color";
import type { Scene } from "@babylonjs/core/scene";
import type { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import type { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";

/** Apply only when the next body is ready and published. */
export function applyReviewedPreviewLighting(
  scene: Scene,
  sun: DirectionalLight,
  fill: HemisphericLight,
  star: boolean,
) {
  sun.intensity = star ? 0.8 : 2.1;
  fill.intensity = star ? 0 : 0.2;
  scene.environmentIntensity = star ? 0 : 0.28;
  sun.diffuse = star ? new Color3(1, 0.87, 0.61) : new Color3(0.93, 0.95, 1);
}
