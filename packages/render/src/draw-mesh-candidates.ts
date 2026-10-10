import type { Scene } from "@babylonjs/core/scene";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { isStaticMaterialUse } from "./static-material-freeze";

/** Cheap admission before Babylon's readiness, world/bounds and LOD work.
 * Membership stays live: hidden banks return on their first visible frame.
 * Explicit shadow/glow/transmission lists and the scene graph are untouched. */
export function createDrawMeshCandidates(
  scene: Scene,
  enabled: () => boolean = () => true,
) {
  const previous = scene.getActiveMeshCandidates;
  const result = { data: [] as AbstractMesh[], length: 0 };
  const emitters = new Set<unknown>();
  const receivers: AbstractMesh[] = [],
    materialUses: AbstractMesh[] = [];
  const drawable = (mesh: AbstractMesh) =>
    !mesh.isDisposed() &&
    mesh.isEnabled() &&
    mesh.isVisible &&
    mesh.visibility > 0;
  let disposed = false;
  const candidates: Scene["getActiveMeshCandidates"] = function () {
    const upstream = previous.call(scene);
    // A custom selector can have observable side effects even for hidden uses.
    if (disposed || !enabled() || typeof scene.customLODSelector === "function")
      return upstream;
    emitters.clear();
    for (const system of scene.particleSystems)
      if (system.isStarted()) emitters.add(system.emitter);
    result.length = 0;
    for (let i = 0; i < upstream.length; i++) {
      const mesh = upstream.data[i];
      if (
        drawable(mesh) ||
        // Hidden shader owners still reset their hardware instance batches.
        mesh.hasInstances ||
        mesh.hasThinInstances ||
        emitters.has(mesh) ||
        mesh.actionManager?.hasSpecificTriggers2(12, 13)
      )
        result.data[result.length++] = mesh;
    }
    result.data.length = result.length;
    return result;
  };
  scene.getActiveMeshCandidates = candidates;
  return {
    // Scene membership and visibility are directly mutable Babylon APIs. Keep
    // this cheap walk live; only admitted uses reach per-material/light work.
    // Re-read at each consumer's boundary so scene animation cannot delay a
    // returning mesh by a frame. Buffers belong to separate consumers.
    receivers() {
      if (!enabled()) return scene.meshes;
      receivers.length = 0;
      for (const mesh of scene.meshes) if (drawable(mesh)) receivers.push(mesh);
      return receivers;
    },
    materialUses() {
      if (!enabled()) return scene.meshes;
      materialUses.length = 0;
      for (const mesh of scene.meshes)
        if (drawable(mesh) || !isStaticMaterialUse(mesh))
          materialUses.push(mesh);
      return materialUses;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (scene.getActiveMeshCandidates === candidates)
        scene.getActiveMeshCandidates = previous;
      result.data.length = result.length = 0;
      emitters.clear();
      receivers.length = materialUses.length = 0;
    },
  };
}
