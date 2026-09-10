import type { Scene } from "@babylonjs/core/scene";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { Quaternion, type Matrix } from "@babylonjs/core/Maths/math.vector";
import { batchOpaqueExterior } from "./remote-exterior-batches";
import { registerReferencedSceneMaterial } from "./scene-material-registration";

export interface NativeWallPrimitive {
  source: Mesh;
  /** Native mesh -> placement-local transform. Never include the placement twice. */
  matrix: Matrix;
  /** Explicit authored decal/ordering boundary, including opaque decals. */
  preserveOrder?: boolean;
}

/** One immutable wall placement only. Sources/materials remain library-owned;
 * returned root and geometry are independently disposable and pickable. */
export function createNativeWallBatches(
  scene: Scene,
  parent: TransformNode,
  identity: {
    partId: string;
    assetId: string;
    category: "wall" | "roof";
    instanceId?: string;
    deckId?: string;
  },
  primitives: readonly NativeWallPrimitive[],
) {
  if (!identity.partId || !identity.assetId || !primitives.length)
    throw Error("Native wall batching requires one explicit placed identity");
  for (const { source, matrix } of primitives) {
    if (
      source.getScene() !== scene ||
      source.skeleton ||
      source.morphTargetManager
    )
      throw Error("Native wall batching requires static meshes from its scene");
    const determinant = matrix.determinant();
    if (!Number.isFinite(determinant) || determinant === 0)
      throw Error("Invalid native wall transform");
  }
  const ordered: NativeWallPrimitive[] = [];
  const opaque: NativeWallPrimitive[] = [];
  for (const p of primitives) {
    const m = p.source.material;
    // Transparency/decal ordering stays per native primitive. Alpha-tested
    // borders are conservative separate surfaces too, not material flattening.
    const separate =
      p.preserveOrder ||
      p.source.metadata?.decal === true ||
      !m ||
      m.needAlphaBlendingForMesh(p.source) ||
      m.needAlphaTestingForMesh(p.source) ||
      m.zOffset !== 0 ||
      m.zOffsetUnits !== 0 ||
      p.source.alphaIndex !== Number.MAX_VALUE;
    (separate ? ordered : opaque).push(p);
  }
  const root = new TransformNode("native-wall-" + identity.partId, scene);
  root.parent = parent;
  root.metadata = {
    ...identity,
    constructionRoof: identity.category === "roof",
    authoritativeEntity: false,
  };
  const meshes: Mesh[] = [];
  let merged: ReturnType<typeof batchOpaqueExterior> | undefined;
  try {
    merged = batchOpaqueExterior(
      scene,
      opaque.map((p) => ({ ...p, placementIds: [identity.partId] })),
    );
    const batchSet = new Set(merged.batches);
    for (const p of [...merged.primitives, ...ordered]) {
      const baked = batchSet.has(p.source);
      const mesh = baked
        ? p.source
        : p.source.clone("native-wall-copy-" + p.source.name, root, true)!;
      meshes.push(mesh);
      mesh.parent = root;
      if (!baked) {
        const q = new Quaternion();
        if (!p.matrix.decompose(mesh.scaling, q, mesh.position))
          throw Error("Native wall ordered transform cannot be decomposed");
        mesh.rotationQuaternion = q;
      }
      mesh.name = "GEO-" + identity.partId + "--wall-batch-" + meshes.length;
      mesh.isVisible = true;
      mesh.isPickable = true;
      registerReferencedSceneMaterial(scene, mesh.material);
      mesh.metadata = {
        ...root.metadata,
        nativeSourceName: baked ? undefined : p.source.name,
      };
    }
    return {
      root,
      meshes,
      metrics: {
        inputGroups: primitives.length,
        outputGroups: meshes.length,
        inputSubMeshes: primitives.reduce(
          (n, p) => n + p.source.subMeshes.length,
          0,
        ),
        outputSubMeshes: meshes.reduce((n, m) => n + m.subMeshes.length, 0),
        triangles: primitives.reduce(
          (n, p) => n + p.source.getTotalIndices() / 3,
          0,
        ),
        materialIdentities: new Set(primitives.map((p) => p.source.material))
          .size,
        orderedPrimitives: ordered.length,
      },
      dispose() {
        root.dispose(false, false);
      },
    };
  } catch (error) {
    root.dispose(false, false);
    for (const mesh of merged?.batches ?? [])
      if (!mesh.isDisposed()) mesh.dispose(false, false);
    throw error;
  }
}
