import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { setMeshRole } from "./mesh-roles";

/** Automatic transparency lets each mesh fade independently on a shared PBR
 * material, while opaque settled surfaces still write depth. Authored paint
 * keeps its alpha-mask mode. Configure once before rendering. */
export function prepareCutawayMeshes(meshes: readonly AbstractMesh[]) {
  for (const mesh of meshes) {
    if (!mesh.metadata?.role) setMeshRole(mesh, "roof");
    if (mesh.material && !mesh.metadata?.hullDecal) {
      mesh.material.unfreeze();
      mesh.material.transparencyMode = null;
    }
  }
}
export function applyCutawayVisibility(mesh: AbstractMesh, visibility: number) {
  const resolved = visibility >= .995 ? 1 : visibility <= .005 ? 0 : visibility;
  mesh.visibility = resolved;
  mesh.setEnabled(resolved > 0);
}
