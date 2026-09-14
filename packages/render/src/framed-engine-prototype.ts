import { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { PartAsset } from "@sidereal/content/assembly";

/** One rigid engine remains one placed object. Preserve native material slots
 * and all vertex channels while joining glTF's per-material primitive meshes.
 * This is a load-time prototype operation, never a collision or damage mesh. */
export function framedEnginePrototype(
  asset: PartAsset,
  sources: Mesh[],
): Mesh | undefined {
  if (
    asset.category !== "engine" ||
    asset.visual?.designId !== "shipyard.wayfarer.framed.engines" ||
    sources.length < 2
  )
    return;
  if (
    sources.some(
      (mesh) =>
        mesh.skeleton ||
        mesh.morphTargetManager ||
        mesh.animations.length ||
        mesh.material?.needAlphaBlendingForMesh(mesh) ||
        mesh.material?.needAlphaTestingForMesh(mesh),
    )
  )
    throw Error("Framed engine prototype must remain rigid and opaque");
  const merged = Mesh.MergeMeshes(sources, false, true, undefined, false, true);
  if (!merged) throw Error("Unable to assemble native engine primitives");
  merged.name = "GEO-" + asset.id + "--framed-engine";
  merged.metadata = { ...sources[0].metadata };
  merged.isVisible = false;
  merged.isPickable = false;
  return merged;
}
