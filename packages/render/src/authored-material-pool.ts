import type { AssetContainer } from "@babylonjs/core/assetContainer";
import type { Scene } from "@babylonjs/core/scene";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import type { Material } from "@babylonjs/core/Materials/material";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";

/** Load-time ownership transfer for immutable, untextured equipment/cargo only.
 * Call before creating placements. The caller owns every supplied container and
 * promises no later per-placement material mutation. The returned owner outlives
 * all placements and containers. Names and every serialized PBR setting survive.
 */
export function poolAuthoredMaterials(
  scene: Scene,
  containers: readonly AssetContainer[],
  immutableSources: ReadonlySet<Mesh>,
) {
  const owned = new Set<Material>();
  const groups = new Map<string, PBRMaterial[]>();
  const meshes = new Set(containers.flatMap((c) => c.meshes));
  const materials = new Set(containers.flatMap((c) => c.materials));
  for (const material of materials) {
    // glTF animation groups can target properties without material.animations.
    if (
      containers.some(
        (c) => c.materials.includes(material) && c.animationGroups.length,
      )
    )
      continue;
    if (
      !(material instanceof PBRMaterial) ||
      material.getClassName() !== "PBRMaterial" ||
      material.getActiveTextures().length ||
      material.animations?.length ||
      material.isFrozen ||
      material.imageProcessingConfiguration !==
        scene.imageProcessingConfiguration ||
      material.clipPlane ||
      material.clipPlane2 ||
      material.clipPlane3 ||
      material.clipPlane4 ||
      material.clipPlane5 ||
      material.clipPlane6 ||
      material.metadata?.mutableMaterial ||
      material.onBindObservable.hasObservers() ||
      material.onUnBindObservable.hasObservers()
    )
      continue;
    // Serialized built-in PBR plugins are supported. Custom callbacks/plugins
    // need their own sharing contract, even if they serialize identically.
    const builtins = new Set([
      material.brdf,
      material.clearCoat,
      material.iridescence,
      material.anisotropy,
      material.sheen,
      material.subSurface,
      material.detailMap,
    ]);
    const plugins =
      (material.pluginManager as unknown as { _plugins?: unknown[] })
        ?._plugins ?? [];
    if (
      plugins.some((p) => !builtins.has(p as typeof material.brdf)) ||
      typeof material.customShaderNameResolve === "function"
    )
      continue;
    const users = [...meshes].filter((m) => m.material === material);
    if (
      !users.length ||
      users.some(
        (m) =>
          !immutableSources.has(m as Mesh) ||
          !["equipment", "cargo"].includes(m.metadata?.role) ||
          m.skeleton ||
          m.morphTargetManager ||
          m.animations.length ||
          m.bakedVertexAnimationManager ||
          m.metadata?.mutableMaterial ||
          m.metadata?.cutawayFade ||
          material.needAlphaBlendingForMesh(m) ||
          material.needAlphaTestingForMesh(m),
      )
    )
      continue;
    // Never adopt a material used by another scene owner or a MultiMaterial.
    if (
      scene.meshes.some((m) => !meshes.has(m) && m.material === material) ||
      [
        ...scene.multiMaterials,
        ...containers.flatMap((c) => c.multiMaterials),
      ].some((m) => m.subMaterials.includes(material))
    )
      continue;
    const roles = new Set(users.map((m) => m.metadata.role));
    if (roles.size !== 1) continue;
    const description = material.serialize();
    delete description.id;
    delete description.uniqueId;
    const key = JSON.stringify([users[0].metadata.role, description]);
    const group = groups.get(key) ?? [];
    group.push(material);
    groups.set(key, group);
  }
  let removed = 0;
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const canonical = group[0];
    const originals = new Set(group);
    // Remove ownership before disposal: one container may be disposed before
    // another while its meshes still share the canonical material.
    for (const container of containers)
      container.materials = container.materials.filter(
        (m) => !originals.has(m as PBRMaterial),
      );
    for (const material of group) material._parentContainer = null;
    owned.add(canonical);
    for (const mesh of meshes)
      if (originals.has(mesh.material as PBRMaterial))
        mesh.material = canonical;
    if (!scene.materials.includes(canonical)) scene.addMaterial(canonical);
    for (const duplicate of group.slice(1)) {
      duplicate.dispose(false, false);
      removed++;
    }
  }
  return {
    removed,
    dispose() {
      for (const material of owned) material.dispose(false, false);
      owned.clear();
    },
  };
}
