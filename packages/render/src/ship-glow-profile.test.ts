import { expect, test } from "vitest";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import type { Scene } from "@babylonjs/core/scene";
import type { GlowLayer } from "@babylonjs/core/Layers/glowLayer";
import {
  applyShipGlowProfile,
  authoredGlowTargetOptions,
} from "./ship-glow-profile";

test("only eligible descriptor assets with renderable and filterable half float gets the HDR target", () => {
  for (const eligible of [false, true])
    for (const render of [false, true])
      for (const filter of [false, true]) {
        const scene = {
          getEngine: () => ({
            getCaps: () => ({
              textureHalfFloatRender: render,
              textureHalfFloatLinearFiltering: filter,
            }),
          }),
        } as unknown as Scene;
        const actual = authoredGlowTargetOptions(scene, eligible);
        const accepted = eligible && render && filter;
        expect(actual.assetHalo).toBe(accepted);
        expect(actual.mainTextureType).toBe(accepted ? 2 : undefined);
      }
});

test("HDR source radiance are bounded and do not change unrelated or fallback emission", () => {
  const sample = (
    halo: boolean,
    owned = false,
    name = "arbitrary-material",
    intensity = 5,
  ) => {
    const glow = {} as GlowLayer;
    applyShipGlowProfile(glow, { assetHalo: halo });
    const result = new Color4();
    glow.customEmissiveColorSelector!(
      { name: "arbitrary-object" } as never,
      undefined as never,
      {
        name,
        alpha: 1,
        emissiveColor: new Color3(0.1, 0.5, 1),
        emissiveIntensity: intensity,
        metadata: owned ? { authoredAssetEmission: {} } : {},
      } as never,
      result,
    );
    return result;
  };
  expect(sample(false).b).toBe(4.25);
  expect(sample(true).b).toBe(1);
  const bounded = sample(true, true);
  expect(bounded.b).toBeGreaterThan(1);
  expect(bounded.b).toBeLessThan(4);
  expect(bounded.r / bounded.b).toBeCloseTo(0.1);
  expect(bounded.g / bounded.b).toBeCloseTo(0.5);
  expect(sample(true, true, "another-name")).toEqual(bounded);
  expect(sample(true, false, "emit_b", 1).b).toBe(0.3);
});
