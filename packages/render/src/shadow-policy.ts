import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { legacyMeshRole } from "./legacy-mesh-role";

/** Retained GLB adapter. Published placements supply explicit flags at load time. */
export function prepareShadowPolicy(mesh: AbstractMesh) {
  const extras = mesh.metadata?.gltf?.extras ?? mesh.parent?.metadata?.gltf?.extras;
  const layer = extras?.sidereal_layer;
  mesh.metadata = { ...mesh.metadata, role: mesh.metadata?.role ?? legacyMeshRole(mesh) };
  if (typeof layer !== "string") return;
  mesh.metadata.shadowStructural ??= ["walls", "partitions", "cutaway-port",
    "cutaway-starboard", "cutaway-aft", "roof"].includes(layer);
  mesh.metadata.shadowExcluded ??= layer === "markings";
}
export function isStructuralShadowSource(mesh: AbstractMesh) {
  return ["roof", "wall"].includes(mesh.metadata?.role) && !!mesh.metadata?.shadowStructural;
}
