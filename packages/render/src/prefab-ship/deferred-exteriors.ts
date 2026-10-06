import type { Scene } from "@babylonjs/core/scene";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { prefabFormationBounds } from "@sidereal/sim/fleet-formation-bounds";
import { prefabOrigin } from "@sidereal/content/ship-prefab";
import { prefabFrameMatrix } from "./frames";
import { prefabNozzleLayout } from "./exhaust";
import { moldedLightRig } from "../molded-plastic";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { createPrefabShipView } from "./ship-view";
import {
  buildProxy,
  type ResolvedExterior,
  type RemoteExteriorPrototype,
} from "./remote-exteriors";
import type { ShipAccessDoorPiece } from "@sidereal/content/ship-access-doors";

/** Cheap, public-only prototype first; native assets are requested by projected detail. */
export async function loadDeferredExterior(
  scene: Scene,
  resolved: ResolvedExterior,
  accessResolver?: (piece: ShipAccessDoorPiece) => Promise<Uint8Array>,
): Promise<RemoteExteriorPrototype> {
  if (!resolved.exact)
    throw Error("Deferred exterior requires exact publication");
  const root = new TransformNode(`deferred-exterior:${resolved.key}`, scene);
  const frame = new TransformNode(`${root.name}:proxy-frame`, scene);
  frame.parent = root;
  const rotation = new Quaternion();
  Matrix.FromArray(prefabFrameMatrix(prefabOrigin(resolved.doc))).decompose(
    new Vector3(),
    rotation,
    frame.position,
  );
  frame.rotationQuaternion = rotation;
  const proxy = buildProxy(scene, resolved.doc, frame, root.name);
  if (!proxy.length) {
    root.dispose();
    throw Error("Published exterior has no public proxy geometry");
  }
  root.computeWorldMatrix(true);
  const parts = (meshes: readonly Mesh[]) =>
    meshes.map((mesh) => {
      const position = new Vector3(),
        rotation = new Quaternion(),
        scaling = new Vector3();
      mesh.computeWorldMatrix(true).decompose(scaling, rotation, position);
      mesh.isVisible = false;
      mesh.isPickable = false;
      mesh.receiveShadows = true;
      if (mesh.material instanceof PBRMaterial)
        mesh.material.directIntensity = 0.6;
      return { mesh, position, rotation, scaling };
    });
  const proxyParts = parts(proxy);
  moldedLightRig(scene).include(proxy);
  const radius = prefabFormationBounds(resolved.doc, resolved.catalog).radiusM;
  const banks = new Map<
    0 | 3,
    {
      view: Awaited<ReturnType<typeof createPrefabShipView>>;
      parts: ReturnType<typeof parts>;
    }
  >();
  const pending = new Map<0 | 3, Promise<boolean>>();
  const failures = new Map<0 | 3, { count: number; retryAt: number }>();
  let disposed = false;
  const ensureDetail = (tier: 0 | 3): Promise<boolean> => {
    if (disposed || scene.isDisposed) return Promise.resolve(false);
    if (banks.has(tier)) return Promise.resolve(true);
    if (pending.has(tier)) return pending.get(tier)!;
    if (Date.now() < (failures.get(tier)?.retryAt ?? 0))
      return Promise.resolve(false);
    const parent = new TransformNode(`${root.name}:loading-${tier}`, scene);
    parent.parent = root;
    parent.setEnabled(false);
    const promise = createPrefabShipView(scene, resolved.doc, {
      catalog: resolved.catalog,
      parent,
      view: "flight",
      exteriorOnly: true,
      exteriorDetail: tier === 3 ? "intermediate" : "full",
      externalDoorLeaves: true,
      accessResolver,
    })
      .then((view) => {
        if (disposed || scene.isDisposed || parent.isDisposed()) {
          view.dispose();
          return false;
        }
        // Parent-disabled meshes still have local enabled flags. Compute static transforms
        // without ever admitting this partial source assembly to a rendered frame.
        parent.setEnabled(true);
        const meshes = view.root
          .getChildMeshes()
          .filter(
            (m) =>
              m.getTotalVertices() > 0 && m.isEnabled() && !m.hasThinInstances,
          ) as Mesh[];
        const sourceParts = parts(meshes);
        if (!sourceParts.length) {
          view.dispose();
          parent.dispose();
          throw Error("Empty native exterior detail");
        }
        banks.set(tier, { view, parts: sourceParts });
        moldedLightRig(scene).include(meshes);
        failures.delete(tier);
        return true;
      })
      .catch((error) => {
        parent.dispose();
        if (!disposed) {
          const count = (failures.get(tier)?.count ?? 0) + 1;
          failures.set(tier, {
            count,
            retryAt:
              Date.now() + Math.min(30_000, 1000 * 2 ** Math.min(5, count - 1)),
          });
          console.warn("native exterior detail unavailable", error);
        }
        return false;
      })
      .finally(() => pending.delete(tier));
    pending.set(tier, promise);
    return promise;
  };
  const instanceParts = (
    source: ReturnType<typeof parts>,
    parent: TransformNode,
    shipId: string,
  ) => {
    for (const p of source) {
      const mesh = p.mesh.createInstance(
        `remote-ship-${shipId}--${p.mesh.name}`,
      );
      mesh.parent = parent;
      mesh.position.copyFrom(p.position);
      mesh.rotationQuaternion = p.rotation.clone();
      mesh.scaling.copyFrom(p.scaling);
      mesh.isVisible = true;
      mesh.isPickable = false;
      mesh.metadata = {
        role: "remote",
        remoteShipId: shipId,
        publishedExterior: resolved.key,
      };
    }
  };
  const triangles = (tier: 0 | 3) =>
    banks
      .get(tier)
      ?.parts.reduce((n, p) => n + p.mesh.getTotalIndices() / 3, 0) ?? 0;
  return {
    key: resolved.key,
    exact: true,
    nativeAccess: resolved,
    hasIntermediate: true,
    radius,
    theme: resolved.doc.theme,
    nozzles: prefabNozzleLayout(resolved.doc, resolved.catalog),
    ensureDetail,
    detailReady: (tier) => banks.has(tier),
    get sources() {
      return [
        ...proxy,
        ...[...banks.values()].flatMap((b) => b.parts.map((p) => p.mesh)),
      ];
    },
    get metrics() {
      return {
        exteriorMeshes: banks.get(0)?.parts.length ?? 0,
        exteriorTriangles: triangles(0),
        intermediateTriangles: triangles(3),
        proxyTriangles: proxy.reduce((n, m) => n + m.getTotalIndices() / 3, 0),
      };
    },
    instantiate(parent, shipId) {
      const full = new TransformNode(`remote-ship-${shipId}:full`, scene);
      const intermediate = new TransformNode(
        `remote-ship-${shipId}:intermediate`,
        scene,
      );
      const coarse = new TransformNode(`remote-ship-${shipId}:proxy`, scene);
      full.parent = intermediate.parent = coarse.parent = parent;
      instanceParts(proxyParts, coarse, shipId);
      const prepare = (tier: 0 | 3, target: TransformNode) => {
        const bank = banks.get(tier);
        if (!disposed && bank && !target.getChildMeshes().length)
          instanceParts(bank.parts, target, shipId);
      };
      const release = (target: TransformNode) => {
        for (const mesh of target.getChildMeshes()) mesh.dispose();
      };
      return {
        full,
        intermediate,
        proxy: coarse,
        prepareFull: () => prepare(0, full),
        releaseFull: () => release(full),
        prepareIntermediate: () => prepare(3, intermediate),
        releaseIntermediate: () => release(intermediate),
      };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const bank of banks.values()) bank.view.dispose();
      banks.clear();
      // Proxy materials belong to the scene-wide slot pool, not this prototype.
      root.dispose();
    },
  };
}
