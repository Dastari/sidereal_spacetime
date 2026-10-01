import type { Scene } from "@babylonjs/core/scene";
import { SceneLoader } from "@babylonjs/core/Loading/sceneLoader";
import type { AssetContainer } from "@babylonjs/core/assetContainer";
import { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { MultiMaterial } from "@babylonjs/core/Materials/multiMaterial";
import type { Material } from "@babylonjs/core/Materials/material";
import type { AnimationGroup } from "@babylonjs/core/Animations/animationGroup";
import type { Skeleton } from "@babylonjs/core/Bones/skeleton";
import "@babylonjs/loaders/glTF";

const caches = new WeakMap<Scene, Map<string, Promise<AssetContainer>>>();

/** A verified record owns its bytes. Public fields cannot forge the private attestation. */
export interface VerifiedCrewSource {
  readonly sha256: string;
  readonly variant: string;
  readonly byteLength: number;
}
const verifiedBytes = new WeakMap<VerifiedCrewSource, Uint8Array>();
export interface RequestedCrewSource extends VerifiedCrewSource {
  readonly url: string;
}
const verifiedDownloads = new WeakMap<
  Scene,
  Map<string, Promise<VerifiedCrewSource>>
>();

/** Scene-owned immutable source download. Actor cancellation never aborts another actor's source. */
export function fetchVerifiedCrewSource(
  scene: Scene,
  incoming: RequestedCrewSource,
): Promise<VerifiedCrewSource> {
  const descriptor = {
    url: incoming.url,
    sha256: incoming.sha256,
    variant: incoming.variant,
    byteLength: incoming.byteLength,
  };
  if (
    scene.isDisposed ||
    !/^\/assets\/[a-z0-9./_-]+$/i.test(descriptor.url) ||
    descriptor.url.includes("..") ||
    !/^[a-f0-9]{64}$/.test(descriptor.sha256) ||
    !descriptor.variant ||
    descriptor.variant.length > 256 ||
    !Number.isSafeInteger(descriptor.byteLength) ||
    descriptor.byteLength <= 0 ||
    descriptor.byteLength > 16777216
  )
    return Promise.reject(new Error("Operator requested source unavailable"));
  let downloads = verifiedDownloads.get(scene);
  if (!downloads) {
    downloads = new Map();
    verifiedDownloads.set(scene, downloads);
    scene.onDisposeObservable.addOnce(() => {
      downloads!.clear();
      verifiedDownloads.delete(scene);
    });
  }
  const key = JSON.stringify([
    descriptor.sha256,
    descriptor.variant,
    descriptor.byteLength,
  ]);
  let pending = downloads.get(key);
  if (!pending) {
    pending = (async () => {
      const response = await fetch(descriptor.url);
      if (!response.ok)
        throw new Error("Operator requested source unavailable");
      const bytes = await response.arrayBuffer();
      if (scene.isDisposed) throw new Error("Operator source scene withdrawn");
      const record = await verifyCrewSource(bytes, descriptor);
      if (scene.isDisposed) throw new Error("Operator source scene withdrawn");
      return record;
    })();
    downloads.set(key, pending);
  }
  return pending;
}

export async function verifyCrewSource(
  incoming: ArrayBuffer | ArrayBufferView,
  expected: VerifiedCrewSource,
): Promise<VerifiedCrewSource> {
  const descriptor = {
    sha256: expected.sha256,
    variant: expected.variant,
    byteLength: expected.byteLength,
  };
  // Copy synchronously, before the first await: a caller cannot mutate the hashed/parsed source.
  const snapshot =
    incoming instanceof ArrayBuffer
      ? new Uint8Array(incoming).slice()
      : new Uint8Array(
          incoming.buffer,
          incoming.byteOffset,
          incoming.byteLength,
        ).slice();
  if (
    !/^[a-f0-9]{64}$/.test(descriptor.sha256) ||
    !descriptor.variant ||
    descriptor.variant.length > 256 ||
    !Number.isSafeInteger(descriptor.byteLength) ||
    descriptor.byteLength <= 0 ||
    snapshot.byteLength !== descriptor.byteLength
  )
    throw new Error("Operator asset descriptor unavailable");
  const digest = await crypto.subtle.digest("SHA-256", snapshot);
  const sha256 = [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  if (sha256 !== descriptor.sha256)
    throw new Error("Operator asset integrity mismatch");
  const record = Object.freeze({
    sha256,
    variant: descriptor.variant,
    byteLength: snapshot.byteLength,
  });
  verifiedBytes.set(record, snapshot);
  return record;
}

/** Parsing gets an independent copy of the exact attested snapshot, never a second URL fetch. */
export function verifiedCrewSourceBytes(
  source: VerifiedCrewSource,
): Uint8Array {
  const bytes = verifiedBytes.get(source);
  if (!bytes) throw new Error("Operator asset attestation unavailable");
  return bytes.slice();
}

export function isVerifiedCrewSource(
  source: unknown,
): source is VerifiedCrewSource {
  return (
    !!source &&
    typeof source === "object" &&
    verifiedBytes.has(source as VerifiedCrewSource)
  );
}

/**
 * One parsed GLB per scene and URL, never added to the scene itself: callers instantiate copies.
 * Every crew body (the local character and each visible crewmate) clones its meshes from this
 * source, so the vertex and index buffers are uploaded once. Released with the scene.
 */
export function sharedCrewContainer(
  scene: Scene,
  url: string | VerifiedCrewSource,
): Promise<AssetContainer> {
  let cache = caches.get(scene);
  if (!cache) {
    const owned = new Map<string, Promise<AssetContainer>>();
    cache = owned;
    caches.set(scene, owned);
    scene.onDisposeObservable.addOnce(() => {
      for (const pending of owned.values())
        pending.then((c) => c.dispose()).catch(() => undefined);
      owned.clear();
    });
  }
  const key =
    typeof url === "string"
      ? JSON.stringify(["legacy-url", url])
      : JSON.stringify(["verified-glb", url.sha256, url.variant]);
  if (typeof url !== "string" && !isVerifiedCrewSource(url))
    throw new Error("Operator asset attestation unavailable");
  let pending = cache.get(key);
  if (!pending) {
    const loading = SceneLoader.LoadAssetContainerAsync(
      "",
      typeof url === "string" ? url : verifiedCrewSourceBytes(url),
      scene,
      undefined,
      ".glb",
    );
    pending = loading;
    cache.set(key, loading);
    // A failed load may be retried by the next caller.
    loading.catch(() => {
      // Qualified failure stays associated with this exact descriptor; legacy retry is unchanged.
      if (typeof url === "string" && cache.get(key) === loading)
        cache.delete(key);
    });
  }
  return pending;
}

/** The parts of an asset container a crew body uses, whether owned or instantiated. */
export interface CrewBodyAssets {
  meshes: AbstractMesh[];
  materials: Material[];
  transformNodes: TransformNode[];
  rootNodes: TransformNode[];
  animationGroups: AnimationGroup[];
  skeletons: Skeleton[];
  dispose(): void;
}

/**
 * Instantiate a shared crew body: meshes are clones that share the source geometry, skeletons and
 * animation groups are per body, and materials are cloned (appearance tints each body's slots).
 * Node names are kept, so name-based lookups (bones, sockets, `crew.face`) work unchanged.
 */
export async function instantiateSharedCrewBody(
  scene: Scene,
  url: string | VerifiedCrewSource,
): Promise<CrewBodyAssets> {
  const source = await sharedCrewContainer(scene, url);
  const entries = source.instantiateModelsToScene((name) => name, true, {
    doNotInstantiate: true,
  });
  const rootNodes = entries.rootNodes as TransformNode[];
  const nodes = rootNodes.flatMap((root) => [
    root,
    ...root.getDescendants(false),
  ]);
  const meshes = nodes.filter(
    (n): n is AbstractMesh => n instanceof AbstractMesh,
  );
  const transformNodes = nodes.filter(
    (n): n is TransformNode =>
      n instanceof TransformNode && !(n instanceof AbstractMesh),
  );
  const materials = [
    ...new Set(
      meshes.flatMap((m) =>
        m.material instanceof MultiMaterial
          ? [m.material, ...m.material.subMaterials]
          : [m.material],
      ),
    ),
  ].filter((m): m is Material => !!m);
  return {
    meshes,
    materials,
    transformNodes,
    rootNodes,
    animationGroups: entries.animationGroups,
    skeletons: entries.skeletons,
    dispose() {
      // Cloned materials may hold cloned texture wrappers (same GPU texture, reference counted);
      // release those, never the shared source's own textures.
      const shared = new Set<unknown>(source.textures);
      const clonedTextures = new Set(
        materials
          .flatMap((m) => m.getActiveTextures())
          .filter((t) => !shared.has(t)),
      );
      entries.dispose();
      for (const material of materials) material.dispose(false, false);
      for (const texture of clonedTextures) texture.dispose();
    },
  };
}
