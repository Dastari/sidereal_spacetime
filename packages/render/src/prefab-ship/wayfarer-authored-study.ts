import type { BaseTexture } from "@babylonjs/core/Materials/Textures/baseTexture";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { AuthoredAssetLighting } from "../authored-asset-lighting";
/** Private intact authored-kit trial. No catalog, collision or damage integration. */
import type { Scene } from "@babylonjs/core/scene";
import type { AssetContainer } from "@babylonjs/core/assetContainer";
import { LoadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader";
import "@babylonjs/loaders/glTF";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { MultiMaterial } from "@babylonjs/core/Materials/multiMaterial";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { Constants } from "@babylonjs/core/Engines/constants";
import { Matrix } from "@babylonjs/core/Maths/math.vector";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { appendTransformed, meshGeometry, type MergeGroup } from "./batch";
import { GLTF_TO_ZUP, multiply, prefabFrameMatrix, type Mat4 } from "./frames";
import {
  applySurfaceFinish,
  SURFACE_FAMILIES,
  type SurfaceFamily,
} from "../molded-plastic";
import { GAME_PBR_LIGHT_LIMIT, setPbrLightBudget } from "../pbr-light-budget";
import { setMeshRole, type MeshRole } from "../mesh-roles";

/** Fixed and movable room contents share one geometry diagnostic category.
 * Structural doors, floors and partitions retain the ship's presentation. */
export function authoredPresentationRole(role: string): MeshRole {
  return role === "room-content" || role === "equipment" || role === "cargo"
    ? "equipment"
    : "hull";
}

type JsonObject = Record<string, unknown>;
export interface AuthoredPieceInput {
  id: string;
  file: string;
  sha256: string;
  triangles: number;
  frame: "piece-local" | "ship-node-baked";
}
export interface AuthoredInstanceInput {
  object: string;
  piece: string;
  role: string;
  /** Authoring column-vector matrix, selected at true prop scale. */
  matrix: readonly (readonly number[])[];
}
export interface AuthoredPaletteInput {
  family: string;
  /** Theme mutation is a rendering policy, even when initial colours match. */
  sourceSlotName?: string;
}
const themeSlots = [
  "primary",
  "secondary",
  "accent",
  "trim",
  "dark",
  "metal",
  "emit_a",
  "emit_b",
] as const;
/** Match the actual template mutation policy; Blender aliases without a palette
 * slot mapping must not inherit the base material's later theme edits. */
export function authoredThemeSlot(
  name: string,
  palette: Readonly<Record<string, AuthoredPaletteInput>>,
) {
  const slot = palette[name]?.sourceSlotName ?? name.split("@")[0];
  return themeSlots.find((candidate) => candidate === slot);
}

export interface AuthoredRange {
  object: string;
  piece: string;
  role: string;
  material: string;
  indexStart: number;
  indexCount: number;
}

function object(value: unknown): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw Error("Invalid authored GLB object");
  return value as JsonObject;
}
function array(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw Error("Invalid authored GLB array");
  return value;
}
function integer(value: unknown): number {
  if (!Number.isInteger(value) || (value as number) < 0)
    throw Error("Invalid authored GLB index");
  return value as number;
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
      .join(",")}}`;
  const encoded = JSON.stringify(value);
  if (encoded === undefined)
    throw Error("Invalid authored material identity value");
  return encoded;
}

/** Matrices supplied by the study are column-vector rows, unlike Babylon Matrix.m. */
export function authoredInstanceMatrix(
  frame: AuthoredPieceInput["frame"],
  authorMatrix: readonly (readonly number[])[],
  origin: readonly [number, number],
): Mat4 {
  if (
    authorMatrix.length !== 4 ||
    authorMatrix.some(
      (r) => r.length !== 4 || r.some((v) => !Number.isFinite(v)),
    )
  )
    throw Error("Invalid authored placement matrix");
  const placement = Array.from(
    { length: 16 },
    (_, i) => authorMatrix[i % 4][Math.floor(i / 4)],
  );
  const converted =
    frame === "ship-node-baked"
      ? GLTF_TO_ZUP
      : multiply(GLTF_TO_ZUP, placement);
  return multiply(converted, prefabFrameMatrix(origin));
}

export interface AuthoredGlbDocument {
  json: JsonObject;
  binary: Uint8Array;
}
/** Verified GLB bytes remain the source of material/embedded-image identity. */
export function readAuthoredGlb(
  bytes: Uint8Array,
  expected: string,
): AuthoredGlbDocument {
  if (
    !/^[a-f0-9]{64}$/.test(expected) ||
    bytesToHex(sha256(bytes)) !== expected
  )
    throw Error("Authored GLB hash mismatch");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (
    bytes.length < 28 ||
    view.getUint32(0, true) !== 0x46546c67 ||
    view.getUint32(4, true) !== 2 ||
    view.getUint32(8, true) !== bytes.length
  )
    throw Error("Invalid authored GLB header");
  const length = view.getUint32(12, true),
    end = 20 + length;
  if (
    view.getUint32(16, true) !== 0x4e4f534a ||
    end + 8 > bytes.length ||
    view.getUint32(end + 4, true) !== 0x004e4942 ||
    end + 8 + view.getUint32(end, true) !== bytes.length
  )
    throw Error("Invalid authored GLB chunks");
  const json = object(
    JSON.parse(new TextDecoder().decode(bytes.subarray(20, end))),
  );
  const binary = bytes.subarray(end + 8);
  if (
    array(json.buffers).length !== 1 ||
    object(array(json.buffers)[0]).uri !== undefined
  )
    throw Error("External authored buffer unsupported");
  return { json, binary };
}

export function authoredMaterialIdentity(
  document: AuthoredGlbDocument,
  definition: JsonObject,
  family: SurfaceFamily,
): string {
  const { json, binary } = document;
  const expand = (value: unknown, key = ""): unknown => {
    if (Array.isArray(value)) return value.map((v) => expand(v));
    if (!value || typeof value !== "object") return value;
    const record = object(value);
    if (key.endsWith("Texture") && record.index !== undefined) {
      const texture = object(array(json.textures)[integer(record.index)]);
      const image = object(array(json.images)[integer(texture.source)]);
      if (image.uri !== undefined || typeof image.mimeType !== "string")
        throw Error("External authored image unsupported");
      const range = object(array(json.bufferViews)[integer(image.bufferView)]);
      const start =
          range.byteOffset === undefined ? 0 : integer(range.byteOffset),
        length = integer(range.byteLength);
      if (integer(range.buffer) !== 0 || start + length > binary.length)
        throw Error("Invalid embedded authored image range");
      const sampler =
        texture.sampler === undefined
          ? null
          : object(array(json.samplers)[integer(texture.sampler)]);
      const parameters = Object.fromEntries(
        Object.entries(record).filter(([k]) => k !== "index"),
      );
      const textureDefinition = Object.fromEntries(
        Object.entries(texture).filter(
          ([k]) => k !== "source" && k !== "sampler",
        ),
      );
      return {
        parameters: expand(parameters),
        texture: textureDefinition,
        sampler,
        image: {
          mimeType: image.mimeType,
          sha256: bytesToHex(sha256(binary.subarray(start, start + length))),
        },
      };
    }
    return Object.fromEntries(
      Object.entries(record).map(([k, v]) => [k, expand(v, k)]),
    );
  };
  return bytesToHex(
    sha256(
      new TextEncoder().encode(
        canonical({
          // Fold Blender duplicate suffixes only. Semantic base names still
          // distinguish theme slots and legacy halo policy. Every original
          // label survives in AuthoredRange; all shading inputs remain exact.
          definition: expand({
            ...definition,
            name:
              typeof definition.name === "string"
                ? definition.name.replace(/\.\d{3,}$/, "")
                : definition.name,
          }),
          family,
          finishPolicy: "shared-molded-v1",
          emissionPolicy: "min-source-strength-1",
        }),
      ),
    ),
  );
}

function materialFamily(
  definition: JsonObject,
  palette: Readonly<Record<string, AuthoredPaletteInput>>,
): SurfaceFamily {
  const name = definition.name;
  if (typeof name !== "string") throw Error("Unnamed authored material");
  const source =
    palette[name]?.family ??
    (definition.extras ? object(definition.extras).sr_family : undefined);
  const family = source === "plastic-deck" ? "plastic-dark" : source;
  if (!SURFACE_FAMILIES.includes(family as SurfaceFamily))
    throw Error(`Unknown authored surface family: ${name}`);
  return family as SurfaceFamily;
}

/** Compact one actual indexed submesh; preserve its complete supported source channels. */
function primitive(mesh: Mesh, indexStart: number, indexCount: number) {
  const g = meshGeometry(mesh);
  if (
    !g?.normals ||
    indexStart + indexCount > g.indices.length ||
    indexCount % 3
  )
    throw Error("Invalid authored indexed primitive");
  const used = new Map<number, number>(),
    positions: number[] = [],
    normals: number[] = [],
    indices: number[] = [],
    uvs: number[] = [],
    uvs2: number[] = [],
    tangents: number[] = [];
  for (let i = indexStart; i < indexStart + indexCount; i++) {
    const old = g.indices[i];
    let next = used.get(old);
    if (next === undefined) {
      next = used.size;
      used.set(old, next);
      for (let j = 0; j < 3; j++) {
        positions.push(g.positions[old * 3 + j]);
        normals.push(g.normals[old * 3 + j]);
      }
      if (g.uvs) for (let j = 0; j < 2; j++) uvs.push(g.uvs[old * 2 + j]);
      if (g.uvs2) for (let j = 0; j < 2; j++) uvs2.push(g.uvs2[old * 2 + j]);
      if (g.tangents)
        for (let j = 0; j < 4; j++) tangents.push(g.tangents[old * 4 + j]);
    }
    indices.push(next);
  }
  return {
    positions,
    normals,
    indices,
    ...(g.uvs ? { uvs } : {}),
    ...(g.uvs2 ? { uvs2 } : {}),
    ...(g.tangents ? { tangents } : {}),
  };
}

export type AuthoredPrimitive = ReturnType<typeof primitive>;

interface AuthoredSource {
  container: AssetContainer;
  document: AuthoredGlbDocument;
  definitions: Map<string, JsonObject>;
  primitives: {
    material: PBRMaterial;
    matrix: Matrix;
    data: AuthoredPrimitive;
    sourceId: number;
    indexStart: number;
  }[];
  identities: Map<JsonObject, Map<SurfaceFamily, string>>;
}

// Only verified public source assets survive a visit. Placement batches, private
// furnishing state and mutable material policy remain owned by each consumer.
const authoredSources = new WeakMap<
  Scene,
  Map<string, Promise<AuthoredSource>>
>();
async function importAuthoredSource(
  scene: Scene,
  piece: AuthoredPieceInput,
  fetchPiece: (piece: AuthoredPieceInput) => Promise<Uint8Array>,
): Promise<AuthoredSource> {
  const bytes = Uint8Array.from(await fetchPiece(piece));
  if (scene.isDisposed) throw Error("Authored study load cancelled");
  const document = readAuthoredGlb(bytes, piece.sha256);
  const definitions = new Map<string, JsonObject>();
  for (const raw of array(document.json.materials)) {
    const def = object(raw);
    if (typeof def.name !== "string" || definitions.has(def.name))
      throw Error("Ambiguous authored material name inside one pinned GLB");
    definitions.set(def.name, def);
  }
  const container = await LoadAssetContainerAsync(bytes, scene, {
    pluginExtension: ".glb",
  });
  try {
    if (scene.isDisposed) throw Error("Authored study load cancelled");
    const primitives: AuthoredSource["primitives"] = [];
    for (const mesh of container.meshes) {
      if (!(mesh instanceof Mesh) || !mesh.getTotalVertices()) continue;
      const matrix = mesh.computeWorldMatrix(true).clone();
      if (!mesh.subMeshes?.length)
        throw Error("Authored mesh missing primitive partitions");
      for (const sub of mesh.subMeshes) {
        const material =
          mesh.material instanceof MultiMaterial
            ? mesh.material.subMaterials[sub.materialIndex]
            : mesh.material;
        if (!(material instanceof PBRMaterial))
          throw Error("Authored primitive lost PBR material");
        primitives.push({
          material,
          matrix,
          data: primitive(mesh, sub.indexStart, sub.indexCount),
          sourceId: mesh.uniqueId,
          indexStart: sub.indexStart,
        });
      }
    }
    // Imported node/GPU buffers are unnecessary once immutable CPU channels and
    // source transforms have been extracted. Textures stay scene-owned.
    for (const mesh of container.meshes) mesh.dispose(false, false);
    return {
      container,
      document,
      definitions,
      primitives,
      identities: new Map(),
    };
  } catch (error) {
    container.dispose();
    throw error;
  }
}
function reusableAuthoredSource(
  scene: Scene,
  piece: AuthoredPieceInput,
  fetchPiece: (piece: AuthoredPieceInput) => Promise<Uint8Array>,
) {
  let cache = authoredSources.get(scene);
  if (!cache) {
    cache = new Map();
    authoredSources.set(scene, cache);
    const owned = cache;
    scene.onDisposeObservable.addOnce(() => {
      for (const source of owned.values())
        void source.then(
          (value) => value.container.dispose(),
          () => {},
        );
      owned.clear();
      authoredSources.delete(scene);
    });
  }
  let source = cache.get(piece.sha256);
  if (!source) {
    source = importAuthoredSource(scene, piece, fetchPiece);
    cache.set(piece.sha256, source);
    const owned = cache;
    void source.catch(() => {
      if (owned.get(piece.sha256) === source) owned.delete(piece.sha256);
    });
  }
  return source;
}
function sourceMaterialIdentity(
  source: AuthoredSource,
  definition: JsonObject,
  family: SurfaceFamily,
) {
  let families = source.identities.get(definition);
  if (!families) source.identities.set(definition, (families = new Map()));
  let identity = families.get(family);
  if (!identity) {
    identity = authoredMaterialIdentity(source.document, definition, family);
    families.set(family, identity);
  }
  return identity;
}

/** Own imported materials/textures until all candidate draws have been disposed. */
export async function loadAuthoredStudy(
  scene: Scene,
  pieces: readonly AuthoredPieceInput[],
  instances: readonly AuthoredInstanceInput[],
  palette: Readonly<Record<string, AuthoredPaletteInput>>,
  origin: readonly [number, number],
  fetchPiece: (piece: AuthoredPieceInput) => Promise<Uint8Array>,
  options: {
    /** Owning visibility/cancellation gate; attach before any frame can observe a batch. */
    parent?: TransformNode;
    /** Cache immutable pinned source channels; never retain private placement batches. */
    reuseSources?: boolean;
    batchRegions?: ReadonlyMap<string, string>;
    /** Generic templates mutate supported palette slots after import. */
    themed?: boolean;
    /** Source-pinned reusable object metadata; independent of scene and placement names. */
    assetLighting?: ReadonlyMap<string, AuthoredAssetLighting>;
    /** Optional grammar clipping/deformation, after the native node and instance transforms.
     * The returned channels retain the native material, UVs and placement provenance. */
    transformGeometry?: (
      row: AuthoredInstanceInput,
      geometry: AuthoredPrimitive,
      transform: Matrix,
    ) => { geometry: AuthoredPrimitive; transform: Matrix };
  } = {},
) {
  if (!scene.useRightHandedSystem)
    throw Error("Authored study needs the normal right-handed game scene");
  const batchRegions = new Map(options.batchRegions);
  const objects = new Set(instances.map((row) => row.object));
  for (const [id, region] of batchRegions)
    if (!objects.has(id) || typeof region !== "string" || !region.trim())
      throw Error("Unknown authored receiver placement or empty region");
  const containers: AssetContainer[] = [],
    meshes: Mesh[] = [];
  const materials = new Map<string, PBRMaterial>();
  const clonedTextures = new Set<BaseTexture>();
  const groups = new Map<
    string,
    {
      geometry: MergeGroup;
      material: PBRMaterial;
      ranges: AuthoredRange[];
      region: string;
      materialKey: string;
      role: MeshRole;
    }
  >();
  const materialPolicy: unknown[] = [];
  let importedPrimitives = 0,
    uniqueTriangles = 0,
    disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    scene.onDisposeObservable.remove(sceneDisposeObserver);
    for (const mesh of meshes) mesh.dispose(false, false);
    for (const container of containers) container.dispose();
    if (options.reuseSources)
      for (const material of materials.values()) material.dispose(false, false);
    for (const texture of clonedTextures) texture.dispose();
  };
  const ensureActive = () => {
    if (disposed || scene.isDisposed || options.parent?.isDisposed())
      throw Error("Authored study load cancelled");
  };
  const sceneDisposeObserver = scene.onDisposeObservable.addOnce(dispose);
  try {
    for (const piece of pieces) {
      ensureActive();
      const source = await (options.reuseSources
        ? reusableAuthoredSource(scene, piece, fetchPiece)
        : importAuthoredSource(scene, piece, async (input) => {
            const bytes = await fetchPiece(input);
            ensureActive();
            return bytes;
          }));
      if (!options.reuseSources) containers.push(source.container);
      ensureActive();
      const { definitions } = source;
      let pieceTriangles = 0;
      const placements = instances.filter((row) => row.piece === piece.id);
      if (!placements.length)
        throw Error(`Unplaced authored piece: ${piece.id}`);
      for (const part of source.primitives) {
        const original = part.material;
        const nodeMatrix = part.matrix;
        const definition = definitions.get(original.name);
        if (!definition)
          throw Error(
            `Imported authored material lost its source definition: ${original.name}`,
          );
        const family = materialFamily(definition, palette);
        const sourceStrength = definition.extensions
          ? (object(
              object(definition.extensions).KHR_materials_emissive_strength ??
                {},
            ).emissiveStrength ?? 1)
          : 1;
        if (
          typeof sourceStrength !== "number" ||
          !Number.isFinite(sourceStrength) ||
          sourceStrength < 0
        )
          throw Error("Invalid authored emission strength");
        const ownedEmission = options.assetLighting?.get(piece.sha256)
          ?.emissions[original.name];
        if (
          ownedEmission &&
          (ownedEmission.strength !== sourceStrength ||
            canonical(ownedEmission.factor) !==
              canonical(definition.emissiveFactor))
        )
          throw Error("Changed authored asset emission definition");
        const gameStrength = ownedEmission
          ? sourceStrength
          : Math.min(sourceStrength, 1);
        const sourceKey = canonical([
          sourceMaterialIdentity(source, definition, family),
          palette[original.name]?.sourceSlotName ?? null,
          options.themed
            ? (authoredThemeSlot(original.name, palette) ?? null)
            : null,
        ]);
        const key = !ownedEmission
          ? sourceKey
          : canonical([sourceKey, "asset-owned-emission"]);
        let pooled = materials.get(key);
        if (!pooled) {
          pooled = options.reuseSources
            ? original.clone(original.name)
            : original;
          if (options.reuseSources)
            for (const texture of pooled.getActiveTextures())
              clonedTextures.add(texture);
          materials.set(key, pooled);
          applySurfaceFinish(pooled, family);
          pooled.emissiveIntensity = gameStrength;
          if (ownedEmission)
            pooled.metadata = {
              ...pooled.metadata,
              authoredAssetEmission: ownedEmission,
            };
          setPbrLightBudget(pooled, GAME_PBR_LIGHT_LIMIT);
          materialPolicy.push({
            name: original.name,
            key,
            family,
            sourceStrength,
            gameStrength: pooled.emissiveIntensity,
            assetOwnedEmission: Boolean(ownedEmission),
            textureNames: pooled.getActiveTextures().map((t) => t.name),
          });
        }
        const data = part.data;
        pieceTriangles += data.indices.length / 3;
        importedPrimitives++;
        for (const row of placements) {
          const region = batchRegions.get(row.object) ?? "";
          const compatibleKey = region ? canonical([key, region]) : key;
          const role = authoredPresentationRole(row.role);
          // Preserve material pooling and the existing eligible light regions;
          // only independently suppressible geometry needs a separate batch.
          const presentationKey =
            role === "equipment"
              ? canonical([compatibleKey, "equipment"])
              : compatibleKey;
          // Glass and decals retain independent placement depth sorting.
          const batchKey =
            definition.alphaMode === "BLEND"
              ? `${presentationKey}:${row.object}:${part.sourceId}:${part.indexStart}`
              : presentationKey;
          let group = groups.get(batchKey);
          if (!group) {
            group = {
              geometry: {
                key: batchKey,
                positions: [],
                normals: [],
                indices: [],
              },
              material: pooled,
              ranges: [],
              region,
              materialKey: key,
              role,
            };
            groups.set(batchKey, group);
          }
          let transform = nodeMatrix.multiply(
            Matrix.FromArray(
              authoredInstanceMatrix(piece.frame, row.matrix, origin),
            ),
          );
          let placed = data;
          if (options.transformGeometry) {
            const adjusted = options.transformGeometry(row, data, transform);
            placed = adjusted.geometry;
            transform = adjusted.transform;
          }
          const start = group.geometry.indices.length;
          appendTransformed(
            group.geometry,
            placed.positions,
            placed.normals,
            placed.indices,
            transform.asArray(),
            placed,
            { correctNormals: true },
          );
          group.ranges.push({
            object: row.object,
            piece: piece.id,
            role: row.role,
            material: original.name,
            indexStart: start,
            indexCount: placed.indices.length,
          });
        }
      }
      if (pieceTriangles !== piece.triangles)
        throw Error(
          `Authored imported triangle mismatch: ${piece.id} (${pieceTriangles}/${piece.triangles})`,
        );
      uniqueTriangles += pieceTriangles;
    }
    // AssetContainer import removes these from the scene registry. Retained
    // originals must participate in scene-wide shader/prepass invalidation.
    // Their containers continue to own disposal; no source meshes are admitted.
    ensureActive();
    const usedMaterials = new Set(
      [...groups.values()].map((group) => group.material),
    );
    for (const material of usedMaterials)
      if (!scene.materials.includes(material)) scene.addMaterial(material);
    for (const [key, group] of groups) {
      if (!group.geometry.indices.length) continue;
      const mesh = new Mesh(`authored-study:${key}`, scene),
        data = new VertexData();
      mesh.parent = options.parent ?? null;
      data.positions = Float32Array.from(group.geometry.positions);
      data.normals = Float32Array.from(group.geometry.normals);
      data.indices = Uint32Array.from(group.geometry.indices);
      if (group.geometry.uvs) data.uvs = Float32Array.from(group.geometry.uvs);
      if (group.geometry.uvs2)
        data.uvs2 = Float32Array.from(group.geometry.uvs2);
      if (group.geometry.tangents)
        data.tangents = Float32Array.from(group.geometry.tangents);
      data.applyToMesh(mesh);
      mesh.material = group.material;
      mesh.sideOrientation = Constants.MATERIAL_CounterClockWiseSideOrientation;
      mesh.receiveShadows = true;
      setMeshRole(mesh, group.role);
      mesh.metadata = {
        ...mesh.metadata,
        authoredStudy: {
          materialKey: group.materialKey,
          placementRanges: group.ranges,
          ...(batchRegions.size
            ? { receiverRegion: group.region || "rest" }
            : {}),
        },
      };
      meshes.push(mesh);
    }
    const report = {
      pieces: pieces.length,
      instances: instances.length,
      importedPrimitives,
      uniqueTriangles,
      placedTriangles: meshes.reduce((n, m) => n + m.getTotalIndices() / 3, 0),
      batches: meshes.length,
      vertexBufferBytes: meshes.reduce(
        (n, m) => n + m.getTotalVertices() * 8 * 4 + m.getTotalIndices() * 4,
        0,
      ),
      ownedImportedTextures: options.reuseSources
        ? new Set(
            [...materials.values()].flatMap((material) =>
              material.getActiveTextures(),
            ),
          ).size
        : containers.reduce((n, c) => n + c.textures.length, 0),
      materialPolicy,
      placementRanges: [...groups.values()].flatMap((g) => g.ranges),
      presentationOnly: true,
    };
    return {
      meshes,
      report,
      dispose,
      get disposed() {
        return disposed;
      },
    };
  } catch (error) {
    dispose();
    throw error;
  }
}
