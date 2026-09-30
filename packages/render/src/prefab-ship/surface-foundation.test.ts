import { afterEach, expect, it, vi } from "vitest";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { VoxelVolume, meshChunk, removeVoxels } from "../../../sim/src/voxels";
import {
  appendTransformed,
  transformSurfaceFrame,
  type MergeGroup,
} from "./batch";
import { extractGlbPrimitive, loadVerifiedGlbGeometry } from "./glb-library";
import { latticeFaceUvs } from "./surface-coordinates";
import {
  appendSurfaceChannels,
  surfaceBatchLayoutKey,
  validateSurfaceChannels,
  type MutableSurfaceChannels,
} from "./surface-attributes";
import {
  normalDetailMaterial,
  type NormalDetailSelection,
} from "./normal-detail";

const engines: NullEngine[] = [];
afterEach(() => {
  engines.splice(0).forEach((engine) => engine.dispose());
  vi.unstubAllGlobals();
});
function scene() {
  const engine = new NullEngine();
  engines.push(engine);
  const s = new Scene(engine);
  s.useRightHandedSystem = true;
  return s;
}
const positions = [0, 0, 0, 1, 0, 0, 0, 1, 0];
const normals = [0, 0, 1, 0, 0, 1, 0, 0, 1];
const uvs = [0.125, 0.25, 0.75, 0.25, 0.125, 0.875];
const uvs2 = uvs.map((v) => v * 2);
const tangents = [1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1];
const newGroup = (): MergeGroup => ({
  key: "fixture",
  positions: [],
  normals: [],
  indices: [],
});
const selection: NormalDetailSelection = {
  enabled: true,
  profile: "federation",
  family: "panel",
  revision: "fixture-r001",
  normalUrl: "data:image/png;base64,fixture",
  normalSha256: "a".repeat(64),
};

function fixtureGlb(): Uint8Array {
  const arrays = [positions, normals, uvs, uvs2, tangents, [0, 1, 2]];
  const binary = new Uint8Array(arrays.reduce((n, a) => n + a.length * 4, 0));
  const views: { buffer: number; byteOffset: number; byteLength: number }[] =
    [];
  let offset = 0;
  arrays.forEach((array, i) => {
    const typed = i === 5 ? Uint32Array.from(array) : Float32Array.from(array);
    views.push({ buffer: 0, byteOffset: offset, byteLength: typed.byteLength });
    binary.set(new Uint8Array(typed.buffer), offset);
    offset += typed.byteLength;
  });
  const json = JSON.stringify({
    asset: { version: "2.0" },
    buffers: [{ byteLength: binary.length }],
    bufferViews: views,
    accessors: arrays.map((array, i) => ({
      bufferView: i,
      componentType: i === 5 ? 5125 : 5126,
      count: 3,
      type: ["VEC3", "VEC3", "VEC2", "VEC2", "VEC4", "SCALAR"][i],
      ...(i === 0 ? { min: [0, 0, 0], max: [1, 1, 0] } : {}),
    })),
    meshes: [
      {
        primitives: [
          {
            attributes: {
              POSITION: 0,
              NORMAL: 1,
              TEXCOORD_0: 2,
              TEXCOORD_1: 3,
              TANGENT: 4,
            },
            indices: 5,
          },
        ],
      },
    ],
    nodes: [{ name: "mapped", mesh: 0, scale: [-1, 1, 1] }],
    scenes: [{ nodes: [0] }],
    scene: 0,
  });
  const jsonBytes = new TextEncoder().encode(json);
  const jsonLength = Math.ceil(jsonBytes.length / 4) * 4;
  const bytes = new Uint8Array(28 + jsonLength + binary.length);
  const header = new DataView(bytes.buffer);
  header.setUint32(0, 0x46546c67, true);
  header.setUint32(4, 2, true);
  header.setUint32(8, bytes.length, true);
  header.setUint32(12, jsonLength, true);
  header.setUint32(16, 0x4e4f534a, true);
  bytes.fill(32, 20, 20 + jsonLength);
  bytes.set(jsonBytes, 20);
  header.setUint32(20 + jsonLength, binary.length, true);
  header.setUint32(24 + jsonLength, 0x004e4942, true);
  bytes.set(binary, 28 + jsonLength);
  return bytes;
}

it("imports exact verified GLB bytes with all authored channels and no second fetch", async () => {
  const s = scene();
  const bytes = fixtureGlb();
  const hash = bytesToHex(sha256(bytes));
  const fetch = vi.fn(() => {
    throw Error("unexpected fetch");
  });
  vi.stubGlobal("fetch", fetch);
  const pending = loadVerifiedGlbGeometry(
    s,
    "/candidate/mapped.glb",
    bytes,
    hash,
  );
  bytes.fill(0); // Import owns its verified copy even while the loader is awaiting.
  const result = await pending;
  expect(Array.from(result.primitives[0].uvs!)).toEqual(uvs);
  expect(Array.from(result.primitives[0].uvs2!)).toEqual(uvs2);
  expect(result.primitives[0].tangents![3]).toBe(-1);
  expect(
    await loadVerifiedGlbGeometry(
      s,
      "/candidate/mapped.glb",
      fixtureGlb(),
      hash,
    ),
  ).toBe(result);
  expect(fetch).not.toHaveBeenCalled();
  expect(s.materials).toHaveLength(0);
  expect(s.meshes).toHaveLength(0);
  await expect(
    loadVerifiedGlbGeometry(
      s,
      "/candidate/mapped.glb",
      fixtureGlb(),
      "b".repeat(64),
    ),
  ).rejects.toThrow(/mismatch/);
});

