import type { Scene } from "@babylonjs/core/scene";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { prefabOrigin } from "@sidereal/content/ship-prefab";
import type { ShipAccessDoorPiece } from "@sidereal/content/ship-access-doors";
import { prefabFrameMatrix } from "./frames";
import { prefabNozzleLayout } from "./exhaust";
import { moldedLightRig } from "../molded-plastic";
import { createPrefabShipView } from "./ship-view";
import {
  buildProxy,
  loadRemoteExteriorPrototype,
  type ResolvedExterior,
  type RemoteExteriorPrototype,
} from "./remote-exteriors";

import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { AUTHORED_TEMPLATE_KIT_MANIFEST_SHA256 } from "@sidereal/content/authored-template-kit";
import { WAYFARER_AUTHORED_STUDY_PINS } from "@sidereal/content/wayfarer-authored-study";
import { defaultPrefabComponentCatalog } from "@sidereal/content/ship-prefab-catalog";
import { publishedShipAccessBytes } from "./wayfarer-access-assets";
import { WAYFARER_ACCESS_DOORS } from "@sidereal/content/wayfarer-access-profile";
import { SHIP_KIT_REVISION } from "@sidereal/content/ship-kit";
import { SHIP_COMPONENT_CATALOG_REVISIONS } from "@sidereal/content/ship-components-source";
import { TEMPLATE_RCS_PIECE } from "./authored-template-propulsion";

/** Source-qualified admission envelopes avoid changing LOD when a peer warms the bank. */
export function exteriorAdmissionKey(resolved: ResolvedExterior) {
  return bytesToHex(
    sha256(
      new TextEncoder().encode(
        JSON.stringify([
          resolved.doc,
          resolved.catalog.revision,
          resolved.catalog.list(),
          AUTHORED_TEMPLATE_KIT_MANIFEST_SHA256,
          WAYFARER_ACCESS_DOORS,
          WAYFARER_AUTHORED_STUDY_PINS,
          SHIP_KIT_REVISION,
          SHIP_COMPONENT_CATALOG_REVISIONS,
          TEMPLATE_RCS_PIECE,
        ]),
      ),
    ),
  );
}
// Measured from the complete accepted flight cohorts; keys include document, catalog and art pins.
const ADMISSION_RADII: Readonly<Record<string, number>> = {
  "4e1ea0dada917078708b5e360d58062336f51a387eadf98f2b1efeb22d444559": 10.869251354164186,
  "11b144e839b7e714319e1a883097804814eb10b7d9efe0867c4a70e9d86e731a": 14.326548781894404,
  "0b600dba19af989b753d6715816f89fa17bb1d267a2ad1b7f9b5ac59a23ee4f1": 21.02379604162864,
  "89452caa7ab4adb97cdc6bc14db321ded6d419428d48afd770a01908232c4cf6": 19.29378138157474,
  b956050725ec7c141ccf1f032e17f3f30d38e9547b0d4f97415c4d243b0982fc: 25.044959572736385,
  "507e1f5cd468b3d0b6fa5200de17e41d7356c84b1c5bf8d29484c492182920a3": 28.622543562723422,
};

