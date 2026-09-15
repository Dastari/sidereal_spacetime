import type { NativePlanetKit } from "../../packages/render/src/environment/native-planet-composition";
/** Retained whole native moon body; seed only rotates the authored assembly. */
export function composeCrystalMoonReference(
  kit: NativePlanetKit,
  seed: number,
  _lod: 0 | 1 | 2,
  _diagnostic = false,
) {
  const recipe = (
    kit as NativePlanetKit & {
      compositionRecipe?: {
        referenceId: string;
        layoutSeed: number;
        bodyVariant: string;
      };
    }
  ).compositionRecipe;
  if (
    !recipe ||
    !["planets--crystal-moon-1", "planets--crystal-moon-2"].includes(
      recipe.referenceId,
    ) ||
    recipe.bodyVariant !== "connected-crystalline-body"
  )
    throw new Error("Explicit connected crystalline moon recipe required");
  const source = kit.variants.find((v) => v.name === recipe.bodyVariant) as
    | (NativePlanetKit["variants"][number] & {
        normals: number[];
        uvs: number[];
      })
    | undefined;
  if (
    !source ||
    source.normals?.length !== source.positions.length ||
    source.uvs?.length !== (source.positions.length / 3) * 2
  )
    throw new Error("Missing native moon attributes");
  const phase =
      (((Math.imul((seed ^ recipe.layoutSeed) >>> 0, 1664525) + 1013904223) >>>
        0) /
        4294967296) *
      Math.PI *
      2,
    c = Math.cos(phase),
    s = Math.sin(phase);
  const batches = kit.materials.map(() => ({
    positions: [] as number[],
    normals: [] as number[],
    uvs: [] as number[],
    indices: [] as number[],
    ranges: [] as {
      partId: string;
      firstTriangle: number;
      triangleCount: number;
    }[],
  }));
  for (let i = 0; i < source.indices.length; i += 3) {
    const batch = batches[source.triangleMaterials[i / 3]];
    if (!batch) throw new Error("Invalid native moon material role");
    for (let k = 0; k < 3; k++) {
      const index = source.indices[i + k],
        j = index * 3,
        x = source.positions[j],
        y = source.positions[j + 1],
        z = source.positions[j + 2],
        nx = source.normals[j],
        ny = source.normals[j + 1],
        nz = source.normals[j + 2];
      batch.indices.push(batch.positions.length / 3);
      batch.positions.push(c * x - s * y, z, -s * x - c * y);
      batch.normals.push(c * nx - s * ny, nz, -s * nx - c * ny);
      batch.uvs.push(source.uvs[index * 2], source.uvs[index * 2 + 1]);
    }
  }
  return batches.map((b) => ({
    positions: Float32Array.from(b.positions),
    normals: Float32Array.from(b.normals),
    uvs: Float32Array.from(b.uvs),
    indices: Uint32Array.from(b.indices),
    ranges: b.indices.length
      ? [
          {
            partId: `${recipe.referenceId}/native-body`,
            firstTriangle: 0,
            triangleCount: b.indices.length / 3,
          },
        ]
      : [],
  }));
}
