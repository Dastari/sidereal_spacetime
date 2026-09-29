/**
 * Other players' ships in flight view: exterior only, dynamic LOD, shared GPU geometry.
 *
 * Wiki `Architecture/Visibility and Interest Management`:
 * - hard rule 5: every authorised, perceived ship is represented; the last LOD tier is a marker;
 * - hard rule 6: other ships never render interiors (the prototype is built with
 *   `exteriorOnly`, from the published developer prefab named by the server, never from a
 *   remote instance document);
 * - hard rule 7: dynamic LOD by projected size with hysteresis (presentation-lod.ts).
 *
 * One prototype per published exterior (blueprint pin): its batched exterior meshes and a
 * low-poly hull proxy are hidden sources; every remote ship is a set of Babylon instances of them,
 * so N ships of one hull cost one draw call per batch material. Presentation only: positions come
 * from the accepted shared-world store and nothing is written back.
 */
import type { Scene } from "@babylonjs/core/scene";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { InstancedMesh } from "@babylonjs/core/Meshes/instancedMesh";
import "@babylonjs/core/Meshes/instancedMesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import type { Camera } from "@babylonjs/core/Cameras/camera";
import { Constants } from "@babylonjs/core/Engines/constants";
import { SHIP_KIT_SLOTS } from "@sidereal/content/ship-kit";
import { prefabById } from "@sidereal/content/prefabs";
import { defaultPrefabComponentCatalog } from "@sidereal/content/ship-prefab-catalog";
import {
  volumeGeometry,
  type PrefabComponentCatalog,
  type ShipPrefabDocumentV1,
} from "@sidereal/content/ship-prefab";
import { rasterOutline } from "@sidereal/sim/ship-dresser";
import { prefabIdOfExterior } from "@sidereal/sim/ship-exterior";
import { setMeshRole } from "../mesh-roles";
import { moldedLightRig } from "../molded-plastic";
import {
  assignShipTiers,
  projectedRadiusPx,
  SHIP_LOD,
  type ShipLodTier,
} from "../presentation-lod";
import { meshBoxes } from "./box-mesher";
import { roleSlotMaterial } from "./materials";
import { createPrefabShipView } from "./ship-view";

/** Direct-light share of prefab hull plastic in the game (prefab-ship-presentation.ts). */
const REMOTE_SHIP_DIRECT = 0.6;
/** Hull radius used before a prototype has loaded or for an unpublished hull (m). */
const DEFAULT_RADIUS_M = 8;