it("extracts owned UV0/UV1 and mirrored authored tangent frames without changing source arrays", () => {
  const s = scene();
  const mesh = new Mesh("authored", s);
  const data = new VertexData();
  Object.assign(data, {
    positions,
    normals,
    indices: [0, 1, 2],
    uvs,
    uvs2,
    tangents,
  });
  data.applyToMesh(mesh);
  mesh.scaling.set(-2, 1, 1);
  const extracted = extractGlbPrimitive(mesh)!;
  expect(Array.from(extracted.uvs!)).toEqual(uvs);
  expect(Array.from(extracted.uvs2!)).toEqual(uvs2);
  expect(Array.from(extracted.tangents!).slice(0, 4)).toEqual([-1, 0, 0, -1]);
  expect(Array.from(extracted.indices)).toEqual([0, 2, 1]);
  mesh.dispose();
  expect(Array.from(extracted.uvs!)).toEqual(uvs);
  expect(tangents[3]).toBe(1);
});

it("validates malformed channel cardinality, nonfinite UVs and degenerate tangent frames", () => {
  expect(() => validateSurfaceChannels({ uvs: [0, 1] }, 3)).toThrow(/length/);
  expect(() => validateSurfaceChannels({ uvs2: [NaN, 0] }, 1)).toThrow(
    /nonfinite/,
  );
  expect(() => validateSurfaceChannels({ tangents: [0, 0, 0, 1] }, 1)).toThrow(
    /frame/,
  );
  expect(() => validateSurfaceChannels({ tangents: [1, 0, 0, 0] }, 1)).toThrow(
    /frame/,
  );
});

it("retains complete UV channels through multiple transformed primitives", () => {
  const group = newGroup();
  for (const matrix of [
    Matrix.Identity(),
    Matrix.RotationZ(Math.PI / 2),
    Matrix.Scaling(-1, 1, 1),
  ])
    appendTransformed(group, positions, normals, [0, 1, 2], matrix.asArray(), {
      uvs,
      uvs2,
      tangents,
    });
  expect(group.uvs).toEqual([...uvs, ...uvs, ...uvs]);
  expect(group.uvs2).toEqual([...uvs2, ...uvs2, ...uvs2]);
  expect(group.tangents?.slice(-4)).toEqual([-1, 0, 0, -1]);
  expect(group.indices.slice(-3)).toEqual([6, 8, 7]);
});

it.each([
  [true, false, true],
  [false, true],
])("never reinstates a missing mixed legacy channel: %j", (...present) => {
  const group: MutableSurfaceChannels = {};
  present.forEach((hasUv, i) =>
    appendSurfaceChannels(group, hasUv ? { uvs } : {}, i * 3, 3),
  );
  expect(group.uvs).toBeUndefined();
  expect(group.uvsComplete).toBe(false);
  expect(surfaceBatchLayoutKey(group)).toBe("legacy");
});

it("keeps missing channels absent and distinguishes selected UV sets for detail grouping", () => {
  const group = newGroup();
  appendTransformed(
    group,
    positions,
    normals,
    [0, 1, 2],
    Matrix.Identity().asArray(),
  );
  expect(group.uvs).toBeUndefined();
  expect(group.tangents).toBeUndefined();
  expect(surfaceBatchLayoutKey({ uvs })).toBe("uv0");
  expect(surfaceBatchLayoutKey({ uvs }, 1)).toBe("legacy");
  expect(surfaceBatchLayoutKey({ uvs2 }, 1)).toBe("uv1");
});

