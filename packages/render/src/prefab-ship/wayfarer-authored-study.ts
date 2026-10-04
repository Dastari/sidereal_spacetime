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
import { setMeshRole } from "../mesh-roles";

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
          definition: expand(definition),
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

/** Own imported materials/textures until all candidate draws have been disposed. */
export async function loadAuthoredStudy(
  scene: Scene,
  pieces: readonly AuthoredPieceInput[],
  instances: readonly AuthoredInstanceInput[],
  palette: Readonly<Record<string, AuthoredPaletteInput>>,
  origin: readonly [number, number],
  fetchPiece: (piece: AuthoredPieceInput) => Promise<Uint8Array>,
  options: { batchRegions?: ReadonlyMap<string, string> } = {},
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
  const groups = new Map<
    string,
    {
      geometry: MergeGroup;
      material: PBRMaterial;
      ranges: AuthoredRange[];
      region: string;
      materialKey: string;
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
  };
  const ensureActive = () => {
    if (disposed || scene.isDisposed)
      throw Error("Authored study load cancelled");
  };
  const sceneDisposeObserver = scene.onDisposeObservable.addOnce(dispose);
  try {
    for (const piece of pieces) {
      ensureActive();
      const bytes = Uint8Array.from(await fetchPiece(piece));
      ensureActive();
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
      if (disposed || scene.isDisposed) {
        container.dispose();
        throw Error("Authored study load cancelled");
      }
      containers.push(container);
      const local = container.meshes.filter(
        (m): m is Mesh => m instanceof Mesh && m.getTotalVertices() > 0,
      );
      let pieceTriangles = 0;
      const placements = instances.filter((row) => row.piece === piece.id);
      if (!placements.length)
        throw Error(`Unplaced authored piece: ${piece.id}`);
      for (const source of local) {
        const nodeMatrix = source.computeWorldMatrix(true);
        if (!source.subMeshes?.length)
          throw Error("Authored mesh missing primitive partitions");
        for (const sub of source.subMeshes) {
          const original =
            source.material instanceof MultiMaterial
              ? source.material.subMaterials[sub.materialIndex]
              : source.material;
          if (!(original instanceof PBRMaterial))
            throw Error("Authored primitive lost PBR material");
          const definition = definitions.get(original.name);
          if (!definition)
            throw Error(
              `Imported authored material lost its source definition: ${original.name}`,
            );
          const family = materialFamily(definition, palette),
            key = authoredMaterialIdentity(document, definition, family);
          let pooled = materials.get(key);
          if (!pooled) {
            pooled = original;
            materials.set(key, pooled);
            const sourceStrength = definition.extensions
              ? (object(
                  object(definition.extensions)
                    .KHR_materials_emissive_strength ?? {},
                ).emissiveStrength ?? 1)
              : 1;
            if (
              typeof sourceStrength !== "number" ||
              !Number.isFinite(sourceStrength) ||
              sourceStrength < 0
            )
              throw Error("Invalid authored emission strength");
            applySurfaceFinish(pooled, family);
            pooled.emissiveIntensity = Math.min(sourceStrength, 1);
            setPbrLightBudget(pooled, GAME_PBR_LIGHT_LIMIT);
            materialPolicy.push({
              name: original.name,
              key,
              family,
              sourceStrength,
              gameStrength: pooled.emissiveIntensity,
              textureNames: pooled.getActiveTextures().map((t) => t.name),
            });
          }
          const data = primitive(source, sub.indexStart, sub.indexCount);
          pieceTriangles += sub.indexCount / 3;
          importedPrimitives++;
          for (const row of placements) {
            const region = batchRegions.get(row.object) ?? "";
            const compatibleKey = region ? canonical([key, region]) : key;
            // Glass and decals retain independent placement depth sorting.
            const batchKey =
              definition.alphaMode === "BLEND"
                ? `${compatibleKey}:${row.object}:${source.uniqueId}:${sub.indexStart}`
                : compatibleKey;
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
              };
              groups.set(batchKey, group);
            }
            const transform = nodeMatrix.multiply(
              Matrix.FromArray(
                authoredInstanceMatrix(piece.frame, row.matrix, origin),
              ),
            );
            const start = group.geometry.indices.length;
            appendTransformed(
              group.geometry,
              data.positions,
              data.normals,
              data.indices,
              transform.asArray(),
              data,
              { correctNormals: true },
            );
            group.ranges.push({
              object: row.object,
              piece: piece.id,
              role: row.role,
              material: original.name,
              indexStart: start,
              indexCount: data.indices.length,
            });
          }
        }
      }
      if (pieceTriangles !== piece.triangles)
        throw Error(
          `Authored imported triangle mismatch: ${piece.id} (${pieceTriangles}/${piece.triangles})`,
        );
      uniqueTriangles += pieceTriangles;
      // CPU batching is complete for this asset. Retain its materials and embedded textures.
      for (const source of container.meshes) source.dispose(false, false);
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
      const mesh = new Mesh(`authored-study:${key}`, scene),
        data = new VertexData();
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
      setMeshRole(mesh, "hull");
      mesh.metadata = {
        ...mesh.metadata,
        authoredStudy: {
          materialKey: batchRegions.size ? group.materialKey : key,
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
      ownedImportedTextures: containers.reduce(
        (n, c) => n + c.textures.length,
        0,
      ),
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
