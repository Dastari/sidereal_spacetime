import { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { PartAsset } from "@sidereal/content/assembly";
import manifest from "./instanceable-assets.json";

/** Presentation-only opt-in, pinned to unchanged authored visual bytes. */
export function canInstancePlacement(asset: PartAsset, source: Mesh) {
  const entry = manifest.entries.find((e) => e.assetId === asset.id);
  const material = source.material;
  return (
    !!entry?.instanceable &&
    entry.role === asset.category &&
    entry.visualSha256 === asset.visual?.sha256 &&
    !asset.lights?.length &&
    !source.skeleton &&
    !source.morphTargetManager &&
    !source.hasVertexAlpha &&
    !!material &&
    !("subMaterials" in material) &&
    !material.needAlphaBlendingForMesh(source) &&
    !material.needAlphaTestingForMesh(source) &&
    !(
      "emissiveColor" in material &&
      Object.values(material.emissiveColor as object).some(
        (v) => typeof v === "number" && v !== 0,
      )
    )
  );
}
