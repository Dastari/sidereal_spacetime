import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { Scene } from "@babylonjs/core/scene";

export const MESH_ROLES = [
  "hull",
  "roof",
  "floor",
  "wall",
  "equipment",
  "cargo",
  "crew",
  "remote",
  "planet",
  "environment",
  "effect",
  "proxy",
] as const;
export type MeshRole = (typeof MESH_ROLES)[number];
export type MeshRoleCounts = Record<
  MeshRole | "unclassified",
  { active: number; total: number }
>;

/** Role is presentation metadata, independent of placement and reusable asset IDs. */
export function setMeshRole<T extends Pick<AbstractMesh, "metadata">>(
  mesh: T,
  role: MeshRole,
): T {
  mesh.metadata = { ...mesh.metadata, role };
  return mesh;
}

export function categoryMeshRole(category: string): MeshRole {
  switch (category) {
    case "floor":
    case "wall":
    case "roof":
    case "cargo":
      return category;
    case "superstructure":
      return "hull";
    default:
      return "equipment";
  }
}

/** Read only; missing tags stay visible as an audit failure, never guessed by name. */
export function meshesByRole(scene: Scene): MeshRoleCounts {
  const counts = Object.fromEntries(
    [...MESH_ROLES, "unclassified"].map((role) => [
      role,
      { active: 0, total: 0 },
    ]),
  ) as MeshRoleCounts;
  const roleOf = (mesh: AbstractMesh): keyof MeshRoleCounts =>
    MESH_ROLES.includes(mesh.metadata?.role)
      ? mesh.metadata.role
      : "unclassified";
  for (const mesh of scene.meshes) counts[roleOf(mesh)].total++;
  const active = scene.getActiveMeshes();
  for (let i = 0; i < active.length; i++)
    counts[roleOf(active.data[i])].active++;
  return counts;
}
