import { expect, test } from "vitest";
import {
  PLANET_STYLES,
  planetRecipeForAppearance,
  planetEffects,
} from "./environment";
test("bare world appearance keys retain complete family recipes and gas rings", () => {
  for (const style of PLANET_STYLES) {
    const recipe = planetRecipeForAppearance(style, 42);
    expect(recipe.style).toBe(style);
    expect(recipe.seed).toBe(42);
    expect(recipe.rings).toBe(style === "gas");
  }
  expect(planetRecipeForAppearance("amethyst", 38).style).toBe("gas");
  expect(planetRecipeForAppearance("pelagic", 17).style).toBe("temperate");
  expect(planetRecipeForAppearance("companion", 17).style).toBe("moon");
});
test("authored mixed appearance composes effects without changing its temperate base", () => {
  const recipe = planetRecipeForAppearance("temperate-volcanic", 123);
  expect(recipe.style).toBe("temperate");
  expect(planetEffects(recipe).volcanicCoverage).toBe(0.15);
  expect(planetEffects(recipe).smoke).toBe(0.12);
  expect(planetEffects(recipe).vegetation).toBeGreaterThan(0);
  expect(recipe.emission).toBe(2);
  expect(recipe).toEqual(planetRecipeForAppearance("temperate-volcanic", 123));
});
