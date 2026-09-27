import { expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import {
  insetNativeMaterialSignatures,
  registerInsetNativeMaterials,
  insetNativeMaterialKey,
} from "./inset-native-materials";
function glb(document: unknown, image = 7) {
  const json = new TextEncoder().encode(JSON.stringify(document));
  const n = Math.ceil(json.length / 4) * 4;
  const bytes = new Uint8Array(28 + n + 4);
  bytes.fill(32, 20, 20 + n);
  bytes.set(json, 20);
  const v = new DataView(bytes.buffer);
  [0x46546c67, 2, bytes.length, n, 0x4e4f534a].forEach((x, i) =>
    v.setUint32(i * 4, x, true),
  );
  v.setUint32(20 + n, 4, true);
  v.setUint32(24 + n, 0x004e4942, true);
  bytes[28 + n] = image;
  return bytes;
}
const fixture = () => ({
  asset: { version: "2.0" },
  buffers: [{ byteLength: 4 }],
  bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 4 }],
  images: [{ bufferView: 0, mimeType: "image/png" }],
  samplers: [{ magFilter: 9729, wrapS: 10497 }],
  textures: [{ source: 0, sampler: 0 }],
  materials: [
    {
      name: "only a label",
      pbrMetallicRoughness: {
        baseColorTexture: { index: 0, texCoord: 0 },
        roughnessFactor: 0.4,
      },
    },
  ],
});
it("hashes actual authored image bytes, sampler policy and texture transforms, never material labels", () => {
  const base = fixture(),
    signature = insetNativeMaterialSignatures(glb(base)).get(0);
  expect(signature).toHaveLength(64);
  const named = structuredClone(base);
  named.materials[0].name = "different label";
  expect(insetNativeMaterialSignatures(glb(named)).get(0)).toBe(signature);
  expect(insetNativeMaterialSignatures(glb(base, 8)).get(0)).not.toBe(
    signature,
  );
  const sampler = structuredClone(base);
  sampler.samplers[0].wrapS = 33071;
  expect(insetNativeMaterialSignatures(glb(sampler)).get(0)).not.toBe(
    signature,
  );
  const uv = structuredClone(base);
  uv.materials[0].pbrMetallicRoughness.baseColorTexture.texCoord = 1;
  expect(insetNativeMaterialSignatures(glb(uv)).get(0)).not.toBe(signature);
  const transformed = structuredClone(base) as any;
  transformed.extensionsUsed = ["KHR_texture_transform"];
  transformed.materials[0].pbrMetallicRoughness.baseColorTexture.extensions = {
    KHR_texture_transform: { offset: [0.5, 0] },
  };
  expect(insetNativeMaterialSignatures(glb(transformed)).get(0)).not.toBe(
    signature,
  );
  const unsupported = structuredClone(base) as any;
  unsupported.extensionsUsed = ["KHR_materials_transmission"];
  expect(insetNativeMaterialSignatures(glb(unsupported)).size).toBe(0);
});
it("matches real embedded native span materials across distinct GLB profiles", () => {
  const a = new Uint8Array(
    readFileSync(
      "assets/runtime/construction/inset250-r000/convex-r004/span-42c2fafec189-q4.glb",
    ),
  );
  const b = new Uint8Array(
    readFileSync(
      "assets/runtime/construction/inset250-r000/convex-r004/span-e2718d14114d-q4.glb",
    ),
  );
  const x = insetNativeMaterialSignatures(a),
    y = insetNativeMaterialSignatures(b);
  expect(x.size).toBe(5);
  expect([...x.values()]).toEqual([...y.values()]);
  expect(new Set(x.values()).size).toBe(5);
});
it("requires exact loader JSON pointers and includes runtime material differences", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine),
    a = new PBRMaterial("a", scene),
    b = new PBRMaterial("b", scene),
    c = new PBRMaterial("only a label", scene);
  for (const m of [a, b])
    Object.assign(m, {
      _internalMetadata: { gltf: { pointers: ["/materials/0"] } },
    });
  expect(registerInsetNativeMaterials([a, b, c], glb(fixture()))).toBe(2);
  expect(insetNativeMaterialKey(a)).toBe(insetNativeMaterialKey(b));
  expect(insetNativeMaterialKey(c)).not.toBe(insetNativeMaterialKey(a));
  b.roughness = 0.2;
  expect(insetNativeMaterialKey(a)).not.toBe(insetNativeMaterialKey(b));
  scene.dispose();
  engine.dispose();
});
