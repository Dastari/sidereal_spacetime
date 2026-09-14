import { registerInsetNativeMaterials } from "./inset-native-materials";
import { createInsetNativeBatches } from "./inset-native-batches";
import { INSET_VISUAL_PARTS } from "./inset-visual-registry";
import { constructionHash } from "@sidereal/sim/construction-transactions";
import { SceneLoader } from "@babylonjs/core/Loading/sceneLoader";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Quaternion } from "@babylonjs/core/Maths/math.vector";
import type { Scene } from "@babylonjs/core/scene";
import type { AssetContainer } from "@babylonjs/core/assetContainer";
import "@babylonjs/loaders/glTF";
import { registerReferencedSceneMaterial } from "./scene-material-registration";
import { withMaterialSetup } from "./material-setup";

export interface InsetNativeVisualRequest {
  id: string;
  key: string;
  originM: [number, number, number];
  quarterTurns: number;
  /** Derived from a compiled structural edge, never an authority grant. */
  yawRadians?: number;
}
const registry = new Map(INSET_VISUAL_PARTS.map((p) => [p.key, p]));

/** Exact native visual review only; neither placement nor mesh metadata grants physics.
 * Opaque draws batch only exact authored texture/material signatures within this
 * view; original per-placement native clones remain independent for cutaway fades.
 */
export async function loadInsetNativeVisuals(
  scene: Scene,
  parent: TransformNode,
  requests: readonly InsetNativeVisualRequest[],
  options: { signal?: AbortSignal } = {},
): Promise<{
  roots: TransformNode[];
  meshes: Mesh[];
  dispose: () => void;
  batchMetrics?: ReturnType<typeof createInsetNativeBatches>["metrics"];
}> {
  const roots: TransformNode[] = [],
    meshes: Mesh[] = [];
  const containers = new Map<string, AssetContainer>();
  let batches: ReturnType<typeof createInsetNativeBatches> | undefined;
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    batches?.dispose();
    for (const root of roots) root.dispose(false, false);
    for (const container of containers.values()) container.dispose();
  };
  const check = () => {
    if (options.signal?.aborted)
      throw new DOMException("Native visual load aborted", "AbortError");
    if (scene.isDisposed || parent.isDisposed())
      throw Error("Native visual scene disposed");
  };
  if (
    !scene.useRightHandedSystem ||
    parent.getScene() !== scene ||
    requests.length > 4096
  )
    throw Error("Invalid native visual scene or request budget");
  const ids = new Set<string>();
  const selected = requests.map((r) => {
    const part = registry.get(r.key);
    if (
      !part ||
      typeof r.id !== "string" ||
      !r.id ||
      r.id.length > 4096 ||
      ids.has(r.id) ||
      r.originM.length !== 3 ||
      !r.originM.every((v) => Number.isFinite(v) && Math.abs(v) <= 512) ||
      !Number.isInteger(r.quarterTurns) ||
      r.quarterTurns < 0 ||
      r.quarterTurns > 3 ||
      (r.yawRadians !== undefined &&
        (!Number.isFinite(r.yawRadians) ||
          Math.abs(r.yawRadians) > Math.PI * 2))
    )
      throw Error("Unknown native visual key or invalid placement");
    ids.add(r.id);
    return {
      request: { ...r, originM: [...r.originM] as [number, number, number] },
      part,
    };
  });
  try {
    check();
    for (const { part } of selected) {
      if (containers.has(part.url)) continue;
      check();
      const response = await fetch(part.url, { signal: options.signal });
      if (!response.ok) throw Error("Native visual fetch failed: " + part.key);
      const bytes = new Uint8Array(await response.arrayBuffer());
      check();
      if (constructionHash(bytes) !== part.sha256)
        throw Error("Native visual hash mismatch: " + part.key);
      const container = await SceneLoader.LoadAssetContainerAsync(
        "",
        bytes,
        scene,
        undefined,
        ".glb",
      );
      containers.set(part.url, container);
      registerInsetNativeMaterials(container.materials, bytes);
      check();
      if (
        !container.meshes.some(
          (m) => m instanceof Mesh && m.getTotalVertices() > 0,
        )
      )
        throw Error("Native visual has no geometry: " + part.key);
    }
    check();
    withMaterialSetup(scene, () => {
      for (const { request: r, part } of selected) {
        const container = containers.get(part.url)!;
        const root = new TransformNode("inset-native-" + r.id, scene);
        roots.push(root);
        root.parent = parent;
        root.setEnabled(false);
        root.position.set(r.originM[0], r.originM[2], -r.originM[1]);
        root.rotationQuaternion = Quaternion.RotationYawPitchRoll(
          r.yawRadians ?? (r.quarterTurns * Math.PI) / 2,
          0,
          0,
        );
        const role =
          part.kind === "wall"
            ? "wall"
            : part.kind === "roof"
              ? "roof"
              : "floor";
        root.metadata = {
          role,
          partId: r.id,
          nativeKey: r.key,
          nativeRevision: part.family,
          physicalQualification: "unqualified",
          authoringPreview: true,
        };
        for (const source of container.meshes) {
          if (!(source instanceof Mesh) || source.getTotalVertices() === 0)
            continue;
          const matrix = source.computeWorldMatrix(true).clone();
          const mesh = source.clone(
            root.name + "--" + source.name,
            root,
            true,
          )!;
          const rotation = new Quaternion();
          matrix.decompose(mesh.scaling, rotation, mesh.position);
          mesh.rotationQuaternion = rotation;
          mesh.isVisible = true;
          mesh.isPickable = false;
          mesh.receiveShadows = true;
          mesh.metadata = { ...root.metadata };
          registerReferencedSceneMaterial(scene, mesh.material);
          meshes.push(mesh);
        }
      }
      check();
      for (const root of roots) root.setEnabled(true);
    });
    batches = createInsetNativeBatches(scene, parent, meshes);
    meshes.push(...batches.meshes);
    return { roots, meshes, dispose, batchMetrics: batches.metrics };
  } catch (error) {
    dispose();
    throw error;
  }
}
