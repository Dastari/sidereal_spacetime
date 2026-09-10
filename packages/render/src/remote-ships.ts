import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { Matrix, Vector3, Quaternion } from "@babylonjs/core/Maths/math.vector";
import {
  SceneLoader,
  type ISceneLoaderAsyncResult,
} from "@babylonjs/core/Loading/sceneLoader";
import type { Scene } from "@babylonjs/core/scene";
import "@babylonjs/loaders/glTF";
import type {
  PartAsset,
  PartPlacement,
  AssemblyDocument,
} from "@sidereal/content/assembly";
import { constructionHash } from "@sidereal/sim/construction-transactions";
import { updateHullDecals } from "./hull-decals";
import {
  batchOpaqueExterior,
  type ExteriorPrimitive,
} from "./remote-exterior-batches";
import { extractStockAftBoundary } from "./remote-aft-boundary";
import { cloneOpaqueRemoteGlass } from "./remote-exterior-glass";
import type { Material } from "@babylonjs/core/Materials/material";

/** Pinned existing public stock artifacts, never a player's private assembly. */
export const STOCK_EXTERIOR_SOURCE_PINS = Object.freeze({
  hullManifest: {
    url: "/assets/assembly/hull-manifest.json",
    sha256: "2e275052217da4b20a92ab40a9a9f098dc011557f7611b6b0c6f40f71ea22695",
  },
  template: {
    url: "/assets/assembly/wayfarer.json",
    sha256: "1f723510ac156089903fbd0d711a2f6adff1da35433e2ac02afde94fa4a00deb",
  },
  legacyShell: {
    url: "/assets/voxels/wayfarer.glb",
    sha256: "aa27de4fd09db67428659af8e16479217dd7bebd1f764c13744f62b2d621a6db",
  },
});
export const STOCK_EXTERIOR_BASE_MESHES = Object.freeze([
  "GEO-walls",
  "GEO-cutaway-port",
  "GEO-cutaway-starboard",
  "GEO-cutaway-aft",
  "GEO-armor",
  "GEO-drives-main--3.6",
  "GEO-drives-main-3.6",
  "GEO-drives-main-0",
  "GEO-drives-maneuver--1--6.5",
  "GEO-drives-maneuver--1-6.5",
  "GEO-drives-maneuver-1--6.5",
  "GEO-drives-maneuver-1-6.5",
  "GEO-drives-retro--1",
  "GEO-drives-retro-1",
]);
/** Legacy backing contains cabin linings and fixture geometry. Native exterior
 * panels supply the remote silhouette; never instantiate the mixed backing. */
export const REMOTE_EXTERIOR_BASE_MESHES = STOCK_EXTERIOR_BASE_MESHES.filter(
  (name) => name !== "GEO-walls" && !name.startsWith("GEO-cutaway-"),
);
interface ExteriorPlacement {
  id: string;
  url: string;
  sha256: string;
  nodePrefix?: string;
  position: [number, number, number];
  rotation: number;
  flipped: boolean;
  decals?: PartPlacement["decals"];
}
export interface StockExteriorPayload {
  schema: "sidereal.stock-exterior.v1";
  sourcePins: typeof STOCK_EXTERIOR_SOURCE_PINS;
  base: { url: string; sha256: string; meshNames: readonly string[] };
  placements: readonly ExteriorPlacement[];
}
export interface StockExteriorManifest {
  assetId: string;
  sha256: string;
  payload: StockExteriorPayload;
}
/** Deterministic whitelist derivation. The generated compact JSON is a new
 * publication artifact; it does not imply a sealed hull, collision or damage. */
