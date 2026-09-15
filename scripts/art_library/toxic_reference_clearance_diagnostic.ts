import type { NativePlanetKit } from "../../packages/render/src/environment/native-planet-composition";
import {
  nativeAssembly,
  tangent,
  unit,
  cross,
  type Vec,
} from "./native_reference_assembly";
import { nativeSurfaceFloor } from "./native_surface_clearance";
/** Regression diagnostic for the original Toxic2 submerged liquid defect. */
export function toxicClearanceDiagnostic(kit: NativePlanetKit, clear = true) {
  const assembly = nativeAssembly(kit),
    n = unit([0.452, 0.388, 0.794]),
    scale = 0.3,
    e = unit(cross([0, 1, 0], n)),
    north = cross(n, e),
    floor = nativeSurfaceFloor(
      kit.variants.find((v) => v.name === "toxic-basin-group-a")!,
    );
  assembly.emit(
    "ground-sphere",
    "ground",
    (v: Vec) => {
      if (!clear) return v;
      const direction = unit(v),
        dot = direction.reduce((sum, k, j) => sum + k * n[j], 0);
      if (dot <= 0) return v;
      const x =
          direction.reduce((sum, k, j) => sum + k * e[j], 0) / dot / scale,
        y =
          direction.reduce((sum, k, j) => sum + k * north[j], 0) / dot / scale;
      let z = floor(x, y);
      for (const [dx, dy] of [
        [0.1, 0],
        [-0.1, 0],
        [0, 0.1],
        [0, -0.1],
      ])
        z = Math.min(z, floor(x + dx, y + dy));
      const h = Number.isFinite(z)
        ? Math.min(1, 1 - 0.012 + (z - 0.07) * scale)
        : 1;
      return direction.map((k) => k * h) as Vec;
    },
    true,
  );
  assembly.emit(
    "toxic-basin-group-a",
    "basin-diagnostic",
    tangent(n, scale, 0, -0.012, true),
  );
  return assembly.finish();
}
