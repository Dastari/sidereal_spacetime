import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { MeshRole } from "./mesh-roles";

/** Import adapter for retained GLB extras. Runtime selectors use role metadata. */
export function legacyMeshRole(
  mesh: Pick<AbstractMesh, "metadata" | "parent">,
): MeshRole {
  const extras =
    mesh.metadata?.gltf?.extras ?? mesh.parent?.metadata?.gltf?.extras;
  const layer = String(extras?.sidereal_layer ?? "");
  switch (layer) {
    case "deck":
      return "floor";
    case "roof":
    case "markings":
      return "roof";
    case "walls":
    case "partitions":
    case "cutaway-port":
    case "cutaway-starboard":
    case "cutaway-aft":
      return "wall";
    case "room-storage-container-2.15-0.25":
    case "room-storage-container-2.15-1":
    case "room-storage-container-3.5-0.25":
    case "room-storage-container-3.5-1":
      return "cargo";
    default:
      return "hull";
  }
}
