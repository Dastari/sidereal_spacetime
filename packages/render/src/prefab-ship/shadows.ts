/** Own the dressed ship's participation in the shared construction-star shadow pass. */
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import type { Observer } from "@babylonjs/core/Misc/observable";

export function createPrefabShadowBinding(generator: ShadowGenerator) {
  const owned = new Map<
    AbstractMesh,
    {
      received: boolean;
      added: boolean;
      observer: Observer<import("@babylonjs/core/node").Node> | null;
    }
  >();
  const remove = (mesh: AbstractMesh) => {
    const entry = owned.get(mesh);
    if (!entry) return;
    if (entry.added) generator.removeShadowCaster(mesh, false);
    mesh.onDisposeObservable.remove(entry.observer);
    if (!mesh.isDisposed()) mesh.receiveShadows = entry.received;
    owned.delete(mesh);
  };
  return {
    sync(meshes: readonly AbstractMesh[]) {
      // Keep both deck/flight sets registered: Babylon excludes disabled geometry at submission.
      // Glass, plumes, labels and other blended/effect geometry do not become opaque occluders.
      const next = new Set(
        meshes.filter(
          (mesh) =>
            !mesh.isDisposed() &&
            mesh.getTotalVertices() > 0 &&
            mesh.metadata?.role !== "effect" &&
            mesh.material &&
            !mesh.material.needAlphaBlendingForMesh(mesh),
        ),
      );
      for (const mesh of owned.keys()) if (!next.has(mesh)) remove(mesh);
      for (const mesh of next) {
        if (owned.has(mesh)) continue;
        const received = mesh.receiveShadows;
        const added = !generator.getShadowMap()?.renderList?.includes(mesh);
        mesh.receiveShadows = true;
        generator.addShadowCaster(mesh, false);
        const observer = mesh.onDisposeObservable.addOnce(() => remove(mesh));
        owned.set(mesh, { received, added, observer });
      }
    },
    dispose() {
      for (const mesh of owned.keys()) remove(mesh);
    },
  };
}
