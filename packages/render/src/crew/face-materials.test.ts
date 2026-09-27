import { afterEach, expect, test, vi } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { createCrewFaceMaterials } from "./face-materials";
import { mergeCrewAppearance, resolveCrewAppearance } from "./appearance";

const engines: NullEngine[] = [];
afterEach(() => engines.splice(0).forEach((engine) => engine.dispose()));
function fixture() {
  const engine = new NullEngine();
  engines.push(engine);
  const scene = new Scene(engine);
  // No GPU/image decoder is needed to exercise Babylon's real UV matrices.
  const source = new Texture(null, scene, { noMipmap: true });
  source.hasAlpha = true;
  source.vScale = -1;
  source.vOffset = 1;
  const roles = [
    "eyes",
    "iris",
    "brows",
    "mouth",
    "detail",
    "facialHair",
    "age",
  ];
  const materials = Object.fromEntries(
    roles.map((role) => {
      const material = new PBRMaterial(`crew.face.${role}`, scene);
      material.albedoTexture = source;
      material.albedoColor = new Color3(0.3, 0.4, 0.5);
      material.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHATEST;
      material.alphaCutOff = 0.05;
      return [role, material];
    }),
  ) as Record<string, PBRMaterial>;
  return { scene, source, materials };
}

test("face layers select complete atlas cells independently and preserve authored ink and alpha", () => {
  const { source, materials } = fixture();
  const face = createCrewFaceMaterials(Object.values(materials));
  face.apply(
    resolveCrewAppearance({
      expression: "wink",
      faceDetail: "cyber",
      facialHair: "sideburns",
      faceAge: "elder",
      hair: "#ff2497",
      eyes: "#29d9ef",
    }),
  );
  const expected = {
    eyes: 5,
    iris: 5,
    brows: 5,
    mouth: 5,
    detail: 8,
    facialHair: 7,
    age: 3,
  };
  for (const [role, tile] of Object.entries(expected)) {
    const material = materials[role];
    const texture = material.albedoTexture as Texture;
    expect(texture).not.toBe(source);
    expect(texture.uScale).toBe(1);
    expect(texture.vScale).toBe(-1);
    expect(texture.vOffset).toBe(1);
    expect(texture.hasAlpha).toBe(true);
    const uv = Vector3.TransformCoordinates(
      // Babylon packs UV translation into the third column (shader vec4(uv, 1, 0)).
      new Vector3(0.5 / 16, 0.5, 1),
      texture.getTextureMatrix(),
    );
    expect(uv.x).toBeCloseTo((tile + 0.5) / 16, 7);
    expect(uv.y).toBeCloseTo(0.5, 7);
    expect(material.alphaCutOff).toBe(0.05);
    expect(material.transparencyMode).toBe(PBRMaterial.PBRMATERIAL_ALPHATEST);
  }
  expect(source.uOffset).toBe(0);
  for (const role of ["eyes", "mouth", "detail", "age"])
    expect(materials[role].albedoColor.asArray()).toEqual([0.3, 0.4, 0.5]);
  const iris = Color3.FromHexString("#29d9ef").toLinearSpace();
  expect(materials.iris.albedoColor.equalsWithEpsilon(iris)).toBe(true);
  expect(materials.brows.albedoColor.r).toBeGreaterThan(
    materials.brows.albedoColor.g,
  );
  expect(materials.brows.albedoColor.r).toBeLessThan(1);
  face.dispose();
});

