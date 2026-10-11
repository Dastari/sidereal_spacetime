import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";

/** The draw cohort beneath a hidden staging root. Respect disabled child groups
 * and invisible source meshes, but ignore the staging root's own disabled flag. */
export function renderRootMeshes(
  root: TransformNode,
  includeDisabled = false,
): AbstractMesh[] {
  return root.getChildMeshes().filter((mesh) => {
    if (includeDisabled) return mesh.getTotalVertices() > 0;
    if (!mesh.isVisible || mesh.visibility <= 0 || !mesh.getTotalVertices())
      return false;
    for (let node = mesh; node !== root;) {
      if (!node.isEnabled(false)) return false;
      const parent = node.parent;
      if (!parent || parent === root) break;
      node = parent as AbstractMesh;
    }
    return true;
  });
}

/** Checks real material/texture/instance variants and starts pending shaders.
 * Unlike forceCompilationAsync, it owns no SDK timer that outlives revocation. */
export function renderRootReady(root: TransformNode, includeDisabled = false) {
  if (root.isDisposed() || root.getScene().isDisposed) return false;
  let ready = true;
  for (const mesh of renderRootMeshes(root, includeDisabled))
    if (!mesh.isReady(true)) ready = false;
  return ready;
}

/** Startup warming also runs before the render loop exists. Dispose cancels the
 * owned poll immediately; descriptor changes cancel it on the next check. */
export function waitForRenderRoot(
  root: TransformNode,
  current: () => boolean,
  includeDisabled = false,
) {
  const scene = root.getScene();
  return new Promise<boolean>((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let done = false;
    const finish = (ready: boolean, error?: unknown) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      scene.onDisposeObservable.remove(sceneObserver);
      root.onDisposeObservable.remove(rootObserver);
      if (error !== undefined) reject(error);
      else resolve(ready);
    };
    const sceneObserver = scene.onDisposeObservable.add(() => finish(false));
    const rootObserver = root.onDisposeObservable.add(() => finish(false));
    const check = () => {
      if (root.isDisposed() || scene.isDisposed || !current())
        return finish(false);
      try {
        if (renderRootReady(root, includeDisabled)) return finish(true);
        timer = setTimeout(check, 16);
      } catch (error) {
        finish(false, error);
      }
    };
    check();
  });
}