export function deriveStockWayfarerExterior(
  templateText: string,
  hullManifestText: string,
): StockExteriorManifest {
  if (
    constructionHash(templateText) !==
      STOCK_EXTERIOR_SOURCE_PINS.template.sha256 ||
    constructionHash(hullManifestText) !==
      STOCK_EXTERIOR_SOURCE_PINS.hullManifest.sha256
  )
    throw Error("Stock exterior source revision mismatch");
  const template = JSON.parse(templateText) as AssemblyDocument,
    hull = JSON.parse(hullManifestText) as {
      entries: { asset: PartAsset; placements: PartPlacement[] }[];
    };
  const stock = new Map(template.parts.map((p) => [p.id, p])),
    seen = new Set<string>(),
    placements: ExteriorPlacement[] = [];
  for (const { asset, placements: rows } of hull.entries)
    for (const p of rows) {
      const exterior =
        asset.category === "roof" ||
        asset.category === "superstructure" ||
        (asset.category === "wall" &&
          p.id.startsWith("pilot-r004-") &&
          !p.id.startsWith("pilot-r004-rear-partition-") &&
          p.id !== "pilot-r004-airlock-frame-22");
      if (!exterior) continue;
      const expected = stock.get(p.id),
        visual = asset.visual;
      if (
        !expected ||
        expected.assetId !== asset.id ||
        JSON.stringify(expected.position) !== JSON.stringify(p.position) ||
        expected.rotation !== p.rotation ||
        expected.flipped !== p.flipped ||
        !visual ||
        seen.has(p.id)
      )
        throw Error("Stock exterior placement mismatch");
      if (
        !visual.url.startsWith("/assets/assembly/") ||
        !/^[0-9a-f]{64}$/.test(visual.sha256)
      )
        throw Error("Invalid published exterior source");
      seen.add(p.id);
      placements.push({
        id: p.id,
        url: visual.url,
        sha256: visual.sha256,
        ...(visual.nodePrefix ? { nodePrefix: visual.nodePrefix } : {}),
        position: [...p.position],
        rotation: p.rotation,
        flipped: p.flipped,
        ...(p.decals?.length
          ? { decals: JSON.parse(JSON.stringify(p.decals)) }
          : {}),
      });
    }
  if (placements.length !== 108)
    throw Error("Stock exterior whitelist is incomplete");
  placements.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const payload: StockExteriorPayload = {
    schema: "sidereal.stock-exterior.v1",
    sourcePins: STOCK_EXTERIOR_SOURCE_PINS,
    base: {
      ...STOCK_EXTERIOR_SOURCE_PINS.legacyShell,
      meshNames: STOCK_EXTERIOR_BASE_MESHES,
    },
    placements,
  };
  const sha256 = constructionHash(JSON.stringify(payload));
  return { assetId: `stock-wayfarer-exterior:${sha256}`, sha256, payload };
}
export function validateStockExteriorManifest(
  manifest: StockExteriorManifest,
  expectedAssetId: string,
): void {
  if (
    manifest.payload.schema !== "sidereal.stock-exterior.v1" ||
    manifest.assetId !== expectedAssetId ||
    manifest.assetId !== `stock-wayfarer-exterior:${manifest.sha256}` ||
    constructionHash(JSON.stringify(manifest.payload)) !== manifest.sha256 ||
    JSON.stringify(manifest.payload.sourcePins) !==
      JSON.stringify(STOCK_EXTERIOR_SOURCE_PINS)
  )
    throw Error("Exterior package identity/hash mismatch");
  if (
    manifest.payload.base.url !== STOCK_EXTERIOR_SOURCE_PINS.legacyShell.url ||
    manifest.payload.base.sha256 !==
      STOCK_EXTERIOR_SOURCE_PINS.legacyShell.sha256 ||
    JSON.stringify(manifest.payload.base.meshNames) !==
      JSON.stringify(STOCK_EXTERIOR_BASE_MESHES) ||
    manifest.payload.placements.length !== 108
  )
    throw Error("Exterior package whitelist mismatch");
}
export interface RemoteShipPrototype {
  readonly metrics?: ReturnType<typeof batchOpaqueExterior>["metrics"];
  instantiate(shipId: string): TransformNode;
  dispose(): void;
}
const selector = (name: string, prefix: string) =>
  name === prefix ||
  name.startsWith(prefix + "_") ||
  name.startsWith(prefix + ".");
/** Verified bytes, native materials and shared GPU geometry. No equipment light,
 * crew, cargo, room partition, internal doorway or deck-floor loader is invoked. */
