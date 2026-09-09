import { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Material } from "@babylonjs/core/Materials/material";

/** Static native cargo/hull. Preserve authored vertex channels and material objects;
 * individual placement/gameplay identity belongs to the enclosing TransformNode. */
export function batchStaticMaterials(sources: Mesh[]): Mesh[] {
  const groups = new Map<Material | null, Map<string, Mesh[]>>();
  for (const mesh of sources) {
    if (mesh.skeleton || mesh.morphTargetManager)
      throw new Error("Animated asset cannot use static material batching");
    if (mesh.subMeshes?.some((s) => s.materialIndex !== 0))
      throw new Error("Multi-material mesh requires explicit batch handling");
    // Authored primitives may share a material while carrying different UV,
    // tangent or color channels. Babylon can merge only matching channel sets;
    // preserve those sets rather than stripping or inventing vertex data.
    const signature = mesh.getVerticesDataKinds().sort().join("\0");
    const materialGroups =
      groups.get(mesh.material) ?? new Map<string, Mesh[]>();
    const group = materialGroups.get(signature) ?? [];
    group.push(mesh);
    materialGroups.set(signature, group);
    groups.set(mesh.material, materialGroups);
  }
  return [...groups.values()]
    .flatMap((materialGroups) => [...materialGroups.values()])
    .map((group) => {
      if (group.length === 1) return group[0]!;
      const merged = Mesh.MergeMeshes(group, true, true);
      if (!merged) throw new Error("Native static material batching failed");
      merged.name = group[0]!.name + "--material-batch";
      merged.isVisible = false;
      merged.isPickable = false;
      return merged;
    });
}
