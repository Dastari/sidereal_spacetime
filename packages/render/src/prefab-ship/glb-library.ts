/**
 * Scene-shared GLB geometry cache for prefab ships: each URL is fetched and parsed once per
 * scene, reduced to CPU vertex arrays per primitive (node transforms baked, glTF frame kept), and
 * reused by every ship view in that scene.
 *
 * GPU buffers are deliberately NOT shared between views: Babylon stores thin-instance matrix
 * buffers on the mesh's Geometry, so two meshes sharing one Geometry would fight over instances.
 * The whole r001 kit is about 2.5 MB of GLB, so a per-view copy is cheap.
 */
import type { Scene } from "@babylonjs/core/scene";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { Matrix } from "@babylonjs/core/Maths/math.vector";
import { LoadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader";
import "@babylonjs/loaders/glTF";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { selectGlbNode } from "./glb-node";
import { transformSurfaceFrame } from "./batch";
import {
  validateSurfaceChannels,
  type SurfaceChannels,
} from "./surface-attributes";

export interface GlbPrimitive extends SurfaceChannels {
  /** glTF material name (slot name for kit pieces). */
  material: string;
  positions: Float32Array;
  normals: Float32Array;
  indices: Uint32Array;
  triangles: number;
  /** Axis-aligned bounds in the glTF frame: [minX, minY, minZ, maxX, maxY, maxZ]. */
  bounds: [number, number, number, number, number, number];
}

export interface GlbGeometry {
  url: string;
  primitives: GlbPrimitive[];
  triangles: number;
  bounds: [number, number, number, number, number, number];
}

const caches = new WeakMap<Scene, Map<string, Promise<GlbGeometry | null>>>();

function cache(scene: Scene) {
  let c = caches.get(scene);
  if (!c) {
    c = new Map();
    caches.set(scene, c);
    scene.onDisposeObservable.addOnce(() => caches.delete(scene));
  }
  return c;
}

/** True when the bytes start with the binary glTF magic (guards against SPA HTML fallbacks). */
export function isGlb(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 12 &&
    bytes[0] === 0x67 &&
    bytes[1] === 0x6c &&
    bytes[2] === 0x54 &&
    bytes[3] === 0x46
  );
}

async function fetchGlb(url: string): Promise<Uint8Array | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const bytes = new Uint8Array(await response.arrayBuffer());
    return isGlb(bytes) ? bytes : null;
  } catch {
    return null;
  }
}

export function extractGlbPrimitive(mesh: Mesh): GlbPrimitive | null {
  const data = VertexData.ExtractFromMesh(mesh, true, true);
  if (!data.positions || !data.indices || !data.positions.length) return null;
  validateSurfaceChannels(
    {
      uvs: data.uvs ?? undefined,
      uvs2: data.uvs2 ?? undefined,
      tangents: data.tangents ?? undefined,
    },
    data.positions.length / 3,
  );
  const matrix = mesh.computeWorldMatrix(true);
  // Babylon's VertexData.transform flips winding on reflection but leaves tangent w unchanged.
  // Preserve the legacy normal path; compute correct authored tangent frames separately.
  const tangents = data.tangents ? Float32Array.from(data.tangents) : undefined;
  if (tangents) {
    // A primitive may supply TANGENT without NORMAL. Its temporary local frame
    // supports tangent transport without changing the legacy generated normals.
    const frameNormals =
      data.normals ?? new Float32Array(data.positions.length);
    if (!data.normals)
      VertexData.ComputeNormals(data.positions, data.indices, frameNormals);
    const normalMatrix = Matrix.Transpose(Matrix.Invert(matrix));
    for (let i = 0; i < tangents.length / 4; i++) {
      const frame = transformSurfaceFrame(
        [frameNormals[i * 3], frameNormals[i * 3 + 1], frameNormals[i * 3 + 2]],
        tangents.subarray(i * 4, i * 4 + 4),
        matrix,
        normalMatrix,
      );
      tangents.set(frame.tangent!, i * 4);
    }
  }
  data.transform(matrix);
  const positions = Float32Array.from(data.positions);
  const normals = data.normals
    ? Float32Array.from(data.normals)
    : new Float32Array(positions.length);
  if (!data.normals)
    VertexData.ComputeNormals(positions, data.indices, normals);
  const b: [number, number, number, number, number, number] = [
    Infinity,
    Infinity,
    Infinity,
    -Infinity,
    -Infinity,
    -Infinity,
  ];
  for (let i = 0; i < positions.length; i += 3)
    for (let k = 0; k < 3; k++) {
      b[k] = Math.min(b[k], positions[i + k]);
      b[k + 3] = Math.max(b[k + 3], positions[i + k]);
    }
  return {
    material: mesh.material?.name ?? "",
    positions,
    normals,
    indices: Uint32Array.from(data.indices),
    ...(data.uvs ? { uvs: Float32Array.from(data.uvs) } : {}),
    ...(data.uvs2 ? { uvs2: Float32Array.from(data.uvs2) } : {}),
    ...(tangents ? { tangents } : {}),
    triangles: data.indices.length / 3,
    bounds: b,
  };
}

