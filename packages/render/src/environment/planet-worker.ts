import { buildPlanetData, buildPlanetWeather } from "./planet-build";
import type { PlanetRecipe } from "../../../content/src/environment";
/** Rendering data only. A request revision rejects stale results after body edits/removal. */
self.onmessage = (
  event: MessageEvent<{
    id: number;
    recipe: PlanetRecipe;
    lod: 0 | 1 | 2;
    phase?: number;
  }>,
) => {
  const { id, recipe, lod, phase } = event.data;
  try {
    const result =
      phase === undefined
        ? buildPlanetData(recipe, lod)
        : buildPlanetWeather(recipe, lod, phase);
    const transfer: ArrayBuffer[] = [];
    for (const g of "generated" in result
      ? Object.values(result.geometry)
      : [result.geometry])
      for (const key of [
        "positions",
        "normals",
        "colors",
        "indices",
        "iceOptics",
      ] as const) {
        const buffer = g[key]?.buffer;
        if (buffer) transfer.push(buffer as ArrayBuffer);
      }
    self.postMessage({ id, result }, { transfer });
  } catch (error) {
    self.postMessage({ id, error: String(error) });
  }
};
