import { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { Material } from "@babylonjs/core/Materials/material";

/** Retained hulls are opaque solids and must write depth. Permanent alpha-blend
 * sorting can draw their rear faces over visible service panels even at alpha 1.
 * Only genuinely transitioning geometry belongs in the transparent queue. */
export function applyCutawayVisibility(mesh: AbstractMesh, visibility: number) {
  const resolved = visibility >= .995 ? 1 : visibility <= .005 ? 0 : visibility;
  mesh.visibility = resolved;
  mesh.setEnabled(resolved > 0);
  if (mesh.material) {
    // Painted alpha masks remain transparent at full visibility. Their materials
    // stay shared; per-mesh visibility carries the cutaway fade.
    const mode = resolved === 1 && !mesh.metadata?.hullDecal ? Material.MATERIAL_OPAQUE : Material.MATERIAL_ALPHABLEND;
    if (mesh.material.transparencyMode !== mode) mesh.material.transparencyMode = mode;
  }
}
