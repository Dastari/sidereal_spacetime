import type { NativePlanetKit } from "../../packages/render/src/environment/native-planet-composition";
import {
  nativeAssembly,
  tangent,
  seeded,
  globeAnchor,
} from "./native_reference_assembly";
export function composeToxicReference(
  kit: NativePlanetKit,
  seed: number,
  lod: 0 | 1 | 2,
) {
  const assembly = nativeAssembly(kit),
    random = seeded(seed),
    phase = random() * Math.PI * 2;
  assembly.emit(
    ["ground-sphere", "ground-sphere-medium", "ground-sphere-low"][lod],
    "ground",
    (v) => v,
    true,
  );
  for (let i = 0; i < 12; i++)
    assembly.emit(
      ["toxic-basin-group-a", "toxic-basin-group-b", "toxic-basin-group-c"][
        i % 3
      ],
      `basin-${i}`,
      tangent(
        globeAnchor(i, 12, phase),
        [0.36, 0.3, 0.4, 0.33][i % 4],
        random() * Math.PI * 2,
        -0.012,
        true,
      ),
    );
  return assembly.finish();
}
