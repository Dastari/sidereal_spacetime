import { expect, it } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { planetRecipe } from "@sidereal/content/environment";
import { buildPlanetData } from "./planet-build";
import { buildLayeredTerrain, terrainResolution } from "./planet-terrain";
import { createLayeredPlanet, stageLayeredPlanet } from "./layered-planet";
it("counts exact quads before allocation and keeps the same admitted geometry", () => {
  const recipe = {
    ...planetRecipe("temperate", 348112),
    resolution: 12,
    cloudCoverage: 0,
  };
  const count = buildLayeredTerrain(recipe, 12, true),
    full = buildLayeredTerrain(recipe, 12);
  expect(count.terrain.faces).toBe(full.terrain.faces);
  expect(count.terrain.positions).toEqual([]);
  expect(terrainResolution(recipe, 12)).toBe(12);
  const data = buildPlanetData(recipe, 2);
  expect(data.geometry.terrain.positions).toEqual(
    Float32Array.from(full.terrain.positions),
  );
  const engine = new NullEngine(),
    scene = new Scene(engine),
    legacy = createLayeredPlanet(scene, "legacy", recipe, 2);
  const stage = stageLayeredPlanet(scene, "prepared", recipe, 2, data);
  let step = stage.next();
  while (!step.done) {
    expect(step.value.isEnabled()).toBe(false);
    step = stage.next();
  }
  const prepared = step.value;
  for (const suffix of ["-terraces", "-ocean-microcells"]) {
    const a = scene.getMeshByName("legacy" + suffix)!,
      b = scene.getMeshByName("prepared" + suffix)!;
    expect(Array.from(b.getVerticesData("position")!)).toEqual(
      Array.from(a.getVerticesData("position")!).map(Math.fround),
    );
    expect(Array.from(b.getVerticesData("color")!)).toEqual(
      Array.from(a.getVerticesData("color")!).map(Math.fround),
    );
    expect(Array.from(b.getIndices()!)).toEqual(Array.from(a.getIndices()!));
  }
  prepared.dispose();
  legacy.dispose();
  scene.dispose();
  engine.dispose();
});