export interface RemoteShipSnapshot {
  epoch: number;
  shipMotion: readonly { shipId: string }[];
  shipDescription: readonly {
    shipId: string;
    publishedExteriorAssetId: string;
    appearanceRevision: bigint;
  }[];
}
/** The accepted shared-world store (packages/net SharedWorldStore). */
export interface RemoteShipStore {
  getSnapshot(): RemoteShipSnapshot;
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

export interface ResolvedExterior {
  /** Prototype cache key: the published exterior and the prefab revision actually drawn. */
  key: string;
  doc: ShipPrefabDocumentV1;
  catalog: PrefabComponentCatalog;
  /** False when the bundled prefab revision differs from the pinned one (legacy live pins). */
  exact: boolean;
}

/** The published developer prefab for a server-named exterior (client-bundled content). */
export function resolvePublishedExterior(
  assetId: string,
  revision: bigint,
): ResolvedExterior | undefined {
  const prefabId = prefabIdOfExterior(assetId);
  const doc = prefabId ? prefabById(prefabId) : undefined;
  if (!doc) return undefined;
  return {
    key: `${assetId}@r${doc.revision}`,
    doc,
    catalog: defaultPrefabComponentCatalog(),
    exact: BigInt(doc.revision) === revision,
  };
}

interface SourcePart {
  mesh: Mesh;
  position: Vector3;
  rotation: Quaternion;
  scaling: Vector3;
}
export interface RemoteExteriorPrototype {
  readonly key: string;
  readonly exact: boolean;
  /** Plan radius of the hull around the ship pivot (m). */
  readonly radius: number;
  /** Hidden source meshes (exterior batches and the proxy); lighting binds to these. */
  readonly sources: readonly Mesh[];
  readonly metrics: {
    exteriorMeshes: number;
    exteriorTriangles: number;
    proxyTriangles: number;
  };
  instantiate(
    parent: TransformNode,
    shipId: string,
  ): { full: TransformNode; proxy: TransformNode };
  dispose(): void;
}

function triangles(mesh: Mesh) {
  return (mesh.getTotalIndices() || 0) / 3;
}

/** Low-poly hull proxy (LOD S3): every volume outline extruded to its height, 4 m panels. */
function buildProxy(
  scene: Scene,
  doc: ShipPrefabDocumentV1,
  frame: TransformNode,
  name: string,
): Mesh[] {
  const boxes = doc.volumes.flatMap((v) => {
    const g = volumeGeometry(v);
    return g.outline ? rasterOutline(g.outline, g.z, () => "primary", 64) : [];
  });
  if (!boxes.length) return [];
  return meshBoxes(boxes, { chamfer: 0 }).slots.map((s) => {
    const mesh = new Mesh(`${name}:proxy:${SHIP_KIT_SLOTS[s.slot]}`, scene);
    const vd = new VertexData();
    vd.positions = Float32Array.from(s.positions);
    vd.normals = Float32Array.from(s.normals);
    vd.indices = Uint32Array.from(s.indices);
    vd.applyToMesh(mesh, false);
    // Box-mesher geometry is counter-clockwise outward (ship-view.ts makeMesh).
    mesh.sideOrientation = Constants.MATERIAL_CounterClockWiseSideOrientation;
    mesh.parent = frame;
    mesh.material = roleSlotMaterial(
      scene,
      doc.theme,
      SHIP_KIT_SLOTS[s.slot],
      "hull",
    );
    setMeshRole(mesh, "remote");
    return mesh;
  });
}

/** Build one exterior prototype: never deck geometry, interior modules, furniture or lights. */
export async function loadRemoteExteriorPrototype(
  scene: Scene,
  resolved: ResolvedExterior,
  options: { standinComponents?: boolean } = {},
): Promise<RemoteExteriorPrototype> {
  const root = new TransformNode(`remote-exterior:${resolved.key}`, scene);
  const view = await createPrefabShipView(scene, resolved.doc, {
    catalog: resolved.catalog,
    view: "flight",
    exteriorOnly: true,
    parent: root,
    standinComponents: options.standinComponents,
  });
  const frame = view.root
    .getChildren()
    .find((n) => n.name.endsWith(":prefab-frame")) as TransformNode | undefined;
  const exterior = view.root
    .getChildMeshes(false)
    .filter(
      (m): m is Mesh =>
        m instanceof Mesh &&
        m.isEnabled() &&
        m.getTotalVertices() > 0 &&
        !m.hasThinInstances,
    );
  const proxy = frame
    ? buildProxy(scene, resolved.doc, frame, `remote-exterior:${resolved.key}`)
    : [];
  root.computeWorldMatrix(true);
  const part = (mesh: Mesh): SourcePart => {
    const position = new Vector3(),
      rotation = new Quaternion(),
      scaling = new Vector3();
    mesh.computeWorldMatrix(true).decompose(scaling, rotation, position);
    mesh.isVisible = false;
    mesh.isPickable = false;
    mesh.receiveShadows = true;
    return { mesh, position, rotation, scaling };
  };
  const fullParts = exterior.map(part);
  const proxyParts = proxy.map(part);
  // Same finish as the own prefab hull: plastic takes a share of the key light.
  for (const mesh of [...exterior, ...proxy])
    if (mesh.material instanceof PBRMaterial)
      mesh.material.directIntensity = REMOTE_SHIP_DIRECT;
  const sources = [...exterior, ...proxy];
  moldedLightRig(scene).include(sources);
  const bounds = root.getHierarchyBoundingVectors(true);
  const radius = Math.max(
    DEFAULT_RADIUS_M / 4,
    Math.hypot(
      Math.max(Math.abs(bounds.min.x), Math.abs(bounds.max.x)),
      Math.max(Math.abs(bounds.min.z), Math.abs(bounds.max.z)),
    ) || DEFAULT_RADIUS_M,
  );
  let disposed = false;
  const instanceParts = (
    parts: SourcePart[],
    parent: TransformNode,
    shipId: string,
  ) => {
    for (const p of parts) {
      const mesh: InstancedMesh = p.mesh.createInstance(
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
  return {
    key: resolved.key,
    exact: resolved.exact,
    radius,
    sources,
    metrics: {
      exteriorMeshes: exterior.length,
      exteriorTriangles: exterior.reduce((n, m) => n + triangles(m), 0),
      proxyTriangles: proxy.reduce((n, m) => n + triangles(m), 0),
    },
    instantiate(parent, shipId) {
      if (disposed) throw Error("Remote exterior prototype disposed");
      const full = new TransformNode(`remote-ship-${shipId}:full`, scene);
      const coarse = new TransformNode(`remote-ship-${shipId}:proxy`, scene);
      full.parent = parent;
      coarse.parent = parent;
      instanceParts(fullParts, full, shipId);
      instanceParts(proxyParts, coarse, shipId);
      return { full, proxy: coarse };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      view.dispose();
      root.dispose();
    },
  };
}

/** Flat chevron pointing along ship forward (render -Z), unit size; LOD S5 marker. */
function createMarkerSource(scene: Scene): Mesh {
  const mesh = new Mesh("remote-ship-marker-source", scene);
  const vd = new VertexData();
  vd.positions = [0, 0, -0.6, 0.45, 0, 0.45, 0, 0, 0.15, -0.45, 0, 0.45];
  vd.indices = [0, 2, 1, 0, 3, 2];
  vd.normals = [0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0];
  vd.applyToMesh(mesh, false);
  const material = new StandardMaterial("remote-ship-marker", scene);
  material.disableLighting = true;
  material.emissiveColor = new Color3(0.45, 0.85, 1);
  material.diffuseColor = Color3.Black();
  material.specularColor = Color3.Black();
  material.backFaceCulling = false;
  mesh.material = material;
  mesh.isVisible = false;
  mesh.isPickable = false;
  setMeshRole(mesh, "effect");
  return mesh;
}

interface Entry {
  shipId: string;
  root: TransformNode;
  /** Prototype key this entry wants, or undefined for an unpublished hull (marker only). */
  key?: string;
  prototype?: RemoteExteriorPrototype;
  full?: TransformNode;
  proxy?: TransformNode;
  marker: InstancedMesh;
  tier?: ShipLodTier;
}

export interface RemoteShipExteriorsOptions {
  localShipId: () => string | undefined;
  resolve?: typeof resolvePublishedExterior;
  load?: (
    scene: Scene,
    resolved: ResolvedExterior,
  ) => Promise<RemoteExteriorPrototype>;
  fullDetailBudget?: number;
  onError?: (error: unknown) => void;
}

/**
 * Remote ship presentation keyed by the store's accepted rows. Every perceived ship other than
 * the viewer's own gets a root: its exterior at the tier its projected size allows, or a marker
 * while its hull is unpublished or still loading. Rows leaving the store remove the ship at once.
 */
export function createRemoteShipExteriors(
  scene: Scene,
  store: RemoteShipStore,
  options: RemoteShipExteriorsOptions,
) {
  const resolve = options.resolve ?? resolvePublishedExterior;
  const load = options.load ?? loadRemoteExteriorPrototype;
  const budget = options.fullDetailBudget ?? SHIP_LOD.fullDetailBudget;
  const group = new TransformNode("remote-ships", scene);
  const markerSource = createMarkerSource(scene);
  markerSource.parent = group;
  const prototypes = new Map<
    string,
    Promise<RemoteExteriorPrototype | undefined>
  >();
  const loaded = new Map<string, RemoteExteriorPrototype>();
  const entries = new Map<string, Entry>();
  let disposed = false,
    epoch = store.getSnapshot().epoch,
    inexact = 0;

  const release = (entry: Entry) => {
    entry.full?.dispose();
    entry.proxy?.dispose();
    entry.full = entry.proxy = entry.prototype = entry.tier = undefined;
  };
  const destroy = (id: string) => {
    const entry = entries.get(id);
    if (!entry) return;
    entries.delete(id);
    entry.root.dispose();
  };
  const attach = (entry: Entry) => {
    const prototype = entry.key ? loaded.get(entry.key) : undefined;
    if (!prototype || entry.prototype === prototype) return;
    release(entry);
    const { full, proxy } = prototype.instantiate(entry.root, entry.shipId);
    full.setEnabled(false);
    proxy.setEnabled(false);
    Object.assign(entry, { prototype, full, proxy });
  };
  const request = (resolved: ResolvedExterior) => {
    if (prototypes.has(resolved.key)) return;
    if (!resolved.exact) inexact++;
    prototypes.set(
      resolved.key,
      load(scene, resolved)
        .then((prototype) => {
          if (disposed || scene.isDisposed) {
            prototype.dispose();
            return undefined;
          }
          loaded.set(resolved.key, prototype);
          for (const entry of entries.values())
            if (entry.key === resolved.key) attach(entry);
          return prototype;
        })
        .catch((error) => {
          // The ship stays a marker; never hidden because its hull failed to load.
          if (!disposed) options.onError?.(error);
          return undefined;
        }),
    );
  };
  const clear = () => {
    for (const id of [...entries.keys()]) destroy(id);
  };
  const reconcile = () => {
    if (disposed) return;
    const snapshot = store.getSnapshot();
    if (snapshot.epoch !== epoch) {
      clear();
      epoch = snapshot.epoch;
    }
    const local = options.localShipId();
    const descriptions = new Map(
      snapshot.shipDescription.map((d) => [d.shipId, d]),
    );
    const wanted = new Set(
      snapshot.shipMotion.map((m) => m.shipId).filter((id) => id !== local),
    );
    for (const id of [...entries.keys()]) if (!wanted.has(id)) destroy(id);
    for (const id of wanted) {
      const d = descriptions.get(id);
      const resolved = d
        ? resolve(d.publishedExteriorAssetId, d.appearanceRevision)
        : undefined;
      let entry = entries.get(id);
      if (!entry) {
        const root = new TransformNode(`remote-ship-${id}`, scene);
        root.parent = group;
        // Never flash a newly perceived ship at the camera origin before its first sample.
        root.setEnabled(false);
        root.metadata = { role: "remote", remoteShipId: id };
        const marker = markerSource.createInstance(`remote-ship-${id}:marker`);
        marker.parent = root;
        marker.isVisible = true;
        marker.isPickable = false;
        marker.setEnabled(false);
        entry = { shipId: id, root, marker };
        entries.set(id, entry);
      }
      if (entry.key !== resolved?.key) {
        release(entry);
        entry.key = resolved?.key;
      }
      if (resolved) {
        request(resolved);
        attach(entry);
      }
    }
  };
  const unbind = (["shipMotion", "shipDescription", "admission"] as const).map(
    (table) => store.subscribeTable(table, reconcile),
  );
  reconcile();
  let lastLocal = options.localShipId();
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    for (const stop of unbind) stop();
    clear();
    for (const p of loaded.values()) p.dispose();
    loaded.clear();
    markerSource.material?.dispose();
    markerSource.dispose();
    group.dispose();
    scene.onDisposeObservable.remove(sceneObserver);
  };
  const sceneObserver = scene.onDisposeObservable.add(dispose);

  return {
    group,
    /** Per frame: pose every root from the accepted store and pick its LOD tier. */
    update(
      origin: { x: number; y: number },
      nowMs: number,
      camera: Camera | null | undefined,
      viewportHeightPx: number,
      delayMs = 100,
    ) {
      if (disposed) return;
      if (options.localShipId() !== lastLocal) {
        lastLocal = options.localShipId();
        reconcile();
      }
      if (![origin.x, origin.y, nowMs].every(Number.isFinite)) return;
      const eye = camera?.globalPosition;
      const fov = camera?.fov ?? 0.8;
      const sized: { id: string; px: number; previous?: ShipLodTier }[] = [];
      for (const [id, entry] of entries) {
        const sample = store.sampleShip(id, nowMs, delayMs);
        if (
          !sample ||
          ![sample.x, sample.y, sample.heading].every(Number.isFinite)
        ) {
          entry.root.setEnabled(false);
          continue;
        }
        entry.root.setEnabled(true);
        entry.root.position.set(sample.x - origin.x, 0, -(sample.y - origin.y));
        entry.root.rotation.y = sample.heading;
        const radius = entry.prototype?.radius ?? DEFAULT_RADIUS_M;
        const distance = eye
          ? Vector3.Distance(eye, entry.root.position)
          : Number.POSITIVE_INFINITY;
        sized.push({
          id,
          px: projectedRadiusPx(radius, distance, fov, viewportHeightPx),
          previous: entry.tier,
        });
      }
      const tiers = assignShipTiers(sized, budget);
      for (const { id, px } of sized) {
        const entry = entries.get(id)!;
        // Without a loaded hull the ship is a marker, whatever its size.
        const tier: ShipLodTier = entry.prototype ? tiers.get(id)! : 2;
        entry.tier = entry.prototype ? tier : undefined;
        entry.full?.setEnabled(tier === 0);
        entry.proxy?.setEnabled(tier === 1);
        entry.marker.setEnabled(tier === 2);
        if (tier === 2) {
          // A constant on-screen size: scale by metres per pixel at this distance.
          const radius = entry.prototype?.radius ?? DEFAULT_RADIUS_M;
          const metresPerPx = px > 0 ? radius / px : 1;
          entry.marker.scaling.setAll(
            Math.max(1, SHIP_LOD.markerPx * metresPerPx),
          );
          entry.marker.position.y = 2;
        }
      }
    },
    /** Review diagnostics: every represented remote ship and its tier. */
    diagnostics() {
      return {
        ships: [...entries.values()]
          .map((e) => ({
            shipId: e.shipId,
            exterior: e.key ?? null,
            loaded: !!e.prototype,
            enabled: e.root.isEnabled(),
            tier:
              e.tier === 0
                ? "exterior"
                : e.tier === 1
                  ? "proxy"
                  : ("marker" as const),
          }))
          .sort((a, b) => (a.shipId < b.shipId ? -1 : 1)),
        prototypes: [...loaded.values()].map((p) => ({
          key: p.key,
          exact: p.exact,
          radius: p.radius,
          ...p.metrics,
        })),
        inexactPrototypes: inexact,
      };
    },
    /** Hidden prototype sources (for lighting/occlusion lists); instances share their bindings. */
    sourceMeshes(): Mesh[] {
      return [...loaded.values()].flatMap((p) => [...p.sources]);
    },
    /** Resolves when every requested prototype has settled (review harnesses). */
    async settled() {
      await Promise.all(prototypes.values());
    },
    get count() {
      return entries.size;
    },
    dispose,
  };
}

export type RemoteShipExteriors = ReturnType<typeof createRemoteShipExteriors>;
