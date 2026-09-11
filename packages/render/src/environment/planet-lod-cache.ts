import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { PlanetLOD } from "./layered-planet";
/** Ready-only publication. Completion never changes the visible LOD: update commits
 * both enabled states together, and retains previous nodes until body disposal. */
export function createPlanetLODCache<T extends { root: TransformNode }>(
  build: (lod: PlanetLOD) => Promise<T>,
  release: (value: T) => void,
) {
  const levels = new Map<PlanetLOD, T>(),
    pending = new Set<PlanetLOD>(),
    failed = new Set<PlanetLOD>();
  let active: PlanetLOD | undefined,
    disposed = false,
    error: string | undefined;
  function request(lod: PlanetLOD) {
    if (disposed || levels.has(lod) || pending.has(lod) || failed.has(lod))
      return;
    pending.add(lod);
    void build(lod)
      .then((value) => {
        if (disposed) {
          release(value);
          return;
        }
        value.root.setEnabled(false);
        levels.set(lod, value);
      })
      .catch((e) => {
        if (!disposed) {
          error = String(e);
          failed.add(lod);
        }
      })
      .finally(() => pending.delete(lod));
  }
  return {
    request,
    update(desired: PlanetLOD, projected: number) {
      request(desired);
      if (projected > 38 && desired === 2) request(1);
      if (projected > 140 && desired !== 0) request(0);
      const next = levels.get(desired);
      if (next && active !== desired) {
        // No render may interleave this synchronous commit.
        next.root.setEnabled(true);
        if (active !== undefined) levels.get(active)?.root.setEnabled(false);
        active = desired;
      }
      return active === undefined ? undefined : levels.get(active);
    },
    snapshot: () => ({
      active,
      pendingBuilds: pending.size,
      retained: [...levels.keys()],
      error,
    }),
    dispose() {
      disposed = true;
      for (const value of levels.values()) release(value);
      levels.clear();
    },
  };
}