test("changing one character cannot move another character's face; disposal releases owned UV wrappers", () => {
  const { scene, source, materials } = fixture();
  const second = Object.values(materials).map((material) =>
    material.clone(material.name)!,
  );
  const firstFace = createCrewFaceMaterials(Object.values(materials));
  const secondFace = createCrewFaceMaterials(second);
  const owned = Object.values(materials).map(
    (material) => material.albedoTexture as Texture,
  );
  const removed = owned.map((texture) => vi.fn().mockName(texture.name));
  owned.forEach((texture, i) => texture.onDisposeObservable.add(removed[i]));
  const sourceRemoved = vi.fn();
  source.onDisposeObservable.add(sourceRemoved);
  firstFace.apply(
    resolveCrewAppearance({ expression: "happy", faceAge: "mature" }),
  );
  secondFace.apply(
    resolveCrewAppearance({ expression: "stern", faceAge: "young" }),
  );
  expect((materials.eyes.albedoTexture as Texture).uOffset).toBe(1 / 16);
  expect((second[0].albedoTexture as Texture).uOffset).toBe(2 / 16);
  const beforeUpdates = scene.textures.length;
  for (let i = 0; i < 10; i++)
    firstFace.apply(resolveCrewAppearance({ expression: "grin" }));
  expect(scene.textures).toHaveLength(beforeUpdates);
  firstFace.dispose();
  firstFace.dispose();
  expect(removed.every((observer) => observer.mock.calls.length === 1)).toBe(
    true,
  );
  expect(sourceRemoved).not.toHaveBeenCalled();
  expect(materials.eyes.albedoTexture).toBe(source);
  expect((second[0].albedoTexture as Texture).uOffset).toBe(2 / 16);
  expect(scene.textures).toHaveLength(beforeUpdates - owned.length);
  secondFace.dispose();
});

test("hair keeps authored shading under any dye and legacy characters need no atlas", () => {
  const { scene } = fixture();
  const names = [
    "crew.hair.modular",
    "crew.hair.shadow",
    "crew.hair.highlight.001",
    "crew.face.eyes",
    "component.recon.chest",
  ];
  const [base, shadow, highlight, ink, equipment] = names.map(
    (name) => new PBRMaterial(name, scene),
  );
  const face = createCrewFaceMaterials([
    base,
    shadow,
    highlight,
    ink,
    equipment,
  ]);
  const textureCount = scene.textures.length;
  face.apply(
    resolveCrewAppearance({ hair: "#2864ff", expression: "surprised" }),
  );
  expect(scene.textures).toHaveLength(textureCount);
  const desired = Color3.FromHexString("#2864ff").toLinearSpace();
  expect(base.albedoColor.equalsWithEpsilon(desired)).toBe(true);
  expect(shadow.albedoColor.r).toBeLessThan(base.albedoColor.r);
  expect(highlight.albedoColor.r).toBeGreaterThan(base.albedoColor.r);
  expect(ink.albedoColor.equals(Color3.White())).toBe(true);
  expect(equipment.albedoColor.equals(Color3.White())).toBe(true);
  face.dispose();
});

test("legacy defaults are adult and neutral, while uniform changes preserve explicit personal choices", () => {
  expect(resolveCrewAppearance({})).toMatchObject({
    eyes: "#754c2b",
    expression: "neutral",
    faceDetail: "none",
    facialHair: "none",
    faceAge: "adult",
  });
  const personal = {
    bodyType: "female",
    hairStyle: "bob",
    skin: "#764e3b",
    hair: "#ff2497",
    eyes: "#29d9ef",
    expression: "determined",
    faceDetail: "scar",
    facialHair: "goatee",
    faceAge: "mature",
  } as const;
  const next = mergeCrewAppearance(
    { ...personal, outfit: "engineer", armor: "heavy", weapon: "rifle" },
    { outfit: "medic" },
  );
  expect(next).toMatchObject({ ...personal, outfit: "medic", weapon: "rifle" });
  expect(next.armor).toBeUndefined();
  expect(resolveCrewAppearance(next).armor).toBe("medical");
  expect(
    mergeCrewAppearance(next, {
      outfit: "captain",
      eyes: "#ff0000",
      facialHair: "none",
    }),
  ).toMatchObject({ ...personal, eyes: "#ff0000", facialHair: "none" });
  // Presets can still supply features until the character explicitly chooses them.
  expect(
    mergeCrewAppearance({ outfit: "engineer" }, { outfit: "scientist" }).hair,
  ).toBeUndefined();
});
