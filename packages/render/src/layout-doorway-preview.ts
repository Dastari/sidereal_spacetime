import type { Scene } from "@babylonjs/core/scene";
import type { AssetContainer } from "@babylonjs/core/assetContainer";
import { SceneLoader } from "@babylonjs/core/Loading/sceneLoader";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Matrix, Quaternion } from "@babylonjs/core/Maths/math.vector";
import "@babylonjs/loaders/glTF";
import type { LayoutDocument } from "@sidereal/content/ship-layout";
import { constructionHash } from "@sidereal/sim/construction-transactions";
import {
  DOORWAY250_VISUALS,
  DOORWAY250_HINGE_GLTF_M,
} from "@sidereal/content/construction-doorway-visuals";
import { registerReferencedSceneMaterial } from "./scene-material-registration";
import { withMaterialSetup } from "./material-setup";
import {
  planLayoutDoorways,
  type LayoutDoorwayRequest,
  type LayoutDoorwayPlan,
} from "./layout-doorway-plan";
export {
  planLayoutDoorways,
  type LayoutDoorwayRequest,
} from "./layout-doorway-plan";

export interface LayoutDoorwayState {
  openingId: string;
  fraction: number;
  /** Absent authority seal state is retracted. Visibility never grants pressure. */
  sealRetraction?: number;
}

/** Shared game/editor visual loader. Only a caller's accepted state moves a game door.
 * All four authored GLBs retain their native vertices/materials and one shared hinge. */
export async function loadLayoutDoorways(
  scene: Scene,
  parent: TransformNode,
  requests: readonly LayoutDoorwayRequest[],
  options: { signal?: AbortSignal } = {},
) {
  if (
    !scene.useRightHandedSystem ||
    parent.getScene() !== scene ||
    requests.length > 256
  )
    throw Error("Invalid native doorway scene or request budget");
  const ids = new Set<string>();
  for (const request of requests) {
    if (
      !request.openingId ||
      ids.has(request.openingId) ||
      !request.deckId ||
      request.originM.length !== 3 ||
      !request.originM.every((n) => Number.isFinite(n) && Math.abs(n) <= 512) ||
      !Number.isFinite(request.yawRadians)
    )
      throw Error("Invalid native doorway placement");
    ids.add(request.openingId);
  }
  const containers: AssetContainer[] = [],
    roots: TransformNode[] = [],
    meshes: Mesh[] = [];
  const entries: {
    openingId: string;
    root: TransformNode;
    hinge: TransformNode;
    ring: Mesh;
  }[] = [];
  let disposed = false;
  const check = () => {
    if (options.signal?.aborted || disposed)
      throw new DOMException("Doorway load aborted", "AbortError");
    if (scene.isDisposed || parent.isDisposed())
      throw Error("Doorway scene disposed");
  };
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    for (const entry of entries) entry.ring.morphTargetManager?.dispose();
    for (const root of roots) root.dispose(false, false);
    for (const container of containers) container.dispose();
  };
  try {
    check();
    if (requests.length) {
      const files = await Promise.all(
        DOORWAY250_VISUALS.parts.map(async (part) => {
          const response = await fetch(part.url, { signal: options.signal });
          if (!response.ok)
            throw Error("Native doorway fetch failed: " + part.part);
          const bytes = new Uint8Array(await response.arrayBuffer());
          if (constructionHash(bytes) !== part.sha256)
            throw Error("Native doorway hash mismatch: " + part.part);
          return { part, bytes };
        }),
      );
      for (const file of files) {
        check();
        const container = await SceneLoader.LoadAssetContainerAsync(
          "",
          file.bytes,
          scene,
          undefined,
          ".glb",
        );
        containers.push(container);
        check();
        const sources = container.meshes.filter(
          (m): m is Mesh => m instanceof Mesh && m.getTotalVertices() > 0,
        );
        if (!sources.length)
          throw Error("Native doorway geometry missing: " + file.part.part);
        if (
          file.part.part === "gasket" &&
          (sources.length !== 1 ||
            sources[0].morphTargetManager?.numTargets !== 1 ||
            sources[0].morphTargetManager.getTarget(0).name !== "SealRetracted")
        )
          throw Error("Native doorway gasket morph missing");
      }
      withMaterialSetup(scene, () => {
        for (const request of requests) {
          const root = new TransformNode("doorway-" + request.openingId, scene);
          roots.push(root);
          root.parent = parent;
          root.position.set(
            request.originM[0],
            request.originM[2],
            -request.originM[1],
          );
          root.rotation.y = request.yawRadians;
          root.metadata = {
            openingId: request.openingId,
            deckId: request.deckId,
            role: "wall",
            nativeRevision: "r003",
            qualificationRevision: "r004",
            pressureReady: false,
            damageReady: false,
          };
          const hinge = new TransformNode(
            "doorway-hinge-" + request.openingId,
            scene,
          );
          hinge.parent = root;
          hinge.position.set(...DOORWAY250_HINGE_GLTF_M);
          const inverseBind = Matrix.Translation(
            ...(DOORWAY250_HINGE_GLTF_M.map((n) => -n) as [
              number,
              number,
              number,
            ]),
          );
          let ring: Mesh | undefined;
          for (const [i, container] of containers.entries()) {
            const part = DOORWAY250_VISUALS.parts[i];
            const moving = part.part === "leaf" || part.part === "gasket";
            for (const source of container.meshes) {
              if (!(source instanceof Mesh) || source.getTotalVertices() === 0)
                continue;
              const transform = source.computeWorldMatrix(true).clone();
              const mesh = source.clone(
                root.name + "--" + source.name,
                moving ? hinge : root,
                true,
              )!;
              const rotation = new Quaternion();
              (moving ? transform.multiply(inverseBind) : transform).decompose(
                mesh.scaling,
                rotation,
                mesh.position,
              );
              mesh.rotationQuaternion = rotation;
              mesh.isVisible = true;
              mesh.isPickable = false;
              mesh.receiveShadows = true;
              mesh.metadata = {
                ...root.metadata,
                nativePart: part.part,
                nativeSha256: part.sha256,
              };
              registerReferencedSceneMaterial(scene, mesh.material);
              if (part.part === "gasket") {
                mesh.morphTargetManager = source.morphTargetManager!.clone();
                mesh.morphTargetManager.getTarget(0).influence = 1;
                mesh.isVisible = false;
                ring = mesh;
              }
              meshes.push(mesh);
            }
          }
          entries.push({
            openingId: request.openingId,
            root,
            hinge,
            ring: ring!,
          });
        }
      });
    }
    check();
    return {
      roots,
      meshes,
      entries,
      setDoors(states: readonly LayoutDoorwayState[]) {
        if (disposed) return;
        const byId = new Map(states.map((state) => [state.openingId, state]));
        for (const entry of entries) {
          const state = byId.get(entry.openingId);
          const fraction = state?.fraction ?? NaN;
          const valid =
            Number.isFinite(fraction) && fraction >= 0 && fraction <= 1;
          // Positive Blender Z swing maps to positive renderer Y in X/-Z space.
          entry.hinge.rotation.y = valid ? (fraction * Math.PI) / 2 : 0;
          const retraction = state?.sealRetraction ?? 1;
          const validSeal =
            valid &&
            Number.isFinite(retraction) &&
            retraction >= 0 &&
            retraction <= 1 &&
            (fraction === 0 || retraction === 1);
          entry.ring.isVisible = validSeal;
          entry.ring.morphTargetManager!.getTarget(0).influence = validSeal
            ? retraction
            : 1;
          entry.root.metadata.doorStateKnown = valid;
        }
      },
      dispose,
    };
  } catch (error) {
    dispose();
    throw error;
  }
}

