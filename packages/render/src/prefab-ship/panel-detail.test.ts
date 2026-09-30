import { afterEach, expect, it } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import {
  normalDetailMaterial,
  type NormalDetailSelection,
} from "./normal-detail";

const scenes: Scene[] = [];
function fixture() {
  const s = new Scene(new NullEngine());
  scenes.push(s);
  return { s, base: new PBRMaterial("panel", s) };
}
afterEach(() => {
  for (const s of scenes.splice(0)) {
    const e = s.getEngine();
    s.dispose();
    e.dispose();
  }
});
const selection: NormalDetailSelection = {
  enabled: true,
  profile: "federation",
  family: "panel",
  revision: "r002",
  normalUrl: "data:image/png;base64,",
  normalSha256: "a".repeat(64),
  strength: 0.32,
  albedoUrl: "data:image/png;base64,AA==",
  albedoSha256: "b".repeat(64),
};
const channels = { uvs: [0, 0, 1, 0, 0, 1] };

it("shares one aligned multiplier across existing wrappers without changing palette or finish", () => {
  const { s, base } = fixture();
  base.albedoColor = new Color3(0.46, 0.445, 0.42);
  base.roughness = 0.32;
  base.metallic = 0;
  base.clearCoat.isEnabled = true;
  base.clearCoat.intensity = 0.08;
  const detail = normalDetailMaterial(base, selection, channels);
  const other = normalDetailMaterial(
    new PBRMaterial("trim", s),
    selection,
    channels,
  );
  expect(normalDetailMaterial(base, selection, channels)).toBe(detail);
  expect(other.albedoTexture).toBe(detail.albedoTexture);
  expect(other.bumpTexture).toBe(detail.bumpTexture);
  expect(
    s.textures.filter((t) => t.name.startsWith("ship-albedo:")),
  ).toHaveLength(1);
  expect(detail.albedoTexture?.gammaSpace).toBe(false);
  expect(detail.albedoTexture?.coordinatesIndex).toBe(0);
  expect(detail.albedoTexture?.level).toBe(1);
  expect(detail.albedoColor).toEqual(base.albedoColor);
  expect(detail.roughness).toBe(base.roughness);
  expect(detail.metallic).toBe(base.metallic);
  expect(detail.clearCoat.intensity).toBe(base.clearCoat.intensity);
  expect(detail.indexOfRefraction).toBe(base.indexOfRefraction);
  expect(detail.emissiveColor).toEqual(base.emissiveColor);
  expect(base.albedoTexture).toBeNull();
  expect(
    normalDetailMaterial(
      base,
      { ...selection, albedoSha256: "c".repeat(64) },
      channels,
    ),
  ).not.toBe(detail);
});

it("retains authored colour maps and allocates no unused panel multiplier", () => {
  const { s, base } = fixture();
  const authored = new Texture("", s);
  base.albedoTexture = authored;
  const detail = normalDetailMaterial(base, selection, channels);
  expect(detail.albedoTexture).toBe(authored);
  expect(base.albedoTexture).toBe(authored);
  expect(
    s.textures.filter((t) => t.name.startsWith("ship-albedo:")),
  ).toHaveLength(0);
  expect(detail.bumpTexture).not.toBeNull();
});

it("preserves absent-map identities and disabled or incomplete-UV allocation isolation", () => {
  const { s, base } = fixture();
  const counts = [s.materials.length, s.textures.length];
  expect(
    normalDetailMaterial(base, { ...selection, enabled: false }, channels),
  ).toBe(base);
  expect(normalDetailMaterial(base, selection, {})).toBe(base);
  expect(
    normalDetailMaterial(base, selection, { ...channels, uvsComplete: false }),
  ).toBe(base);
  expect([s.materials.length, s.textures.length]).toEqual(counts);
  const { albedoUrl: _url, albedoSha256: _sha, ...normalOnly } = selection;
  const normal = normalDetailMaterial(base, normalOnly, channels);
  expect(normal.name).not.toContain(":albedo:");
  expect(normal.albedoTexture).toBeNull();
  expect(normalDetailMaterial(base, normalOnly, channels)).toBe(normal);
  expect(() =>
    normalDetailMaterial(
      base,
      { ...selection, albedoSha256: undefined },
      channels,
    ),
  ).toThrow(/Invalid/);
  expect(() =>
    normalDetailMaterial(
      base,
      { ...selection, albedoUrl: undefined },
      channels,
    ),
  ).toThrow(/Invalid/);
});

it("owns multiplier resources per scene and does not dispose another scene's maps", () => {
  const first = fixture();
  const second = fixture();
  const a = normalDetailMaterial(first.base, selection, channels);
  const b = normalDetailMaterial(second.base, selection, channels);
  expect(a.albedoTexture).not.toBe(b.albedoTexture);
  first.s.dispose();
  expect(second.s.textures).toContain(b.albedoTexture);
  expect(second.s.materials).toContain(b);
});