export async function loadRemoteShipPrototype(
  scene: Scene,
  manifest: StockExteriorManifest,
  expectedAssetId: string,
): Promise<RemoteShipPrototype> {
  validateStockExteriorManifest(manifest, expectedAssetId);
  if (!scene.useRightHandedSystem)
    throw Error("Remote exterior requires right-handed scene");
  const imports: ISceneLoaderAsyncResult[] = [],
    sources = new Map<string, Mesh[]>(),
    matrices = new Map<Mesh, ReturnType<Mesh["computeWorldMatrix"]>>();
  const batches: Mesh[] = [];
  const glassClones = new Map<Material, Material>();
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    for (const batch of batches) batch.dispose(false, false);
    for (const material of glassClones.values()) material.dispose(false, false);
    for (const loaded of imports) {
      for (const mesh of loaded.meshes) mesh.dispose(false, true);
      for (const node of loaded.transformNodes) node.dispose();
    }
  };
  try {
    const pins = new Map<string, string>([
      [manifest.payload.base.url, manifest.payload.base.sha256],
    ]);
    for (const p of manifest.payload.placements) {
      if (pins.has(p.url) && pins.get(p.url) !== p.sha256)
        throw Error("Conflicting exterior source hashes");
      pins.set(p.url, p.sha256);
    }
    for (const [url, sha256] of pins) {
      if (scene.isDisposed) throw Error("Remote exterior scene disposed");
      const response = await fetch(url);
      if (!response.ok) throw Error("Exterior source unavailable: " + url);
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (constructionHash(bytes) !== sha256)
        throw Error("Exterior GLB hash mismatch: " + url);
      const loaded = await SceneLoader.ImportMeshAsync(
        url === manifest.payload.base.url
          ? [...REMOTE_EXTERIOR_BASE_MESHES, "GEO-walls", "GEO-cutaway-aft"]
          : "",
        "",
        bytes,
        scene,
        undefined,
        ".glb",
      );
      imports.push(loaded);
      // A future published GLB must not add remote cabin lights or animation.
      for (const light of loaded.lights ?? []) light.dispose();
      for (const group of loaded.animationGroups ?? []) group.dispose();
      for (const skeleton of loaded.skeletons ?? []) skeleton.dispose();
      const meshes = loaded.meshes.filter(
        (m): m is Mesh => m instanceof Mesh && m.getTotalVertices() > 0,
      );
      for (const mesh of meshes) {
        // Babylon instances inherit this material/shadow flag from their source.
        mesh.receiveShadows = true;
        if (mesh.material) {
          const original = mesh.material;
          let opaque = glassClones.get(original);
          if (!opaque) {
            opaque = cloneOpaqueRemoteGlass(original);
            if (opaque) glassClones.set(original, opaque);
          }
          if (opaque) mesh.material = opaque;
        }
        matrices.set(mesh, mesh.computeWorldMatrix(true).clone());
      }
      for (const mesh of loaded.meshes) {
        mesh.isVisible = false;
        mesh.isPickable = false;
      }
      sources.set(url, meshes);
    }
    if (scene.isDisposed) throw Error("Remote exterior scene disposed");
    const base = sources
      .get(manifest.payload.base.url)!
      .filter((m) =>
        REMOTE_EXTERIOR_BASE_MESHES.some((prefix) => selector(m.name, prefix)),
      );
    for (const name of REMOTE_EXTERIOR_BASE_MESHES)
      if (!base.some((m) => selector(m.name, name)))
        throw Error("Missing exterior shell group: " + name);
    for (const source of sources.get(manifest.payload.base.url)!) {
      const boundary = extractStockAftBoundary(source);
      if (!boundary) continue;
      batches.push(boundary);
      matrices.set(boundary, matrices.get(source)!);
      base.push(boundary);
    }
    const groups = manifest.payload.placements.map((p) => {
      const selected = sources
        .get(p.url)!
        .filter((m) => !p.nodePrefix || selector(m.name, p.nodePrefix));
      if (!selected.length)
        throw Error("Missing exterior native group: " + p.id);
      return { p, selected };
    });
    const primitives: ExteriorPrimitive[] = base.map((source) => ({
      source,
      matrix: matrices.get(source)!,
      placementIds: [source.name],
    }));
    for (const { p, selected } of groups) {
      const placement = Matrix.Compose(
        new Vector3(p.flipped ? -1 : 1, 1, 1),
        Quaternion.RotationAxis(Vector3.Up(), p.rotation),
        new Vector3(p.position[0], p.position[2], -p.position[1]),
      );
      for (const source of selected)
        primitives.push({
          source,
          matrix: matrices.get(source)!.multiply(placement),
          placementIds: [p.id],
        });
    }
    const batched = batchOpaqueExterior(scene, primitives);
    batches.push(...batched.batches);
    return {
      dispose,
      metrics: batched.metrics,
      instantiate(shipId) {
        if (disposed || scene.isDisposed)
          throw Error("Exterior prototype disposed");
        const root = new TransformNode("remote-ship-" + shipId, scene);
        root.metadata = {
          remoteShipId: shipId,
          publishedExteriorAssetId: manifest.assetId,
        };
        try {
          for (const { source, matrix, placementIds } of batched.primitives) {
            const mesh = source.createInstance(
              `remote-${shipId}--${source.name}`,
            );
            mesh.parent = root;
            const rotation = new Quaternion();
            matrix.decompose(mesh.scaling, rotation, mesh.position);
            mesh.rotationQuaternion = rotation;
            mesh.isVisible = true;
            mesh.isPickable = false;
            mesh.metadata = {
              remoteShipId: shipId,
              publishedExteriorAssetId: manifest.assetId,
              sourcePlacementIds: placementIds,
            };
          }
          for (const { p } of groups) {
            if (!p.decals?.length) continue;
            const node = new TransformNode(
              `remote-${shipId}--part-${p.id}`,
              scene,
            );
            node.parent = root;
            node.position.set(p.position[0], p.position[2], -p.position[1]);
            node.rotation.y = p.rotation;
            node.scaling.x = p.flipped ? -1 : 1;
            // Decals own reference-counted material cleanup across ship roots.
            for (const mesh of updateHullDecals(
              scene,
              node,
              p.decals,
              p.flipped,
            )) {
              mesh.isPickable = false;
              mesh.metadata = { ...mesh.metadata, remoteShipId: shipId };
            }
          }
          return root;
        } catch (error) {
          root.dispose();
          throw error;
        }
      },
    };
  } catch (error) {
    dispose();
    throw error;
  }
}
interface RemoteSnapshot {
  epoch: number;
  shipMotion: readonly { shipId: string }[];
  shipDescription: readonly {
    shipId: string;
    publishedExteriorAssetId: string;
  }[];
}
export interface RemoteShipStore {
  getSnapshot(): RemoteSnapshot;
  subscribeTable(
    table: "shipMotion" | "shipDescription" | "admission",
    listener: () => void,
  ): () => void;
  sampleShip(
    id: string,
    atMs?: number,
    delayMs?: number,
  ): { x: number; y: number; heading: number } | undefined;
}
/** ID-keyed presentation; one shared prototype, independent ship roots. Async
 * load completion cannot resurrect a deleted contact or a disposed scene. */