type Part = {
  mesh: Mesh;
  position: Vector3;
  rotation: Quaternion;
  scaling: Vector3;
};
/** Public hull proxy first; the exact native bank is loaded once when a consumer needs it. */
export async function loadDeferredExterior(
  scene: Scene,
  resolved: ResolvedExterior,
  options: {
    standinComponents?: boolean;
    accessResolver?: (piece: ShipAccessDoorPiece) => Promise<Uint8Array>;
  } = {},
): Promise<RemoteExteriorPrototype> {
  const radius =
    resolved.exact &&
    resolved.catalog === defaultPrefabComponentCatalog() &&
    !options.standinComponents &&
    (!options.accessResolver ||
      options.accessResolver === publishedShipAccessBytes)
      ? ADMISSION_RADII[exteriorAdmissionKey(resolved)]
      : undefined;
  if (radius === undefined)
    return loadRemoteExteriorPrototype(scene, resolved, options);
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
  const parts = (meshes: Mesh[]): Part[] =>
    meshes.map((mesh) => {
      const position = new Vector3(),
        rotation = new Quaternion(),
        scaling = new Vector3();
      mesh.computeWorldMatrix(true).decompose(scaling, rotation, position);
      mesh.isVisible = false;
      mesh.isPickable = false;
      mesh.receiveShadows = true;
      if (mesh.material instanceof PBRMaterial) {
        mesh.material.directIntensity = 0.6;
        mesh.material.allowShaderHotSwapping = false;
      }
      return { mesh, position, rotation, scaling };
    });
  const proxyParts = parts(proxy);
  moldedLightRig(scene).include(proxy);
  let fullParts: Part[] | undefined,
    view: Awaited<ReturnType<typeof createPrefabShipView>> | undefined;
  let pending: Promise<boolean> | undefined,
    disposed = false,
    retryAt = 0,
    failures = 0;
  const ensureFull = (): Promise<boolean> => {
    if (disposed || scene.isDisposed) return Promise.resolve(false);
    if (fullParts) return Promise.resolve(true);
    if (pending) return pending;
    if (Date.now() < retryAt) return Promise.resolve(false);
    const staging = new TransformNode(`${root.name}:native-staging`, scene);
    staging.parent = root;
    staging.setEnabled(false);
    pending = createPrefabShipView(scene, resolved.doc, {
      catalog: resolved.catalog,
      parent: staging,
      view: "flight",
      exteriorOnly: true,
      externalDoorLeaves: true,
      ...options,
    })
      .then((loaded) => {
        if (disposed || scene.isDisposed || staging.isDisposed()) {
          loaded.dispose();
          staging.dispose();
          return false;
        }
        view = loaded;
        // Synchronous publication: hide every source before enabling its staging parent.
        // Local enabled flags determine the flight cohort, independently of the disabled ancestor.
        const meshes = loaded.root
          .getChildMeshes()
          .filter((mesh): mesh is Mesh => {
            if (
              !(mesh instanceof Mesh) ||
              !mesh.getTotalVertices() ||
              mesh.hasThinInstances
            )
              return false;
            for (let node = mesh; node !== staging;) {
              if (!node.isEnabled(false)) return false;
              if (!node.parent || node.parent === staging) break;
              node = node.parent as Mesh;
            }
            return true;
          });
        staging.setEnabled(true);
        fullParts = parts(meshes);
        if (!fullParts.length) throw Error("Empty native exterior");
        view = loaded;
        moldedLightRig(scene).include(meshes);
        retryAt = failures = 0;
        return true;
      })
      .catch((error) => {
        view?.dispose();
        view = undefined;
        staging.dispose();
        fullParts = undefined;
        if (!disposed && !scene.isDisposed) {
          failures++;
          retryAt =
            Date.now() +
            Math.min(30_000, 1000 * 2 ** Math.min(5, failures - 1));
          console.warn("Native exterior bank unavailable", error);
        }
        return false;
      })
      .finally(() => {
        pending = undefined;
      });
    return pending;
  };
  const instanceParts = (
    source: Part[],
    target: TransformNode,
    shipId: string,
  ) => {
    for (const part of source) {
      const mesh = part.mesh.createInstance(
        `remote-ship-${shipId}--${part.mesh.name}`,
      );
      mesh.parent = target;
      mesh.position.copyFrom(part.position);
      mesh.rotationQuaternion = part.rotation.clone();
      mesh.scaling.copyFrom(part.scaling);
      mesh.isVisible = true;
      mesh.isPickable = false;
      mesh.metadata = {
        role: "remote",
        remoteShipId: shipId,
        publishedExterior: resolved.key,
      };
    }
  };
  let nozzles: ReturnType<typeof prefabNozzleLayout> = [];
  try {
    nozzles = prefabNozzleLayout(resolved.doc, resolved.catalog);
  } catch (error) {
    console.warn("Remote exhaust layout unavailable", error);
  }
  return {
    key: resolved.key,
    exact: true,
    nativeAccess: resolved,
    theme: resolved.doc.theme,
    nozzles,
    get radius() {
      return radius;
    },
    get sources() {
      return [...proxy, ...(fullParts?.map((part) => part.mesh) ?? [])];
    },
    get metrics() {
      return {
        exteriorMeshes: fullParts?.length ?? 0,
        exteriorTriangles:
          fullParts?.reduce((n, p) => n + p.mesh.getTotalIndices() / 3, 0) ?? 0,
        proxyTriangles: proxy.reduce((n, m) => n + m.getTotalIndices() / 3, 0),
      };
    },
    ensureFull,
    fullReady: () => !!fullParts,
    settleFull: () => pending ?? Promise.resolve(),
    instantiate(parent, shipId) {
      if (disposed) throw Error("Remote exterior prototype disposed");
      const full = new TransformNode(`remote-ship-${shipId}:full`, scene),
        coarse = new TransformNode(`remote-ship-${shipId}:proxy`, scene);
      full.parent = coarse.parent = parent;
      instanceParts(proxyParts, coarse, shipId);
      let prepared = false;
      return {
        full,
        proxy: coarse,
        prepareFull() {
          if (!disposed && !prepared && fullParts && !full.isDisposed()) {
            instanceParts(fullParts, full, shipId);
            prepared = true;
          }
        },
        releaseFull() {
          for (const mesh of full.getChildMeshes()) mesh.dispose();
          prepared = false;
        },
      };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      view?.dispose();
      fullParts = undefined;
      root.dispose();
    },
  };
}
