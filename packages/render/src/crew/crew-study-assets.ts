import { SceneLoader } from "@babylonjs/core/Loading/sceneLoader";
import type { Scene } from "@babylonjs/core/scene";
import type { AssetContainer } from "@babylonjs/core/assetContainer";
import { CREW_STUDY, crewStudyUrl } from "@sidereal/content/crew-study";

const animations = new WeakMap<Scene, Promise<AssetContainer>>();
/** Parse the pinned animation GLB once per scene; actors clone tracks onto their own joints. */
export function loadStudyAnimations(scene: Scene) {
  let promise = animations.get(scene);
  if (!promise) {
    promise = SceneLoader.LoadAssetContainerAsync(
      "",
      crewStudyUrl(CREW_STUDY.animation.file),
      scene,
      undefined,
      ".glb",
    );
    animations.set(scene, promise);
    promise
      .then((container) => {
        if (scene.isDisposed) container.dispose();
        else scene.onDisposeObservable.addOnce(() => container.dispose());
      })
      .catch(() => animations.delete(scene));
  }
  return promise;
}
