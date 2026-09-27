import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import {
  REVIEWED_NATIVE_PLANETS,
  type ReviewedNativePlanetDescriptor,
} from "../reviewed-native-planet-catalog";
import { decodeReviewedNativePayload } from "../reviewed-native-planet-encoding";
import {
  MODERN_NATIVE_PLANET_LIMITS,
  validateModernNativePlanetKit,
  type ModernNativePlanetKit,
  type ModernNativePlanetHeader,
} from "../modern-native-planet-schema";
import {
  validateReviewedWeather,
  type ReviewedWeatherKit,
} from "./reviewed-weather-validation";
import {
  composeReviewedPlanet,
  type ReviewedBuildInput,
} from "./build-reviewed-planet";
export type ReviewedAssetDescriptor = ReviewedNativePlanetDescriptor;
export type ReviewedRegistration = {
  assetKey: string;
  header: ModernNativePlanetHeader;
  weatherHeader?: {
    schema: string;
    layout: string;
    materials: ReviewedWeatherKit["materials"];
  };
};
type Payload = Pick<
  ReviewedAssetDescriptor,
  "kitURL" | "runtimeKitSha256" | "encoding"
>;
type Asset = {
  promise: Promise<ModernNativePlanetKit | ReviewedWeatherKit>;
  refs: number;
};
/** Worker-only bounded registry. Catalog identity is separate from caller body identity. */
export function createReviewedWorkerRegistry(
  options: {
    catalog?: readonly ReviewedAssetDescriptor[];
    fetch?: typeof fetch;
    digest?: (bytes: Uint8Array) => Promise<string>;
    decode?: typeof decodeReviewedNativePayload;
    maxRegistrations?: number;
  } = {},
) {
  const catalog = options.catalog ?? REVIEWED_NATIVE_PLANETS,
    fetcher = options.fetch ?? fetch;
  const assets = new Map<string, Asset>();
  const registrations = new Map<
    string,
    {
      descriptor: ReviewedAssetDescriptor;
      promise: Promise<ReviewedRegistration>;
      assets: string[];
    }
  >();
  const digest = options.digest ?? (async (bytes: Uint8Array) => bytesToHex(sha256(bytes)));
  const decode = options.decode ?? decodeReviewedNativePayload;
  let disposed = false;
  async function load(payload: Payload, weather: boolean) {
    const response = await fetcher(payload.kitURL);
    if (!response.ok)
      throw new Error(`Reviewed asset fetch ${response.status}`);
    const length = Number(response.headers.get("content-length") ?? 0);
    if (length > MODERN_NATIVE_PLANET_LIMITS.payloadBytes)
      throw new Error("Reviewed payload exceeds64MiB");
    let bytes: Uint8Array;
    if (response.body) {
      const reader = response.body.getReader(),
        chunks: Uint8Array[] = [];
      let size = 0;
      try {
        for (;;) {
          const next = await reader.read();
          if (next.done) break;
          size += next.value.byteLength;
          if (size > MODERN_NATIVE_PLANET_LIMITS.payloadBytes)
            throw new Error("Reviewed payload exceeds64MiB");
          chunks.push(next.value);
        }
        bytes = new Uint8Array(size);
        let offset = 0;
        for (const chunk of chunks) {
          bytes.set(chunk, offset);
          offset += chunk.length;
        }
      } catch (error) {
        await reader.cancel();
        throw error;
      } finally {
        reader.releaseLock();
      }
    } else bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > MODERN_NATIVE_PLANET_LIMITS.payloadBytes)
      throw new Error("Reviewed payload exceeds64MiB");
    if ((await digest(bytes)) !== payload.runtimeKitSha256)
      throw new Error("Reviewed asset SHA256 mismatch");
    if (disposed) throw new Error("Reviewed registry disposed");
    const raw = decode(bytes, payload.encoding);
    return weather
      ? validateReviewedWeather(raw, bytes.byteLength)
      : validateModernNativePlanetKit(raw, bytes.byteLength);
  }
  function acquire(payload: Payload, weather: boolean) {
    const key = JSON.stringify([
      payload.kitURL,
      payload.runtimeKitSha256,
      payload.encoding,
      weather,
    ]);
    let asset = assets.get(key);
    if (!asset) {
      asset = { refs: 0, promise: load(payload, weather) };
      assets.set(key, asset);
    }
    asset.refs++;
    return { key, promise: asset.promise };
  }
  function drop(key: string) {
    const asset = assets.get(key);
    if (asset && --asset.refs === 0) assets.delete(key);
  }
  return {
    register(
      descriptor: ReviewedAssetDescriptor,
    ): Promise<ReviewedRegistration> {
      if (disposed)
        return Promise.reject(new Error("Reviewed registry disposed"));
      const accepted = catalog.find((d) => d.id === descriptor.id);
      if (!accepted || JSON.stringify(accepted) !== JSON.stringify(descriptor))
        return Promise.reject(
          new Error("Unknown or modified reviewed descriptor"),
        );
      const assetKey = accepted.id + ":" + accepted.runtimeKitSha256;
      const existing = registrations.get(assetKey);
      if (existing) return existing.promise;
      if (registrations.size >= (options.maxRegistrations ?? 8))
        return Promise.reject(
          new Error("Reviewed registration budget exceeded"),
        );
      const body = acquire(accepted, false),
        weather = accepted.weather
          ? acquire(accepted.weather, true)
          : undefined;
      const keys = [body.key, ...(weather ? [weather.key] : [])];
      const promise = Promise.all([body.promise, weather?.promise])
        .then(([bodyKit, weatherKit]) => {
          if (disposed || registrations.get(assetKey)?.promise !== promise)
            throw new Error("Reviewed registration released");
          const kit = bodyKit as ModernNativePlanetKit;
          if (kit.layout !== accepted.layout)
            throw new Error("Reviewed descriptor layout mismatch");
          if (
            String(kit.layout).includes("moon") &&
            kit.compositionRecipe?.referenceId !==
              `planets--${accepted.id.replace(/-r\d+$/, "")}`
          )
            throw new Error("Reviewed moon identity mismatch");
          if (
            weatherKit &&
            String(weatherKit.layout) !== accepted.weather?.layout
          )
            throw new Error("Reviewed weather layout mismatch");
          // Compact explicit headers only; never send variants or packed source arrays.
          return {
            assetKey,
            header: {
              schema: kit.schema,
              layout: kit.layout,
              materials: kit.materials,
              compositionRecipe: kit.compositionRecipe,
            },
            weatherHeader: weatherKit
              ? {
                  schema: weatherKit.schema,
                  layout: String(weatherKit.layout),
                  materials: weatherKit.materials,
                }
              : undefined,
          };
        })
        .catch((error) => {
          if (registrations.get(assetKey)?.promise === promise) {
            registrations.delete(assetKey);
            keys.forEach(drop);
          }
          throw error;
        });
      registrations.set(assetKey, {
        descriptor: accepted,
        promise,
        assets: keys,
      });
      return promise;
    },
    async build(assetKey: string, input: ReviewedBuildInput) {
      const registration = registrations.get(assetKey);
      if (!registration || disposed)
        throw new Error("Reviewed asset not registered");
      await registration.promise;
      if (registrations.get(assetKey) !== registration)
        throw new Error("Reviewed asset released");
      if (input.recipe.style !== registration.descriptor.style)
        throw new Error("Reviewed style mismatch");
      const kit = (await assets.get(registration.assets[0])!
        .promise) as ModernNativePlanetKit;
      const weather = registration.assets[1]
        ? ((await assets.get(registration.assets[1])!
            .promise) as ReviewedWeatherKit)
        : undefined;
      const start = performance.now();
      const result = composeReviewedPlanet(kit, weather, input);
      return { ...result, buildMs: performance.now() - start };
    },
    release(assetKey: string) {
      const entry = registrations.get(assetKey);
      if (entry) {
        registrations.delete(assetKey);
        entry.assets.forEach(drop);
      }
      return { released: true as const };
    },
    dispose() {
      disposed = true;
      registrations.clear();
      assets.clear();
    },
    stats: () => ({
      registrations: registrations.size,
      assets: assets.size,
      disposed,
    }),
  };
}
