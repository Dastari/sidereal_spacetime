import { expect, test, vi } from "vitest";
import {
  createReviewedWorkerRegistry,
  type ReviewedAssetDescriptor,
} from "./reviewed-worker-registry";
import { planetRecipe } from "../../../../content/src/environment";
import { composeGasReference } from "./gas_reference_composition";
const kit = {
  schema: "sidereal.native-planet-kit.v1" as const,
  layout: "gas-bands-and-rings" as const,
  materials: [{ name: "stone", linearColor: [0.1, 0.2, 0.3], roughness: 0.8 }],
  variants: [
    {
      name: "body",
      positions: [1, 0, 0, 0, 1, 0, 0, 0, 1],
      normals: [1, 0, 0, 0, 1, 0, 0, 0, 1],
      uvs: [0, 0, 1, 0, 0, 1],
      indices: [0, 1, 2],
      triangleMaterials: [0],
    },
  ],
};
const descriptor: ReviewedAssetDescriptor = {
  id: "gas-r005",
  label: "Gas",
  style: "gas",
  revision: "gas-r005",
  layout: "gas-bands-and-rings",
  fixedDetail: true,
  glow: false,
  localLight: false,
  kitURL: "/assets/planets/gas-r005/kit.json",
  textureBaseURL: "/assets/planets/gas-r005/",
  sourceKitSha256: "a".repeat(64),
  runtimeKitSha256: "b".repeat(64),
  encoding: "json",
};
function fixture() {
  const fetcher = vi.fn(async () => new Response(JSON.stringify(kit))),
    digest = vi.fn(async () => descriptor.runtimeKitSha256);
  const registry = createReviewedWorkerRegistry({
    catalog: [descriptor],
    fetch: fetcher,
    digest,
  });
  return { registry, fetcher, digest };
}
test("registration deduplicates fetch/validation, returns compact headers, builds exact native output and releases", async () => {
  const { registry, fetcher, digest } = fixture();
  try {
    const [a, b] = await Promise.all([
      registry.register(descriptor),
      registry.register(descriptor),
    ]);
    expect(a).toBe(b);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(digest).toHaveBeenCalledTimes(1);
    expect(a.header).not.toHaveProperty("variants");
    expect(JSON.stringify(a)).not.toContain("positions");
    for (const lod of [0, 1, 2] as const) {
      const result = await registry.build(a.assetKey, {
        bodyId: "editor-body",
        seed: 38,
        lod,
        recipe: planetRecipe("gas", 38),
      });
      expect(result.batches).toEqual(composeGasReference(kit));
      expect(result.shadowRadii).toEqual([1]);
    }
    expect(fetcher).toHaveBeenCalledTimes(1);
    registry.release(a.assetKey);
    expect(registry.stats().assets).toBe(0);
    await expect(
      registry.build(a.assetKey, {
        bodyId: "x",
        seed: 38,
        lod: 0,
        recipe: planetRecipe("gas", 38),
      }),
    ).rejects.toThrow("not registered");
  } finally {
    registry.dispose();
  }
});
test("rejects modified catalog descriptors and hash failures; a failed registration can retry", async () => {
  const { registry, fetcher, digest } = fixture();
  try {
    await expect(
      registry.register({ ...descriptor, kitURL: "/other" }),
    ).rejects.toThrow("modified");
    expect(fetcher).not.toHaveBeenCalled();
    digest.mockResolvedValueOnce("wrong");
    await expect(registry.register(descriptor)).rejects.toThrow("SHA256");
    expect(registry.stats().registrations).toBe(0);
    const registration = await registry.register(descriptor);
    expect(registration.assetKey).toContain("gas-r005");
    expect(fetcher).toHaveBeenCalledTimes(2);
  } finally {
    registry.dispose();
  }
});
test("rejects oversized transport before parsing and invalid style/build identity", async () => {
  const fetcher = vi.fn(
    async () =>
      new Response("{}", {
        headers: { "content-length": String(64 * 1024 * 1024 + 1) },
      }),
  );
  const registry = createReviewedWorkerRegistry({
    catalog: [descriptor],
    fetch: fetcher,
    digest: async () => descriptor.runtimeKitSha256,
  });
  await expect(registry.register(descriptor)).rejects.toThrow("64MiB");
  registry.dispose();
  const f = fixture();
  const a = await f.registry.register(descriptor);
  await expect(
    f.registry.build(a.assetKey, {
      bodyId: "x",
      seed: 38,
      lod: 0,
      recipe: planetRecipe("ice", 38),
    }),
  ).rejects.toThrow("style");
  await expect(
    f.registry.build(a.assetKey, {
      bodyId: "",
      seed: 38,
      lod: 0,
      recipe: planetRecipe("gas", 38),
    }),
  ).rejects.toThrow("intent");
  f.registry.dispose();
});

test("default SHA256 verifies payload without secure-context Web Crypto", async () => {
  const { createHash } = await import("node:crypto");
  const encoded = JSON.stringify(kit);
  const actual = { ...descriptor, runtimeKitSha256: createHash("sha256").update(encoded).digest("hex") };
  vi.stubGlobal("crypto", undefined);
  const registry = createReviewedWorkerRegistry({ catalog: [actual], fetch: async () => new Response(encoded) });
  try {
    expect((await registry.register(actual)).assetKey).toContain(actual.runtimeKitSha256);
  } finally { registry.dispose(); vi.unstubAllGlobals(); }
});
