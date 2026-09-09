import { SceneLoader } from "@babylonjs/core/Loading/sceneLoader";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Scene } from "@babylonjs/core/scene";
import "@babylonjs/loaders/glTF";
import {
  CONSTRUCTION_BOUNDARY_GLB_SHA,
  CONSTRUCTION_BOUNDARY_URL,
  CONSTRUCTION_BOUNDARY_INTERFACES as kit,
  type ConstructionBoundaryPlacement,
} from "@sidereal/content/construction-boundary";
import { constructionHash } from "@sidereal/sim/construction-transactions";
import { createEquipmentLighting } from "./equipment-lighting";

export interface NativeBoundaryRuntimeKit {
  sha256: string;
  url: string;
  revision: string;
  parts: readonly {
    id: string;
    assetUuid: string;
    native: { nodePrefix: string };
  }[];
}
const defaultKit: NativeBoundaryRuntimeKit = {
  sha256: CONSTRUCTION_BOUNDARY_GLB_SHA,
  url: CONSTRUCTION_BOUNDARY_URL,
  revision: "r001",
  parts: kit.parts,
};

/** Preserve every native primitive's complete bind transform. Multi-material GLB
 * imports can put the hinge on a TransformNode above their primitive meshes. */
export async function loadConstructionBoundaries(
  scene: Scene,
  parent: TransformNode,
  placements: readonly ConstructionBoundaryPlacement[],
  runtimeKit: NativeBoundaryRuntimeKit = defaultKit,
) {
  if (!scene.useRightHandedSystem)
    throw Error(
      "Construction native adapter requires the declared right-handed renderer frame",
    );
  const response = await fetch(runtimeKit.url);
  if (!response.ok) throw Error("Native construction boundaries unavailable");
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (constructionHash(bytes) !== runtimeKit.sha256)
    throw Error("Pinned native boundary GLB hash mismatch");
  const imported = await SceneLoader.ImportMeshAsync(
    "",
    "",
    bytes,
    scene,
    undefined,
    ".glb",
  );
  const sources = imported.meshes.filter(
    (m): m is Mesh => m instanceof Mesh && m.getTotalVertices() > 0,
  );
  const matrices = new Map(
    sources.map((m) => [m, m.computeWorldMatrix(true).clone()]),
  );
  for (const mesh of imported.meshes) {
    mesh.isVisible = false;
    mesh.isPickable = false;
  }
  const hinges = new Map<string, TransformNode>();
  const results = placements.map((p) => {
    const definition = runtimeKit.parts.find((d) => d.id === p.partId);
    if (!definition) throw Error("Unknown pinned boundary component");
    const prefix = definition.native.nodePrefix,
      selected = sources.filter(
        (m) =>
          m.name === prefix ||
          m.name.startsWith(prefix + "_") ||
          m.name.startsWith(prefix + "."),
      );
    if (!selected.length)
      throw Error("Missing native boundary selector " + prefix);
    const id =
      "construction:" +
      constructionHash(
        JSON.stringify([parent.metadata?.instanceId ?? parent.name, p.key]),
      ).slice(0, 32);
    const node = new TransformNode("placement-" + id, scene);
    node.parent = parent;
    node.position.set(p.origin[0] / 32, p.origin[2] / 32, -p.origin[1] / 32);
    node.rotation.y = (p.quarterTurns * Math.PI) / 2;
    node.metadata = {
      partId: id,
      assetId: definition.assetUuid,
      constructionBoundary: true,
      nativeRevision: runtimeKit.revision,
      openingId: p.openingId,
      semanticKey: p.key,
      damageMode: "voxel",
      damageReady: false,
    };
    const moving = p.partId === "door-leaf";
    let primitiveParent = node,
      inverseBind = Matrix.Identity();
    if (moving) {
      if (!p.openingId || hinges.has(p.openingId))
        throw Error("Door leaf requires one unique opening identity");
      const hinge = new TransformNode("hinge-" + p.openingId, scene);
      hinge.parent = node;
      hinge.position = Vector3.FromArray(kit.door.leafBindTranslationGltfM);
      inverseBind = Matrix.Translation(
        -hinge.position.x,
        -hinge.position.y,
        -hinge.position.z,
      );
      primitiveParent = hinge;
      hinges.set(p.openingId, hinge);
    }
    const meshes = selected.map((source) => {
      const mesh = source.clone(
        "GEO-" + id + "--native--" + source.name,
        primitiveParent,
        true,
      )!;
      const transform = matrices.get(source)!.multiply(inverseBind),
        rotation = new Quaternion();
      transform.decompose(mesh.scaling, rotation, mesh.position);
      mesh.rotationQuaternion = rotation;
      mesh.isVisible = true;
      mesh.isPickable = false;
      mesh.receiveShadows = true;
      mesh.metadata = { ...node.metadata };
      return mesh;
    });
    const lighting = createEquipmentLighting(scene, node, []);
    lighting.setMeshes(meshes);
    return { node, meshes, lighting };
  });
  return {
    placements: results,
    meshes: results.flatMap((p) => p.meshes),
    setView(cameraPosition: Vector3, interior: boolean) {
      const local = Vector3.TransformCoordinates(
        cameraPosition,
        Matrix.Invert(parent.computeWorldMatrix(true)),
      );
      results.forEach((result, i) => {
        const p = placements[i],
          dx = local.x - p.origin[0] / 32,
          dy = -local.z - p.origin[1] / 32;
        const visible =
          !interior ||
          !(p.cutawayNormals ?? []).some(([x, y]) => x * dx + y * dy > 1e-6);
        if (result.node.isEnabled() !== visible)
          result.node.setEnabled(visible);
      });
    },
    setDoors(states: readonly { openingId: string; fraction: number }[]) {
      const current = new Map(states.map((s) => [s.openingId, s.fraction]));
      for (const [id, hinge] of hinges) {
        const fraction = current.get(id) ?? 0;
        hinge.rotation.y = Number.isFinite(fraction)
          ? (Math.max(0, Math.min(1, fraction)) *
              kit.door.openAngleDegrees *
              Math.PI) /
            180
          : 0;
      }
    },
  };
}
