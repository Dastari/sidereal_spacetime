import {createPlanetBuildScheduler} from "./planet-build-scheduler";
import type { PlanetRecipe } from "../../../content/src/environment";
import {
  buildPlanetData,
  buildPlanetWeather,
  type PlanetBuildData,
  type PlanetWeatherData,
} from "./planet-build";
/** One worker bounds CPU/memory pressure. No synchronous browser fallback. */
export function createPlanetWorkerClient() {
  const scheduler=createPlanetBuildScheduler();
  let worker: Worker | undefined,
    serial = 0,
    disposed = false,
    lastBuildMs: number | undefined;
  type Result = PlanetBuildData | PlanetWeatherData;
  const jobs = new Map<
    number,
    {
      resolve: (v: Result) => void;
      reject: (e: Error) => void;
      weather: boolean;
    }
  >();
  const fail = (error: Error) => {
    for (const job of jobs.values()) job.reject(error);
    jobs.clear();
  };
  function request(
    recipe: PlanetRecipe,
    lod: 0 | 1 | 2,
    phase?: number,
  ): Promise<Result> {
    if (disposed) return Promise.reject(new Error("Planet worker disposed"));
    if (typeof window === "undefined" && typeof Worker === "undefined")
      return Promise.resolve(
        phase === undefined
          ? buildPlanetData(recipe, lod)
          : buildPlanetWeather(recipe, lod, phase),
      );
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
              if (!job.weather) lastBuildMs = event.data.result.buildMs;
              job.resolve(event.data.result);
            } else
              job.reject(new Error(event.data.error ?? "Planet worker failed"));
          };
          worker.onerror = (event) => {
            fail(new Error(event.message));
            worker?.terminate();
            worker = undefined;
          };
        }
        id = ++serial;
        jobs.set(id, { resolve, reject, weather: phase !== undefined });
        worker.postMessage({ id, recipe, lod, phase });
      } catch (error) {
        if (id !== undefined) jobs.delete(id);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }
  return {
    nextFrame:scheduler.next,
    snapshot: () => ({
      lastBuildMs,
      pendingBuilds: jobs.size,
      pendingWeatherBuilds: [...jobs.values()].filter((j) => j.weather).length,
    }),
    build: (recipe: PlanetRecipe, lod: 0 | 1 | 2) =>
      request(recipe, lod) as Promise<PlanetBuildData>,
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
