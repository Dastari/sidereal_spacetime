import { expect, test } from "vitest";
import { planetRecipe } from "../../../content/src/environment";
import { buildLayeredTerrain } from "./planet-terrain";
import { sampleOceanGlints } from "./planet-sparkles";
test("water glints stay sparse, deterministic and anchored above real ocean cells",()=>{
  const water=buildLayeredTerrain(planetRecipe("temperate",17),48).water;
  const points=sampleOceanGlints(water,17);
  expect(points.length).toBeGreaterThan(10);
  expect(points.length).toBeLessThanOrEqual(96);
  expect(points).toEqual(sampleOceanGlints(water,17));
  expect(points).not.toEqual(sampleOceanGlints(water,18));
  for(const point of points){
    expect(point.position.every(Number.isFinite)).toBe(true);
    expect(Math.hypot(...point.position)).toBeGreaterThan(.95);
    expect(Math.hypot(...point.position)).toBeLessThan(.96);
    expect(Math.hypot(...point.normal)).toBeCloseTo(1);
  }
  expect(points.some(p=>p.position[0]>0)).toBe(true);
  expect(points.some(p=>p.position[0]<0)).toBe(true);
});
