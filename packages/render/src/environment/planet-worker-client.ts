import type {
  ReviewedBuildInput,
  ReviewedBuildResult,
} from "./reviewed-native/build-reviewed-planet";
import type {
  ReviewedRegistration,
  ReviewedAssetDescriptor,
} from "./reviewed-native/reviewed-worker-registry";
import {
  buildNativeIceData,
  type NativeIceBuildData,
} from "./native-ice-build";
import {
  buildNativeVolcanicData,
  type NativeVolcanicBuildData,
} from "./native-volcanic-build";
import type { NativePlanetKit } from "./native-planet-composition";
import { createPlanetBuildScheduler } from "./planet-build-scheduler";
import type { PlanetRecipe } from "../../../content/src/environment";
import {
  buildPlanetData,
  buildPlanetWeather,
  type PlanetBuildData,
  type PlanetWeatherData,
} from "./planet-build";
/** One worker bounds CPU/memory pressure. No synchronous browser fallback. */
export function createPlanetWorkerClient() {
  const scheduler = createPlanetBuildScheduler();
  let worker: Worker | undefined,
    serial = 0,
    disposed = false,
    lastBuildMs: number | undefined;
  type Result =
    | PlanetBuildData
    | PlanetWeatherData
    | NativeVolcanicBuildData
    | NativeIceBuildData
    | ReviewedBuildResult
    | ReviewedRegistration
    | { released: true };
  const jobs = new Map<
    number,
    {
      resolve: (v: Result) => void;
      reject: (e: Error) => void;
      weather: boolean;
    }
  >();
  const registrations = new Map<
    string,
    {
      refs: number;
      promise: Promise<ReviewedRegistration>;
      value?: ReviewedRegistration;
    }
  >();
  const fail = (error: Error) => {
    registrations.clear();
    for (const job of jobs.values()) job.reject(error);
    jobs.clear();
  };
  function request(
    recipe: PlanetRecipe,
    lod: 0 | 1 | 2,
    phase?: number,
    nativeKit?: NativePlanetKit,
  ): Promise<Result> {
    if (disposed) return Promise.reject(new Error("Planet worker disposed"));
    if (typeof window === "undefined" && typeof Worker === "undefined")
      return Promise.resolve(
        nativeKit
          ? nativeKit.layout === "glacial-interior"
            ? buildNativeIceData(nativeKit, recipe, lod)
            : buildNativeVolcanicData(nativeKit, recipe, lod)
          : phase === undefined
            ? buildPlanetData(recipe, lod)
            : buildPlanetWeather(recipe, lod, phase),
      );
    return send({ recipe, lod, phase, nativeKit }, phase !== undefined);
  }
  function send(payload: object, weather = false): Promise<Result> {
    if (disposed) return Promise.reject(new Error("Planet worker disposed"));
    return new Promise((resolve, reject) => {
      let id: number | undefined;
      try {
        if (!worker) {
          worker = new Worker(new URL("./planet-worker.ts", import.meta.url), {
            type: "module",
          });
          worker.onmessage = (
            event: MessageEvent<{
              id: number;
              result?: Result;
              error?: string;
            }>,
          ) => {
            const job = jobs.get(event.data.id);
            if (!job) return;
            jobs.delete(event.data.id);
            if (event.data.result) {
              if (!job.weather && "buildMs" in event.data.result)
                lastBuildMs = event.data.result.buildMs;
              job.resolve(event.data.result);
            } else
              job.reject(new Error(event.data.error ?? "Planet worker failed"));
          };
          const failed = (error: Error) => {
            fail(error);
            worker?.terminate();
            worker = undefined;
          };
          worker.onerror = (event) =>
            failed(new Error(event.message || "Planet worker failed"));
          worker.onmessageerror = () =>
            failed(new Error("Planet worker message could not be decoded"));
        }
        id = ++serial;
        jobs.set(id, { resolve, reject, weather });
        worker.postMessage({ id, ...payload });
      } catch (error) {
        if (id !== undefined) jobs.delete(id);
        const failure =
          error instanceof Error ? error : new Error(String(error));
        fail(failure);
        worker?.terminate();
        worker = undefined;
        reject(failure);
      }
    });
  }
  return {
    nextFrame: scheduler.next,
    registerReviewed(
      descriptor: ReviewedAssetDescriptor,
    ): Promise<ReviewedRegistration> {
      if (disposed) return Promise.reject(new Error("Planet worker disposed"));
      const key = JSON.stringify(descriptor),
        existing = registrations.get(key);
      if (existing) {
        existing.refs++;
        return existing.promise;
      }
      const entry: {
        refs: number;
        promise: Promise<ReviewedRegistration>;
        value?: ReviewedRegistration;
      } = { refs: 1, promise: Promise.resolve(undefined as never) };
      entry.promise = (
        send({
          type: "reviewed-register",
          descriptor,
        }) as Promise<ReviewedRegistration>
      ).then(
        (value) => {
          if (registrations.get(key) !== entry)
            throw new Error("Reviewed registration invalidated");
          entry.value = value;
          return value;
        },
        (error) => {
          if (registrations.get(key) === entry) registrations.delete(key);
          throw error;
        },
      );
      registrations.set(key, entry);
      return entry.promise;
    },
    buildReviewed(
      assetKey: string,
      input: ReviewedBuildInput,
    ): Promise<ReviewedBuildResult> {
      if (
        ![...registrations.values()].some(
          (entry) => entry.value?.assetKey === assetKey && entry.refs > 0,
        )
      )
        return Promise.reject(new Error("Reviewed asset registration expired"));
      return send({
        type: "reviewed-build",
        assetKey,
        input,
      }) as Promise<ReviewedBuildResult>;
    },
    async releaseReviewed(assetKey: string): Promise<void> {
      for (const [key, entry] of registrations) {
        if (entry.value?.assetKey !== assetKey) continue;
        if (--entry.refs > 0) return;
        registrations.delete(key);
        await send({ type: "reviewed-release", assetKey });
        return;
      }
    },
    snapshot: () => ({
      lastBuildMs,
      pendingBuilds: jobs.size,
      pendingWeatherBuilds: [...jobs.values()].filter((j) => j.weather).length,
    }),
    build: (recipe: PlanetRecipe, lod: 0 | 1 | 2) =>
      request(recipe, lod) as Promise<PlanetBuildData>,
    nativeIce: (kit: NativePlanetKit, recipe: PlanetRecipe, lod: 0 | 1 | 2) =>
      request(recipe, lod, undefined, kit) as Promise<NativeIceBuildData>,
    nativeVolcanic: (
      kit: NativePlanetKit,
      recipe: PlanetRecipe,
      lod: 0 | 1 | 2,
    ) =>
      request(recipe, lod, undefined, kit) as Promise<NativeVolcanicBuildData>,
    weather: (recipe: PlanetRecipe, lod: 0 | 1 | 2, phase: number) =>
      request(recipe, lod, phase) as Promise<PlanetWeatherData>,
    dispose() {
      disposed = true;
      scheduler.dispose();
      worker?.terminate();
      fail(new Error("Planet worker disposed"));
    },
  };
}

export type ReviewedPlanetWorkerClient = ReturnType<
  typeof createPlanetWorkerClient
>;
export type { ReviewedRegistration } from "./reviewed-native/reviewed-worker-registry";
export type { ReviewedBuildResult } from "./reviewed-native/build-reviewed-planet";
