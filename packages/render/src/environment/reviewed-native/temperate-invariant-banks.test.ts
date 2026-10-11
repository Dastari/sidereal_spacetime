import { expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { planetRecipe } from "@sidereal/content/environment";
import { composeReviewedPlanet } from "./build-reviewed-planet";
import { validateModernNativePlanetKit } from "../modern-native-planet-schema";
import { validateReviewedWeather } from "./reviewed-weather-validation";
import { createReviewedWorkerRegistry } from "./reviewed-worker-registry";
import { reviewedNativePlanet } from "../reviewed-native-planet-catalog";
const path = new URL(
  "../../../../../assets/reviewed-celestials/reviewed-planets/",
  import.meta.url,
);
const raw = readFileSync(new URL("temperate-r003/kit.json", path)),
  cloudRaw = readFileSync(new URL("cloud-r002/kit.json", path));
const kit = validateModernNativePlanetKit(
    JSON.parse(raw.toString()),
    raw.byteLength,
  ),
  weather = validateReviewedWeather(
    JSON.parse(cloudRaw.toString()),
    cloudRaw.byteLength,
  );
const hash = (value: ArrayBufferView) =>
  createHash("sha256")
    .update(new Uint8Array(value.buffer, value.byteOffset, value.byteLength))
    .digest("hex");
test("qualified packaged hashes retain every bank channel, range and shadow radius across seed and LOD", () => {
  const descriptor = reviewedNativePlanet("temperate-r003")!;
  expect(createHash("sha256").update(raw).digest("hex")).toBe(
    descriptor.runtimeKitSha256,
  );
  expect(createHash("sha256").update(cloudRaw).digest("hex")).toBe(
    descriptor.weather!.runtimeKitSha256,
  );
  for (const seed of [117, 0, 4294967295]) {
    const recipe = planetRecipe("temperate", seed);
    const common = composeReviewedPlanet(kit, weather, {
      bodyId: "comparison",
      seed,
      lod: 0,
      recipe,
      partition: "temperate-common-banks",
    });
    for (const lod of [0, 1, 2] as const) {
      const original = composeReviewedPlanet(kit, weather, {
          bodyId: "comparison",
          seed,
          lod,
          recipe,
        }),
        own = composeReviewedPlanet(kit, weather, {
          bodyId: "comparison",
          seed,
          lod,
          recipe,
          partition: "temperate-lod-banks",
        });
      expect(own.weather).toBeUndefined();
      original.batches.forEach((batch, index) => {
        const equivalent =
          index === 0 ? own.batches[index] : common.batches[index];
        for (const channel of [
          "positions",
          "normals",
          "uvs",
          "indices",
        ] as const)
          expect(hash(equivalent[channel])).toBe(hash(batch[channel]));
        expect(equivalent.ranges).toEqual(batch.ranges);
        expect((index === 0 ? own : common).shadowRadii[index]).toBe(
          original.shadowRadii[index],
        );
      });
      for (const channel of [
        "positions",
        "normals",
        "indices",
        "colors",
      ] as const)
        expect(
          hash(
            (common.weather as unknown as Record<string, ArrayBufferView>)[
              channel
            ],
          ),
        ).toBe(
          hash(
            (original.weather as unknown as Record<string, ArrayBufferView>)[
              channel
            ],
          ),
        );
      expect(common.weather!.ranges).toEqual(original.weather!.ranges);
      expect(common.weatherShadowRadius).toBe(original.weatherShadowRadius);
    }
  }
}, 120000);
test("zero and full cloud coverage keep complete and common weather identical", () => {
  for (const coverage of [0, 1]) {
    const recipe = {
      ...planetRecipe("temperate", 117),
      cloudCoverage: coverage,
    };
    const original = composeReviewedPlanet(kit, weather, {
        bodyId: "weather",
        seed: 117,
        lod: 2,
        recipe,
      }),
      common = composeReviewedPlanet(kit, weather, {
        bodyId: "weather",
        seed: 117,
        lod: 0,
        recipe,
        partition: "temperate-common-banks",
      });
    expect(common.weather).toEqual(original.weather);
  }
}, 60000);
test("worker capability rejects changed pins and transfer detachment cannot damage subsequent builds", async () => {
  const descriptor = reviewedNativePlanet("temperate-r003")!;
  const registry = createReviewedWorkerRegistry({
    fetch: async (url) =>
      new Response(String(url).includes("cloud-r002") ? cloudRaw : raw),
  });
  const registration = await registry.register(descriptor);
  expect(registration.invariantBanks).toBe("temperate-r003-v1");
  const input = {
    bodyId: "first",
    seed: 117,
    lod: 2 as const,
    recipe: planetRecipe("temperate", 117),
    partition: "temperate-lod-banks" as const,
  };
  const first = await registry.build(registration.assetKey, input),
    expected = hash(first.batches[0].positions);
  structuredClone(first, { transfer: [first.batches[0].positions.buffer] });
  expect(first.batches[0].positions.byteLength).toBe(0);
  const second = await registry.build(registration.assetKey, {
    ...input,
    bodyId: "peer",
  });
  expect(hash(second.batches[0].positions)).toBe(expected);
  const commonInput = {
    ...input,
    partition: "temperate-common-banks" as const,
  };
  const common = await registry.build(registration.assetKey, commonInput);
  const fingerprint = (value: typeof common) => ({
    banks: value.batches.map((batch) => ({
      channels: [batch.positions, batch.normals, batch.uvs, batch.indices].map(
        hash,
      ),
      ranges: batch.ranges,
    })),
    weather: [
      common.weather!.positions,
      common.weather!.normals,
      common.weather!.indices,
      (common.weather as unknown as { colors: Float32Array }).colors,
    ].map((v) => hash(v as Float32Array)),
    shadowRadii: value.shadowRadii,
    weatherShadowRadius: value.weatherShadowRadius,
  });
  const expectedCommon = fingerprint(common);
  const buffers = new Set<ArrayBuffer>();
  for (const batch of common.batches)
    for (const channel of [
      batch.positions,
      batch.normals,
      batch.uvs,
      batch.indices,
    ])
      buffers.add(channel.buffer as ArrayBuffer);
  for (const channel of Object.values(common.weather!))
    if (ArrayBuffer.isView(channel)) buffers.add(channel.buffer as ArrayBuffer);
  structuredClone(common, { transfer: [...buffers] });
  expect((common.weather!.positions as Float32Array).byteLength).toBe(0);
  const peerCommon = await registry.build(registration.assetKey, {
    ...commonInput,
    bodyId: "peer-common",
  });
  // Use the rebuilt weather, rather than the detached original.
  const peerChannels = [
    peerCommon.weather!.positions,
    peerCommon.weather!.normals,
    peerCommon.weather!.indices,
    (peerCommon.weather as unknown as { colors: Float32Array }).colors,
  ].map((v) => hash(v as ArrayBufferView));
  expect(
    peerCommon.batches.map((batch) => ({
      channels: [batch.positions, batch.normals, batch.uvs, batch.indices].map(
        hash,
      ),
      ranges: batch.ranges,
    })),
  ).toEqual(expectedCommon.banks);
  expect(peerChannels).toEqual(expectedCommon.weather);
  expect(peerCommon.shadowRadii).toEqual(expectedCommon.shadowRadii);
  expect(peerCommon.weatherShadowRadius).toBe(
    expectedCommon.weatherShadowRadius,
  );
  registry.release(registration.assetKey);
  expect(registry.stats().assets).toBe(0);
  const changed = {
    ...descriptor,
    id: "modified",
    runtimeKitSha256: descriptor.runtimeKitSha256,
    weather: { ...descriptor.weather!, revision: "unqualified" },
  };
  const other = createReviewedWorkerRegistry({
    catalog: [changed],
    fetch: async (url) =>
      new Response(String(url).includes("cloud-r002") ? cloudRaw : raw),
  });
  const unqualified = await other.register(changed);
  expect(unqualified.invariantBanks).toBeUndefined();
  await expect(other.build(unqualified.assetKey, input)).rejects.toThrow(
    "qualified invariant banks",
  );
  other.dispose();
}, 60000);

test.each(["body-hash", "cloud-hash", "weather-revision"])(
  "capability independently rejects %s",
  async (gate) => {
    const accepted = reviewedNativePlanet("temperate-r003")!;
    const changed = { ...accepted, weather: { ...accepted.weather! } };
    if (gate === "body-hash") changed.runtimeKitSha256 = "f".repeat(64);
    if (gate === "cloud-hash")
      changed.weather.runtimeKitSha256 = "f".repeat(64);
    if (gate === "weather-revision") changed.weather.revision = "cloud-r999";
    const registry = createReviewedWorkerRegistry({
      catalog: [changed],
      fetch: async (url) =>
        new Response(String(url).includes("cloud-r002") ? cloudRaw : raw),
      digest: async (bytes) =>
        bytes.byteLength === raw.byteLength
          ? changed.runtimeKitSha256
          : changed.weather.runtimeKitSha256,
    });
    const reg = await registry.register(changed);
    expect(reg.invariantBanks).toBeUndefined();
    await expect(
      registry.build(reg.assetKey, {
        bodyId: "rejected",
        seed: 117,
        lod: 2,
        recipe: planetRecipe("temperate", 117),
        partition: "temperate-common-banks",
      }),
    ).rejects.toThrow("qualified invariant banks");
    registry.dispose();
  },
);