it("correctly transforms affine detail normals while legacy normals keep their original response", () => {
  const n = new Vector3(1, 1, 0).normalize();
  const matrix = Matrix.Scaling(-2, 3, 1);
  const frame = transformSurfaceFrame(
    n.asArray(),
    [Math.SQRT1_2, -Math.SQRT1_2, 0, 1],
    matrix,
  );
  const expected = new Vector3(-1 / 2, 1 / 3, 0).normalize();
  expect(
    Vector3.Distance(Vector3.FromArray(frame.normal), expected),
  ).toBeLessThan(1e-6);
  expect(
    Vector3.Dot(
      Vector3.FromArray(frame.normal),
      Vector3.FromArray(frame.tangent!),
    ),
  ).toBeCloseTo(0);
  expect(frame.tangent![3]).toBe(-1);
  const legacy = newGroup(),
    detailed = newGroup();
  const ns = [...n.asArray(), ...n.asArray(), ...n.asArray()];
  appendTransformed(legacy, positions, ns, [0, 1, 2], matrix.asArray());
  appendTransformed(
    detailed,
    positions,
    ns,
    [0, 1, 2],
    matrix.asArray(),
    { uvs },
    { correctNormals: true },
  );
  expect(detailed.normals.slice(0, 3)).toEqual(frame.normal);
  expect(legacy.normals.slice(0, 3)).not.toEqual(frame.normal);
  expect(() =>
    transformSurfaceFrame(n.asArray(), undefined, Matrix.Scaling(0, 1, 1)),
  ).toThrow(/invertible/);
});

it("uses affine signed lattice face coordinates including negative coordinates and multiple repeats", () => {
  expect(
    Array.from(
      latticeFaceUvs(
        [
          [-32, 0, 2],
          [48, 0, 2],
        ],
        [0, 0, 1],
      ),
    ),
  ).toEqual([-2, 0, 3, 0]);
  expect(Array.from(latticeFaceUvs([[-32, -16, 2]], [0, 0, -1]))).toEqual([
    -2, 1,
  ]);
  expect(() => latticeFaceUvs([[0.5, 0, 0]], [0, 0, 1])).toThrow(/integers/);
  expect(() => latticeFaceUvs([[0, 0, 0]], [1, 1, 0])).toThrow(/signed axis/);
});

it("keeps joined chunk map phase through synthetic damage and repair despite greedy repartition", () => {
  const volume = new VoxelVolume();
  for (let x = -3; x <= 35; x++)
    for (let y = 0; y < 2; y++) volume.set(x, y, 0, 1);
  const top = () =>
    [...volume.chunks.values()]
      .flatMap((chunk) => meshChunk(volume, chunk))
      .filter((face) => face.normal[2] === 1);
  const original = top();
  for (const face of original) {
    const mapped = latticeFaceUvs(face.corners, face.normal);
    face.corners.forEach((p, i) =>
      expect([mapped[i * 2], mapped[i * 2 + 1]]).toEqual([
        p[0] / 16,
        p[1] / 16,
      ]),
    );
  }
  const removed = removeVoxels(volume, [
    [31, 0, 0],
    [32, 0, 0],
  ]);
  expect(removed.dirty).toContain("0,0,0");
  expect(removed.dirty).toContain("1,0,0");
  expect(top()).not.toEqual(original);
  for (const face of top()) {
    const mapped = latticeFaceUvs(face.corners, face.normal);
    face.corners.forEach((p, i) => expect(mapped[i * 2]).toBe(p[0] / 16));
  }
  volume.set(31, 0, 0, 1);
  volume.set(32, 0, 0, 1);
  expect(top()).toEqual(original);
});

it("disabled or UV-incomplete detail returns the exact base without allocating scene resources", () => {
  const s = scene();
  const base = new PBRMaterial("plastic", s);
  const counts = [s.materials.length, s.textures.length];
  expect(normalDetailMaterial(base)).toBe(base);
  expect(
    normalDetailMaterial(base, { ...selection, enabled: false }, { uvs }),
  ).toBe(base);
  expect(normalDetailMaterial(base, selection, {})).toBe(base);
  expect(
    normalDetailMaterial(base, selection, { uvs, uvsComplete: false }),
  ).toBe(base);
  expect([s.materials.length, s.textures.length]).toEqual(counts);
});

it("pools finite detail identities while preserving base finish and independent scene ownership", () => {
  const s = scene();
  const base = new PBRMaterial("plastic", s);
  base.roughness = 0.32;
  base.metallic = 0;
  base.clearCoat.isEnabled = true;
  base.clearCoat.intensity = 0.08;
  const detail = normalDetailMaterial(base, selection, { uvs });
  expect(normalDetailMaterial(base, selection, { uvs })).toBe(detail);
  const revision = normalDetailMaterial(
    base,
    { ...selection, revision: "fixture-r002" },
    { uvs },
  );
  expect(revision).not.toBe(detail);
  expect(revision.bumpTexture).toBe(detail.bumpTexture);
  expect(detail.roughness).toBe(base.roughness);
  expect(detail.metallic).toBe(base.metallic);
  expect(detail.clearCoat.intensity).toBe(base.clearCoat.intensity);
  expect(base.bumpTexture).toBeNull();
  expect(detail.useParallax).toBe(false);
  expect(detail.useParallaxOcclusion).toBe(false);
  const otherScene = scene();
  const otherBase = new PBRMaterial("plastic", otherScene);
  const other = normalDetailMaterial(otherBase, selection, { uvs });
  expect(other.bumpTexture).not.toBe(detail.bumpTexture);
  s.dispose();
  expect(otherScene.materials).toContain(other);
  expect(otherScene.textures).toContain(other.bumpTexture);
});
