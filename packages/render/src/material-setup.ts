import type { Scene } from "@babylonjs/core/scene";

/** One synchronous setup transaction. Never hold a scene-wide dirty gate over
 * an asset/network await: the existing scene must remain responsive while loading. */
export function withMaterialSetup<T>(scene: Scene, setup: () => T,
  ..._synchronousOnly: [T] extends [never] ? [] : T extends PromiseLike<unknown> ? [never] : []) : T {
  const previous = scene.blockMaterialDirtyMechanism;
  scene.blockMaterialDirtyMechanism = true;
  try {
    return setup();
  } finally {
    // Babylon flushes all dirty flags once when the outermost block is released.
    scene.blockMaterialDirtyMechanism = previous;
  }
}
