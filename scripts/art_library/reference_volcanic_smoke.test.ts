import { expect, it } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import {
  planetRecipe,
  planetEffects,
} from "../../packages/content/src/environment";
import { buildPlanetClouds } from "../../packages/render/src/environment/planet-clouds";
import { packPlanetGeometry } from "../../packages/render/src/environment/planet-build";
import { buildReferenceVolcanicSmoke } from "./reference_volcanic_smoke_build";
import { referenceVolcanicSmokeRuntime } from "./reference_volcanic_smoke_runtime";
it("restores exact existing smoke despite cloudCoverage zero and respects effects/LOD gates", () => {
  const recipe = planetRecipe("volcanic", 38);
  expect(recipe.cloudCoverage).toBe(0);
  const packed = buildReferenceVolcanicSmoke(recipe, 0)!;
  expect(packed).toEqual(
    packPlanetGeometry(
      buildPlanetClouds({
        seed: 947,
        coverage: 0.14,
        radius: 1.145,
        detail: 48,
        tint: [0.24, 0.2, 0.22],
      }),
    ),
  );
  expect(buildReferenceVolcanicSmoke(recipe, 1)).toEqual(packed);
  expect(buildReferenceVolcanicSmoke(recipe, 2)).toBeUndefined();
  expect(
    buildReferenceVolcanicSmoke(
      { ...recipe, effects: { ...planetEffects(recipe), smoke: 0 } },
      0,
    ),
  ).toBeUndefined();
  expect(
    buildReferenceVolcanicSmoke({ ...recipe, resolution: 32 }, 0),
  ).toBeUndefined();
});
it("NullEngine preserves original PBR, shared material, retained-LOD visibility and truthful counters/identity", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  try {
    const recipe = planetRecipe("volcanic", 38),
      runtime = referenceVolcanicSmokeRuntime(scene, "reference", recipe),
      a = new TransformNode("lod0", scene),
      b = new TransformNode("lod1", scene);
    b.setEnabled(false);
    const m0 = runtime.attach(a, 0, buildReferenceVolcanicSmoke(recipe, 0))!,
      m1 = runtime.attach(b, 1, buildReferenceVolcanicSmoke(recipe, 1))!;
    expect(runtime.attach(b, 2, undefined)).toBeUndefined();
    expect(m0.material).toBe(m1.material);
    expect(scene.materials).toHaveLength(1);
    const material = m0.material as PBRMaterial;
    expect(material.alpha).toBe(0.48);
    expect(material.roughness).toBe(1);
    expect(material.directIntensity).toBe(1.45);
    expect(material.emissiveColor.asArray()).toEqual([0, 0, 0]);
    expect(material.disableDepthWrite).toBe(true);
    expect(m0.metadata.role).toBe("planet");
    expect(m0.metadata.planetWeather).toBe(true);
    expect(m0.metadata.trianglePlacementRanges).toEqual(
      m1.metadata.trianglePlacementRanges,
    );
    expect(runtime.stats().smokeMeshes).toBe(1);
    expect(runtime.stats().smokeTriangles).toBe(m0.getTotalIndices() / 3);
    expect(runtime.stats().retainedSmokeMeshes).toBe(2);
    a.setEnabled(false);
    b.setEnabled(true);
    expect(runtime.stats().smokeMeshes).toBe(1);
    b.setEnabled(false);
    expect(runtime.stats().smokeMeshes).toBe(0);
    runtime.dispose();
    expect(runtime.stats().retainedSmokeMeshes).toBe(0);
    expect(scene.materials).toHaveLength(0);
  } finally {
    scene.dispose();
    engine.dispose();
  }
});
