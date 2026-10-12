import { afterEach, expect, test, vi } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { PointLight } from "@babylonjs/core/Lights/pointLight";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { prefabById } from "@sidereal/content/prefabs";
import {
  loadRemoteExteriorPrototype,
  resolvePublishedExterior,
} from "./remote-exteriors";
import { publishedShipAccessBytes } from "./wayfarer-access-assets";
import { loadDeferredExterior } from "./deferred-exteriors";
const runtime = fileURLToPath(
  new URL("../../../../assets/runtime/", import.meta.url),
);
const engines: NullEngine[] = [];
afterEach(() => {
  for (const e of engines.splice(0)) e.dispose();
  vi.unstubAllGlobals();
});
function serveAssets(changed = false) {
  const requests: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: unknown) => {
      const name = String(url);
      requests.push(name);
      if (!name.startsWith("/assets/")) return { ok: false };
      const path = join(runtime, name.slice(8));
      if (!existsSync(path)) return { ok: false };
      const b = readFileSync(path);
      if (changed && name.endsWith("template-authored-r001/manifest.json"))
        b[0] ^= 1;
      return {
        ok: true,
        json: async () => JSON.parse(b.toString()),
        arrayBuffer: async () =>
          b.buffer.slice(b.byteOffset, b.byteOffset + b.length),
      };
    }),
  );
  const stub: object = new Proxy(() => stub, {
    get: (_, key) =>
      key === "then" ? undefined : key === Symbol.toPrimitive ? () => 0 : stub,
    apply: () => stub,
  });
  vi.stubGlobal(
    "OffscreenCanvas",
    class {
      constructor(
        public width: number,
        public height: number,
      ) {}
      getContext() {
        return stub;
      }
    },
  );
  return requests;
}
function makeScene() {
  const e = new NullEngine();
  engines.push(e);
  const s = new Scene(e);
  s.useRightHandedSystem = true;
  return s;
}

test.each([
  "fed.s.wren-fleet",
  "fed.s.petrel-fleet",
  "fed.m.wayfarer-fleet",
  "fed.m.heron-fleet",
  "fed.l.kestrel-fleet",
  "fed.l.albatross-fleet",
])(
  "%s deferred bank keeps its accepted admission radius and native geometry/material policy",
  async (id) => {
    const requested = serveAssets(),
      scene = makeScene(),
      doc = prefabById(id)!;
    const resolved = resolvePublishedExterior(
      `prefab:${doc.id}`,
      BigInt(doc.revision),
    )!;
    expect(resolved.exact).toBe(true);
    const options = { accessResolver: publishedShipAccessBytes };
    const candidate = await loadDeferredExterior(scene, resolved, options);
    expect(requested).toHaveLength(0);
    const initialRadius = candidate.radius;
    expect(await candidate.ensureFull!()).toBe(true);
    const original = await loadRemoteExteriorPrototype(
      scene,
      resolved,
      options,
    );
    const signature = (prototype: typeof original) => {
      const parent = new TransformNode("placed", scene),
        consumer = prototype.instantiate(parent, "comparison");
      consumer.prepareFull!();
      const hash = createHash("sha256");
      const shapes = consumer.full.getChildMeshes().map((mesh) => {
        for (const values of [
          mesh.getVerticesData(VertexBuffer.PositionKind),
          mesh.getVerticesData(VertexBuffer.NormalKind),
          mesh.getIndices(),
        ])
          hash.update(JSON.stringify(Array.from(values ?? [])));
        return {
          matrix: Array.from(mesh.computeWorldMatrix(true).m),
          vertices: mesh.getTotalVertices(),
          indices: mesh.getTotalIndices(),
          material:
            mesh.material instanceof PBRMaterial
              ? {
                  alpha: mesh.material.alpha,
                  roughness: mesh.material.roughness,
                  metallic: mesh.material.metallic,
                  directIntensity: mesh.material.directIntensity,
                  albedo: mesh.material.albedoColor.asArray(),
                  emissive: mesh.material.emissiveColor.asArray(),
                  emissiveIntensity: mesh.material.emissiveIntensity,
                  maxLights: mesh.material.maxSimultaneousLights,
                  hotSwap: mesh.material.allowShaderHotSwapping,
                  clearCoat: mesh.material.clearCoat.serialize(),
                  backFaceCulling: mesh.material.backFaceCulling,
                  textures: mesh.material
                    .getActiveTextures()
                    .map((t) => t.name),
                }
              : undefined,
        };
      });
      parent.dispose();
      return { hash: hash.digest("hex"), shapes };
    };
    const before = signature(original),
      after = signature(candidate);
    expect(after.hash).toBe(before.hash);
    expect(after.shapes.length).toBeGreaterThan(0);
    expect(after.shapes).toEqual(before.shapes);
    expect(candidate.metrics).toEqual(original.metrics);
    expect(candidate.radius).toBe(initialRadius);
    expect(candidate.radius).toBeCloseTo(original.radius, 6);
    for (const distance of [50, 180, 500]) {
      const projected = (radius: number) =>
        ((radius / distance) * 800) / (2 * Math.tan(0.8 / 2));
      expect(projected(initialRadius) >= 56).toBe(
        projected(original.radius) >= 56,
      );
      expect(projected(candidate.radius)).toBe(projected(initialRadius));
    }
    expect(
      scene.lights.filter((light) => light instanceof PointLight),
    ).toHaveLength(0);
    candidate.dispose();
    original.dispose();
    expect(scene.meshes).toHaveLength(0);
  },
  60000,
);