export function createRemoteShips(
  scene: Scene,
  store: RemoteShipStore,
  options: {
    assetId: string;
    localShipId: () => string | undefined;
    loadPrototype: () => Promise<RemoteShipPrototype>;
    onError?: (error: unknown) => void;
  },
) {
  const roots = new Map<string, TransformNode>();
  let disposed = false,
    prototype: RemoteShipPrototype | undefined,
    epoch = store.getSnapshot().epoch,
    localId = options.localShipId();
  const clear = () => {
    for (const root of roots.values()) root.dispose();
    roots.clear();
  };
  const reconcile = () => {
    if (disposed) return;
    const snapshot = store.getSnapshot();
    if (snapshot.epoch !== epoch) {
      clear();
      epoch = snapshot.epoch;
    }
    localId = options.localShipId();
    const motions = new Set(snapshot.shipMotion.map((m) => m.shipId)),
      wanted = new Set(
        snapshot.shipDescription
          .filter(
            (d) =>
              d.shipId !== localId &&
              d.publishedExteriorAssetId === options.assetId &&
              motions.has(d.shipId),
          )
          .slice(0, 64)
          .map((d) => d.shipId),
      );
    for (const [id, root] of roots)
      if (!wanted.has(id)) {
        root.dispose();
        roots.delete(id);
      }
    if (prototype)
      for (const id of wanted)
        if (!roots.has(id)) {
          const root = prototype.instantiate(id);
          // Never flash a newly discovered ship at the camera origin before sampling.
          root.setEnabled(false);
          roots.set(id, root);
        }
  };
  const unbind = (["shipMotion", "shipDescription", "admission"] as const).map(
    (table) => store.subscribeTable(table, reconcile),
  );
  const ready = options
    .loadPrototype()
    .then((loaded) => {
      if (disposed || scene.isDisposed) {
        loaded.dispose();
        return;
      }
      prototype = loaded;
      reconcile();
    })
    .catch((error) => {
      if (!disposed) options.onError?.(error);
      throw error;
    });
  // Caller can await ready; attach a handler so ignored review promises do not
  // produce an unrelated unhandled rejection while onError displays the failure.
  void ready.catch(() => {});
  const disposeRenderer = () => {
    if (disposed) return;
    disposed = true;
    for (const stop of unbind) stop();
    clear();
    prototype?.dispose();
    prototype = undefined;
    scene.onDisposeObservable.remove(sceneObserver);
  };
  const sceneObserver = scene.onDisposeObservable.add(disposeRenderer);
  return {
    ready,
    getRootIds: () => [...roots.keys()].sort(),
    update(origin: { x: number; y: number }, nowMs: number, delayMs = 100) {
      if (disposed) return;
      if (options.localShipId() !== localId) reconcile();
      if (![origin.x, origin.y, nowMs].every(Number.isFinite)) return;
      for (const [id, root] of roots) {
        const sample = store.sampleShip(id, nowMs, delayMs);
        if (
          !sample ||
          ![sample.x, sample.y, sample.heading].every(Number.isFinite)
        ) {
          root.setEnabled(false);
          continue;
        }
        root.setEnabled(true);
        root.position.set(sample.x - origin.x, 0, -(sample.y - origin.y));
        root.rotation.y = sample.heading;
      }
    },
    dispose: disposeRenderer,
  };
}
