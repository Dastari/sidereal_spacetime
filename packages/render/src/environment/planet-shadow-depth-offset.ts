import type { AbstractEngine } from "@babylonjs/core/Engines/abstractEngine";
import type { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";

/** Offset shadow-map raster depth by triangle slope, rather than displacing
 * authored surface normals. Restore engine state before any visible pass. */
export function applyPlanetShadowDepthOffset(
  engine: AbstractEngine,
  shadows: ShadowGenerator,
) {
  let previous: [number, number] | undefined;
  const restore = () => {
    if (!previous) return;
    engine.setZOffset(previous[0]);
    engine.setZOffsetUnits(previous[1]);
    previous = undefined;
  };
  const before = shadows.onBeforeShadowMapRenderMeshObservable.add(() => {
    restore();
    previous = [engine.getZOffset(), engine.getZOffsetUnits()];
    engine.setZOffset(2);
    engine.setZOffsetUnits(2);
  });
  const after = shadows.onAfterShadowMapRenderMeshObservable.add(restore);
  const map = shadows.getShadowMap()!;
  const unbind = map.onAfterUnbindObservable.add(restore);
  return () => {
    restore();
    shadows.onBeforeShadowMapRenderMeshObservable.remove(before);
    shadows.onAfterShadowMapRenderMeshObservable.remove(after);
    map.onAfterUnbindObservable.remove(unbind);
  };
}
