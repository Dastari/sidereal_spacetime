import type { Scene } from "@babylonjs/core/scene";
import {
  FloatingOriginCurrentScene,
  OverrideMatrixFunctions,
} from "@babylonjs/core/Materials/floatingOriginMatrixOverrides";

/** Babylon 9.25 stores matrix-upload context globally, including across engines.
 * A portrait drawn inside the HUD's onBeforeRender must restore the outer scene.
 * Keep this synchronous: a context lease must never span an await. */
export function withSceneCoordinateContext<T>(
  scene: Scene | undefined,
  draw: () => T,
): T {
  const previousScene = FloatingOriginCurrentScene.getScene;
  const previousEye = FloatingOriginCurrentScene.eyeAtCamera;
  FloatingOriginCurrentScene.getScene = () =>
    scene?.floatingOriginMode ? scene : undefined;
  FloatingOriginCurrentScene.eyeAtCamera = true;
  if (scene?.floatingOriginMode) OverrideMatrixFunctions();
  try {
    return draw();
  } finally {
    FloatingOriginCurrentScene.getScene = previousScene;
    FloatingOriginCurrentScene.eyeAtCamera = previousEye;
    // Disposing the portrait's last scene resets overrides for every engine.
    if (previousScene()?.floatingOriginMode) OverrideMatrixFunctions();
  }
}
