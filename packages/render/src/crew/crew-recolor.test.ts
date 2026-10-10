/** Port of study tests/recolor.test.ts at 8f26c307, adapted to the immutable v2 fixtures. */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { SceneLoader } from "@babylonjs/core/Loading/sceneLoader";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { CREW_STUDY, crewStudyPartFile } from "@sidereal/content/crew-study";
import { CREW_FAMILIES } from "./crew-study-material-config";
import {
  CrewMaterialRegistry,
  crewMaterialSlot,
  itemMaterialSlot,
} from "./crew-recolor";
import { studyMaterials, STUDY_EMISSIVE_SCALE } from "./crew-study-materials";
import { toneCrewEmissive } from "./voxel-crew-outfit";
import "@babylonjs/loaders/glTF";

const bytes = (file: string) =>
  new Uint8Array(
    readFileSync(
      new URL(
        `../../../../assets/runtime/crew/${CREW_STUDY.revision}/${file.replace(/#/g, "%23")}`,
        import.meta.url,
      ),
    ),
  );
describe("crew recolour", () => {
  it("parses slot names", () => {
    expect(crewMaterialSlot("crew.suit_primary")).toBe("suit_primary");
    expect(crewMaterialSlot("crew.skin.001")).toBe("skin");
    expect(crewMaterialSlot("crew.emit_b")).toBe("emit_b");
    expect(crewMaterialSlot("crew.bogus")).toBeUndefined();
    expect(itemMaterialSlot("slot:emit_a@orion")).toBe("emit_a");
  });

  it("hair / suit / skin recolour factor colour, keep COLOR_0 and follow family finishes", async () => {
    const engine = new NullEngine(),
      scene = new Scene(engine),
      registry = new CrewMaterialRegistry();
    const load = (file: string) =>
      SceneLoader.LoadAssetContainerAsync(
        "",
        bytes(file),
        scene,
        undefined,
        ".glb",
      );
    const body = await load(CREW_STUDY.body.file);
    const hair = await load(
      crewStudyPartFile("groom.fluffy_curls", false)!.file,
    );
    const suit = await load(crewStudyPartFile("uniform.captain", false)!.file);
    registry.register(body.materials, "body");
    registry.register(
      hair.materials,
      "hair",
      CREW_STUDY.parts["groom.fluffy_curls"].families,
    );
    registry.register(
      suit.materials,
      "uniform",
      CREW_STUDY.parts["uniform.captain"].families,
    );
    const rifle = await load("items/beam_rifle.glb");
    registry.register(
      rifle.materials,
      "rifle",
      CREW_STUDY.items["item.beam_rifle"].families,
    );
    registry.register(rifle.materials, "rifle");
    expect(registry.select({ part: "rifle" })).toHaveLength(
      rifle.materials.length,
    );
    const item = registry.select({ slot: "primary", part: "rifle" })[0]
      .material;
    registry.applyFinishes();
    const hairMeshes = hair.meshes.filter((m) =>
      m.material?.name.startsWith("crew.hair"),
    );
    expect(hairMeshes.length).toBeGreaterThan(0);
    const colorsBefore = hairMeshes.map((m) =>
      Float32Array.from(m.getVerticesData(VertexBuffer.ColorKind) ?? []),
    );
    hairMeshes.forEach((m, k) => {
      const c = colorsBefore[k],
        stride = m.getVertexBuffer(VertexBuffer.ColorKind)!.getSize();
      for (let i = 0; i < c.length; i += stride)
        expect(
          Math.abs(c[i] - c[i + 1]) + Math.abs(c[i] - c[i + 2]),
        ).toBeLessThan(1e-3);
    });
    expect(registry.setSlotColour("hair", "#ff2497")).toBeGreaterThan(0);
    const want = Color3.FromHexString("#ff2497").toLinearSpace();
    for (const e of registry.select({ slot: "hair" }))
      expect(e.material.albedoColor.equalsWithEpsilon(want, 1e-4)).toBe(true);
    hairMeshes.forEach((m, k) =>
      expect(
        Array.from(m.getVerticesData(VertexBuffer.ColorKind) ?? []),
      ).toEqual(Array.from(colorsBefore[k])),
    );
    expect(registry.setSlotColour("skin", "#bf875f")).toBeGreaterThan(0);
    expect(
      registry.setSlotColour("suit_primary", "#1d2450"),
    ).toBeGreaterThanOrEqual(2);
    expect(
      item.albedoColor.equalsWithEpsilon(
        Color3.FromHexString("#1d2450").toLinearSpace(),
        1e-4,
      ),
    ).toBe(true);
    const fam = (slot: string, part: string) =>
      registry.select({ slot, part })[0];
    expect(fam("suit_primary", "uniform").family).toBe("cloth");
    expect(fam("hair", "hair").material.roughness).toBeCloseTo(
      CREW_FAMILIES.hair.rough,
      5,
    );
    registry.setFamily("suit_primary", "plastic", { part: "uniform" });
    expect(fam("suit_primary", "uniform").material.roughness).toBeCloseTo(
      0.32,
      5,
    );
    registry.unregister("rifle");
    expect(registry.select({ part: "rifle" })).toHaveLength(0);
    body.dispose();
    hair.dispose();
    suit.dispose();
    rifle.dispose();
    scene.dispose();
    engine.dispose();
  });

  it("scales exported strengths once across recolour and repeated presentation while preserving blended alpha", () => {
    const engine = new NullEngine(),
      scene = new Scene(engine);
    for (const strength of [0.7, 3, 6]) {
      const material = new PBRMaterial("crew.emit", scene),
        mesh = CreateBox("emitter", {}, scene);
      material.emissiveIntensity = strength;
      mesh.material = material;
      const registry = studyMaterials([material], { emit: "#ff2471" });
      for (let i = 0; i < 4; i++) {
        registry.setPalette({ emit: "#40c0f0" });
        toneCrewEmissive([mesh]);
      }
      expect(material.emissiveIntensity).toBeCloseTo(
        strength * STUDY_EMISSIVE_SCALE,
        6,
      );
      expect(material.metadata.studyExportedEmissiveStrength).toBe(strength);
    }
    const glass = new PBRMaterial("crew.glass", scene);
    glass.alpha = 0.35;
    glass.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND;
    studyMaterials([glass], { glass: "#2468ff" });
    expect(glass.alpha).toBe(0.35);
    expect(glass.needAlphaBlending()).toBe(true);
    scene.dispose();
    engine.dispose();
  });
});