const files = new WeakMap<Scene, Map<string, Promise<Uint8Array | null>>>();
async function load(
  scene: Scene,
  url: string,
  node?: string,
): Promise<GlbGeometry | null> {
  let c = files.get(scene);
  if (!c) files.set(scene, (c = new Map()));
  let pending = c.get(url);
  if (!pending) c.set(url, (pending = fetchGlb(url)));
  const bytes = await pending;
  if (!bytes) return null;
  return extractBytes(scene, url, bytes, node);
}

async function extractBytes(
  scene: Scene,
  url: string,
  bytes: Uint8Array,
  node?: string,
): Promise<GlbGeometry> {
  const container = await LoadAssetContainerAsync(
    node ? selectGlbNode(bytes, node) : bytes,
    scene,
    {
      pluginExtension: ".glb",
    },
  );
  try {
    const primitives = container.meshes
      .filter((m): m is Mesh => m instanceof Mesh && m.getTotalVertices() > 0)
      .map(extractGlbPrimitive)
      .filter((p): p is GlbPrimitive => !!p);
    if (!primitives.length)
      throw Error("GLB has no extractable indexed mesh primitives");
    const bounds: [number, number, number, number, number, number] = [
      Infinity,
      Infinity,
      Infinity,
      -Infinity,
      -Infinity,
      -Infinity,
    ];
    for (const p of primitives)
      for (let k = 0; k < 3; k++) {
        bounds[k] = Math.min(bounds[k], p.bounds[k]);
        bounds[k + 3] = Math.max(bounds[k + 3], p.bounds[k + 3]);
      }
    return {
      url,
      primitives,
      triangles: primitives.reduce((n, p) => n + p.triangles, 0),
      bounds,
    };
  } finally {
    container.dispose();
  }
}

/** Candidate import uses these exact validated bytes without a second mutable URL fetch.
 * Geometry identity includes the byte hash and selected node; caller retains URL provenance.
 * Copies before verification so later mutation of a borrowed input cannot change the import. */
export function loadVerifiedGlbGeometry(
  scene: Scene,
  url: string,
  bytes: Uint8Array,
  expectedSha256: string,
  node?: string,
): Promise<GlbGeometry> {
  const owned = Uint8Array.from(bytes);
  if (
    !isGlb(owned) ||
    !/^[a-f0-9]{64}$/.test(expectedSha256) ||
    bytesToHex(sha256(owned)) !== expectedSha256
  )
    return Promise.reject(Error(`Candidate GLB hash/format mismatch: ${url}`));
  const c = cache(scene);
  const key = JSON.stringify([
    "surface-attributes-v1",
    url,
    node ?? null,
    expectedSha256,
  ]);
  let pending = c.get(key);
  if (!pending) {
    pending = extractBytes(scene, url, owned, node);
    c.set(key, pending);
  }
  return pending.then((value) => {
    if (!value) throw Error(`Candidate GLB unavailable: ${url}`);
    return value;
  });
}

/** Load (once per scene) the geometry of a GLB. Resolves null when the file is missing or not a GLB. */
export function loadGlbGeometry(
  scene: Scene,
  url: string,
  node?: string,
): Promise<GlbGeometry | null> {
  const c = cache(scene);
  const key = JSON.stringify(["surface-attributes-v1", url, node ?? null]);
  let p = c.get(key);
  if (!p) {
    p = load(scene, url, node).catch((e) => {
      console.warn(`prefab-ship: failed to load ${url}`, e);
      return null;
    });
    c.set(key, p);
  }
  return p;
}

const manifests = new WeakMap<Scene, Map<string, Promise<unknown>>>();

/** Fetch a JSON document once per scene (kit manifest). Resolves null when unavailable. */
export function loadJsonOnce<T>(scene: Scene, url: string): Promise<T | null> {
  let c = manifests.get(scene);
  if (!c) manifests.set(scene, (c = new Map()));
  let p = c.get(url);
  if (!p) {
    p = fetch(url)
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
    c.set(url, p);
  }
  return p as Promise<T | null>;
}
