import { buildNativeIceData } from "./native-ice-build";
import { buildNativeVolcanicData } from "./native-volcanic-build";
import type { NativePlanetKit } from "./native-planet-composition";
import { buildPlanetData, buildPlanetWeather } from "./planet-build";
import type { PlanetRecipe } from "../../../content/src/environment";
/** Rendering data only. A request revision rejects stale results after body edits/removal. */
self.onmessage = (
  event: MessageEvent<{
    id: number;
    recipe: PlanetRecipe;
    lod: 0 | 1 | 2;
    phase?: number;
    nativeKit?: NativePlanetKit;
  }>,
) => {
  const { id, recipe, lod, phase, nativeKit } = event.data;
  try {
    const result = nativeKit
      ? nativeKit.layout === "glacial-interior"
        ? buildNativeIceData(nativeKit, recipe, lod)
        : buildNativeVolcanicData(nativeKit, recipe, lod)
      : phase === undefined
        ? buildPlanetData(recipe, lod)
        : buildPlanetWeather(recipe, lod, phase);
    const transfer: ArrayBuffer[] = [];
    const seen = new Set<ArrayBuffer>();
    function buffers(value: unknown) {
      if (ArrayBuffer.isView(value)) {
        const buffer = value.buffer as ArrayBuffer;
        if (!seen.has(buffer)) {
          seen.add(buffer);
          transfer.push(buffer);
        }
        return;
      }
      if (value && typeof value === "object")
        for (const child of Object.values(value)) buffers(child);
    }
    buffers(result);
    self.postMessage({ id, result }, { transfer });
  } catch (error) {
    self.postMessage({ id, error: String(error) });
  }
};
