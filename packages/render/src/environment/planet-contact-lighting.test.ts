import { describe, expect, it } from "vitest";
import {
  adjacentLavaRadiance,
  terrainContactOcclusion,
} from "./planet-contact-lighting";
import { buildLayeredTerrain } from "./planet-terrain";
import { planetRecipe } from "../../../content/src/environment";

describe("bounded planet contact lighting", () => {
  it("keeps open surfaces bright and bounds contact darkening by local obstruction", () => {
    expect(terrainContactOcclusion(1, [1, 1, 1, 1], 0.02)).toBe(1);
    const shallow = terrainContactOcclusion(1, [1.01, 1, 1, 1], 0.02);
    const cavity = terrainContactOcclusion(1, [1.1, 1.1, 1.1, 1.1], 0.02);
    expect(shallow).toBeLessThan(1);
    expect(cavity).toBeLessThan(shallow);
    expect(cavity).toBeGreaterThanOrEqual(0.48);
  });
  it("lights only adjacent molten edges, decays up cliffs and follows emission", () => {
    expect(adjacentLavaRadiance(false, 1, 1, 0.02, 3)).toEqual([0, 0, 0]);
    expect(adjacentLavaRadiance(true, 1, 1, 0.02, 0)).toEqual([0, 0, 0]);
    const near = adjacentLavaRadiance(true, 1, 1.01, 0.02, 2);
    const far = adjacentLavaRadiance(true, 1, 1.15, 0.02, 2);
    expect(near[0]).toBeGreaterThan(far[0] * 10);
    expect(near[0]).toBeGreaterThan(near[1]);
    expect(adjacentLavaRadiance(true, 1, 1.01, 0.02, 4)[0]).toBeCloseTo(
      near[0] * 2,
    );
  });
  it("creates local spill geometry and separates optical ice from opaque snow", () => {
    const lava = buildLayeredTerrain(planetRecipe("volcanic", 89), 32);
    expect(lava.spill.faces).toBeGreaterThan(0);
    expect(lava.spill.faces).toBeLessThan(lava.terrain.faces);
    expect(lava.spill.positions.every(Number.isFinite)).toBe(true);
    const temperate = buildLayeredTerrain(planetRecipe("temperate", 17), 24);
    expect(temperate.spill.faces).toBe(0);
    const ice = buildLayeredTerrain(planetRecipe("ice", 47), 32);
    expect(ice.ice.faces).toBeGreaterThan(0);
    expect(ice.terrain.faces).toBeGreaterThan(0);
    expect(ice.ice.iceOptics?.length).toBe((ice.ice.positions.length / 3) * 2);
    expect(ice.ice.iceOptics?.every((v) => v >= 0 && v <= 1)).toBe(true);
  });
});
