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
import { LoadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader";
import "@babylonjs/loaders/glTF";

export interface GlbPrimitive {
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
  return bytes.length >= 12 && bytes[0] === 0x67 && bytes[1] === 0x6c && bytes[2] === 0x54 && bytes[3] === 0x46;
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

function extract(mesh: Mesh): GlbPrimitive | null {
  const data = VertexData.ExtractFromMesh(mesh, true, true);
  if (!data.positions || !data.indices || !data.positions.length) return null;
  data.transform(mesh.computeWorldMatrix(true));
  const positions = Float32Array.from(data.positions);
  const normals = data.normals ? Float32Array.from(data.normals) : new Float32Array(positions.length);
  if (!data.normals) VertexData.ComputeNormals(positions, data.indices, normals);
  const b: [number, number, number, number, number, number] = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i += 3)
    for (let k = 0; k < 3; k++) {
      b[k] = Math.min(b[k], positions[i + k]);
      b[k + 3] = Math.max(b[k + 3], positions[i + k]);
    }
  return { material: mesh.material?.name ?? "", positions, normals, indices: Uint32Array.from(data.indices), triangles: data.indices.length / 3, bounds: b };
}

async function load(scene: Scene, url: string): Promise<GlbGeometry | null> {
  const bytes = await fetchGlb(url);
  if (!bytes) return null;
  const container = await LoadAssetContainerAsync(bytes, scene, { pluginExtension: ".glb" });
  try {
    const primitives = container.meshes
      .filter((m): m is Mesh => m instanceof Mesh && m.getTotalVertices() > 0)
      .map(extract)
      .filter((p): p is GlbPrimitive => !!p);
    const bounds: [number, number, number, number, number, number] = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
    for (const p of primitives)
      for (let k = 0; k < 3; k++) {
        bounds[k] = Math.min(bounds[k], p.bounds[k]);
        bounds[k + 3] = Math.max(bounds[k + 3], p.bounds[k + 3]);
      }
    return { url, primitives, triangles: primitives.reduce((n, p) => n + p.triangles, 0), bounds };
  } finally {
    container.dispose();
  }
}

/** Load (once per scene) the geometry of a GLB. Resolves null when the file is missing or not a GLB. */
export function loadGlbGeometry(scene: Scene, url: string): Promise<GlbGeometry | null> {
  const c = cache(scene);
  let p = c.get(url);
  if (!p) {
    p = load(scene, url).catch((e) => {
      console.warn(`prefab-ship: failed to load ${url}`, e);
      return null;
    });
    c.set(url, p);
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