export function createLayoutDoorwayPreview(
  scene: Scene,
  report: (notes: string[]) => void = () => {},
  loader = loadLayoutDoorways,
) {
  const root = new TransformNode("layout-doorways", scene);
  const pending = new Set<Promise<void>>();
  let loaded: Awaited<ReturnType<typeof loader>> | undefined;
  let controller: AbortController | undefined;
  let disposed = false,
    signature = "",
    visible = true;
  let plan: LayoutDoorwayPlan = {
    requests: [],
    issues: [],
    wallExclusions: [],
  };
  let states: readonly LayoutDoorwayState[] | undefined;
  const pose = () =>
    loaded?.setDoors(
      states ??
        plan.requests.map((request) => ({
          openingId: request.openingId,
          fraction: 0,
          sealRetraction: 1,
        })),
    );
  const clear = () => {
    controller?.abort();
    loaded?.dispose();
    loaded = undefined;
  };
  return {
    get meshes() {
      return loaded?.meshes ?? [];
    },
    get plan() {
      return plan;
    },
    update(
      input: { document: LayoutDocument; deckId: string } | undefined,
      show: boolean,
      origin: readonly number[] = [0, 0, 0],
    ) {
      if (disposed) return;
      visible = show;
      root.setEnabled(show);
      root.position.set(-origin[0], -origin[1], -origin[2]);
      const next = input
        ? planLayoutDoorways(input.document, input.deckId)
        : { requests: [], issues: [], wallExclusions: [] };
      const key = JSON.stringify(next);
      if (key === signature) return;
      signature = key;
      clear();
      plan = next;
      report(plan.issues.map((issue) => issue.message));
      if (!plan.requests.length) return;
      const active = new AbortController();
      controller = active;
      const work = loader(scene, root, plan.requests, { signal: active.signal })
        .then((view) => {
          if (disposed || active.signal.aborted) {
            view.dispose();
            return;
          }
          loaded = view;
          root.setEnabled(visible);
          pose();
          report(plan.issues.map((issue) => issue.message));
        })
        .catch((error: unknown) => {
          if (disposed || active.signal.aborted) return;
          report([
            ...plan.issues.map((issue) => issue.message),
            error instanceof Error
              ? error.message
              : "Native doorway preview failed",
          ]);
        });
      pending.add(work);
      void work.finally(() => pending.delete(work));
    },
    setDoors(next: readonly LayoutDoorwayState[]) {
      states = next;
      pose();
    },
    async ready() {
      await Promise.allSettled([...pending]);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      clear();
      root.dispose();
    },
  };
}
