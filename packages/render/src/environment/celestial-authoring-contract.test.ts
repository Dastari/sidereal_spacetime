import { expect, test } from "vitest";
import { CELESTIAL_ASSETS } from "@sidereal/content/celestial-assets";
import {
  REVIEWED_NATIVE_PLANETS,
  reviewedNativePlanet,
} from "./reviewed-native-planet-catalog";
import { REVIEWED_YELLOW_STAR } from "./reviewed-star-catalog";
test("every authority-selectable Genesis asset matches the native runtime catalog", () => {
  const planets = CELESTIAL_ASSETS.filter((a) => a.kind === "planet");
  expect(planets.map((a) => a.id).sort()).toEqual(
    REVIEWED_NATIVE_PLANETS.map((a) => a.id).sort(),
  );
  for (const asset of planets)
    expect(reviewedNativePlanet(asset.id)).toMatchObject({
      id: asset.id,
      style: asset.style,
    });
  const stars = CELESTIAL_ASSETS.filter((a) => a.kind === "star");
  expect(stars).toHaveLength(1);
  expect(stars[0]).toMatchObject({
    id: REVIEWED_YELLOW_STAR.id,
    seed: REVIEWED_YELLOW_STAR.seed,
  });
});
