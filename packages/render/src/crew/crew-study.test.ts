import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { inflateSync } from "node:zlib";
import { describe, expect, it, vi } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { SceneLoader } from "@babylonjs/core/Loading/sceneLoader";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import {
  CREW_STUDY,
  CREW_STUDY_SCALE,
  crewStudyEquipment,
  crewStudyHair,
  crewStudyPartFile,
  crewStudyUrl,
} from "@sidereal/content/crew-study";
import { createVoxelCrewVisual } from "./voxel-crew";
import { createStudyCrewOutfit } from "./crew-study-outfit";
import { studyCrewPalette } from "./crew-study-materials";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { createVoxelItemVisual } from "../equipment/voxel-items";
import { WALK_SPEED_MPS } from "@sidereal/sim";
import { GlowLayer } from "@babylonjs/core/Layers/glowLayer";
import { createGlowOccluders, setGlowOccludingActors } from "../glow-occluders";
import { createConstructionLighting } from "../construction-instance";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import {
  composeCrewFace,
  decodeCrewFacePng,
  type CrewFaceAtlas,
} from "./crew-study-face";

const base = new URL(
  `../../../../assets/runtime/crew/${CREW_STUDY.revision}/`,
  import.meta.url,
);
const bytes = (file: string) =>
  new Uint8Array(readFileSync(new URL(file.replace(/#/g, "%23"), base)));
const urlBytes = (url: string) =>
  new Uint8Array(
    readFileSync(
      new URL(
        `../../../../assets/runtime/crew/${url.split("/assets/crew/")[1]}`,
        import.meta.url,
      ),
    ),
  );
const load = async () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  scene.activeCamera = new FreeCamera("review", new Vector3(0, 1, -4), scene);
  const crew = await createVoxelCrewVisual(
    scene,
    new TransformNode("ship", scene),
    bytes("crew-body.glb"),
    { faceAtlas: false, studyAnimation: bytes("anim/crew-anims.glb") },
  );
  return { engine, scene, crew };
};
const settle = async (outfit: { readonly pending: number }) => {
  for (let i = 0; i < 200 && outfit.pending; i++)
    await new Promise((resolve) => setTimeout(resolve, 2));
  expect(outfit.pending).toBe(0);
};

describe("immutable provisional crew study", () => {
  it("recolours saved controls on an equipped uniform without loading parts or allocating more materials", async () => {
    const { scene, engine, crew } = await load();
    let loads = 0;
    const outfit = createStudyCrewOutfit(scene, crew, {
      face: false,
      load: (url) => {
        loads++;
        return SceneLoader.LoadAssetContainerAsync(
          "",
          urlBytes(url),
          scene,
          undefined,
          ".glb",
        );
      },
    });
    let appearance = {
      bodyType: "female" as const,
      hairStyle: "scientist" as const,
      equippedComponents: {
        uniform: "wardrobe-uniform-command",
        helmet: "engineer-helmet",
        visor: "engineer-visor",
      },
      suit: "#253450",
      accent: "#506070",
      trim: "#c0d0e0",
      insignia: "#f0c020",
      visor: "#102030",
      light: "#30e0f0",
      skin: "#d09f80",
      hair: "#403020",
      eyes: "#2080d0",
    };
    crew.customize(appearance);
    outfit.apply(appearance);
    await settle(outfit);
    const initialLoads = loads,
      materials = scene.materials.length;
    const slots = {
      suit: ["suit_primary"],
      accent: ["dark"],
      trim: ["suit_secondary", "metal"],
      insignia: ["accent"],
      visor: ["glass", "visor"],
      light: ["emit", "emit_b"],
      skin: ["skin"],
      hair: ["hair"],
      eyes: ["eye"],
    };
    for (const key of Object.keys(slots) as (keyof typeof slots)[]) {
      appearance = { ...appearance, [key]: "#fa2080" };
      crew.customize(appearance);
      outfit.apply(appearance);
      await settle(outfit);
      expect(loads).toBe(initialLoads);
      expect(scene.materials.length).toBe(materials);
      const palette = studyCrewPalette(appearance),
        want = Color3.FromHexString("#fa2080").toLinearSpace();
      for (const slot of slots[key]) expect(palette[slot]).toBe("#fa2080");
      const matching = crew.root
        .getChildMeshes()
        .map((m) => m.material)
        .filter(
          (m): m is PBRMaterial =>
            m instanceof PBRMaterial &&
            slots[key].some((slot) => m.name === `crew.${slot}`),
        );
      // Eye pixels live in the composed face atlas, tested by browser/face composer review.
      if (key !== "eyes") expect(matching.length, key).toBeGreaterThan(0);
      for (const material of matching)
        expect(material.albedoColor.equalsWithEpsilon(want, 1e-5), key).toBe(
          true,
        );
    }
    outfit.dispose();
    scene.dispose();
    engine.dispose();
  });
  it("uses groom role defaults without replacing saved personal hair and reuses standing files in every state", () => {
    expect(crewStudyHair("scientist", false)).toBe("groom.fluffy_curls");
    expect(crewStudyHair("scientist", true)).toBe("groom.twin_puffs");
    expect(crewStudyHair("cropped", true, "marine")).toBe("groom.twin_tails");
    expect(crewStudyHair("bob", true)).toBe("hair.short_bob");
    expect(crewStudyHair("none", true, "marine")).toBeUndefined();
    for (const id of Object.keys(CREW_STUDY.parts).filter((id) =>
      id.startsWith("groom."),
    ))
      for (const female of [false, true])
        for (const mode of ["full", "cap", "fringe"]) {
          const stand = crewStudyPartFile(id, female, mode)!;
          expect(crewStudyPartFile(id, female, mode, "seated")).toEqual(stand);
          expect(crewStudyPartFile(id, female, mode, "lying")).toEqual(stand);
          const glb = Buffer.from(bytes(stand.file));
          const json = JSON.parse(
            glb.subarray(20, 20 + glb.readUInt32LE(12)).toString(),
          );
          if (mode === "full")
            expect(
              json.meshes.some(
                (mesh: {
                  primitives: { attributes: Record<string, number> }[];
                }) =>
                  mesh.primitives.some(
                    (primitive) => "_GROOM_CLUMP" in primitive.attributes,
                  ),
              ),
            ).toBe(true);
        }
  });

  it("preserves the scientist's blended blue lenses and opaque rounded frame in glow and shadow passes", async () => {
    const { scene, engine, crew } = await load();
    const glow = new GlowLayer("review", scene, { excludeByDefault: true });
    const occlusion = createGlowOccluders(glow);
    occlusion.set(crew.root.getChildMeshes());
    const lighting = createConstructionLighting(scene, []);
    for (const female of [false, true]) {
      const id = crewStudyEquipment(
        "visor",
        "engineer-visor",
        female,
        "scientist",
      )!.id;
      expect(id).toBe(female ? "visor.glasses" : "visor.glasses_blue");
      const file = crewStudyPartFile(id, female)!;
      const container = await SceneLoader.LoadAssetContainerAsync(
        "",
        bytes(file.file),
        scene,
        undefined,
        ".glb",
      );
      const detach = crew.attachPart(container);
      const lenses = container.meshes.filter((mesh) =>
        mesh.material?.name.startsWith("crew.glass"),
      );
      // The female rounded export contains only an opaque frame, no lens geometry.
      expect(lenses.length).toBe(female ? 0 : 1);
      if (female)
        expect(container.materials.every((m) => m.alpha === 1)).toBe(true);
      setGlowOccludingActors(scene, lenses);
      lighting.addActor(lenses);
      for (const lens of lenses) {
        expect(lens.material!.alpha).toBeCloseTo(0.35);
        expect(lens.material!.needAlphaBlending()).toBe(true);
        expect(glow.hasMesh(lens)).toBe(false);
      }
      // Babylon's shadow render skips its transparent queue with this default.
      const shadow = lighting.primaryLight.getShadowGenerator()!;
      expect(shadow).toBeInstanceOf(ShadowGenerator);
      expect((shadow as ShadowGenerator).transparencyShadow).toBe(false);
      detach();
    }
    occlusion.dispose();
    scene.dispose();
    engine.dispose();
  });

  it("attaches groom defaults to both scientist bodies and the female marine while a saved hairstyle wins", async () => {
    const { scene, engine, crew } = await load();
    const outfit = createStudyCrewOutfit(scene, crew, {
      face: false,
      load: (url) =>
        SceneLoader.LoadAssetContainerAsync(
          "",
          urlBytes(url),
          scene,
          undefined,
          ".glb",
        ),
    });
    for (const bodyType of ["male", "female"] as const) {
      const appearance = {
        bodyType,
        equippedComponents: {
          chest: "scientist-chest",
          visor: "engineer-visor",
        },
      };
      crew.customize(appearance);
      outfit.apply(appearance);
      await settle(outfit);
      expect(
        crew.root
          .getChildMeshes()
          .some((m) =>
            m.name.includes(
              bodyType === "female" ? "groom.twin_puffs" : "groom.fluffy_curls",
            ),
          ),
      ).toBe(true);
    }
    const marine = {
      bodyType: "female" as const,
      equippedComponents: { chest: "marine-chest" },
    };
    crew.customize(marine);
    outfit.apply(marine);
    await settle(outfit);
    expect(
      crew.root
        .getChildMeshes()
        .some((m) => m.name.includes("groom.twin_tails")),
    ).toBe(true);
    outfit.apply({ ...marine, hairStyle: "bob" });
    await settle(outfit);
    expect(
      crew.root
        .getChildMeshes()
        .some((m) => m.name.includes("groom.twin_tails")),
    ).toBe(false);
    expect(
      crew.root.getChildMeshes().some((m) => m.name.includes("hair.short_bob")),
    ).toBe(true);
    outfit.dispose();
    scene.dispose();
    engine.dispose();
  });
  it("pins every selected export, including hair filename fragments, without mixed source revisions", () => {
    const snapshot = JSON.parse(
      readFileSync(new URL("source-snapshot.json", base), "utf8"),
    );
    expect(snapshot.sourceCommit).toBe(CREW_STUDY.sourceCommit);
    expect(snapshot.runtimeCrewScale).toBe(0.9);
    expect(Object.keys(CREW_STUDY.parts)).toHaveLength(118);
    expect(CREW_STUDY.parts["groom.fluffy_curls"]).toBeDefined();
    expect(CREW_STUDY.parts["groom.twin_puffs"]).toBeDefined();
    expect(CREW_STUDY.parts["groom.twin_tails"]).toBeDefined();
    expect(CREW_STUDY.parts["groom.high_ponytail"]).toBeDefined();
    for (const [file, record] of Object.entries(snapshot.files) as [
      string,
      { sha256: string; bytes: number },
    ][]) {
      const data = bytes(file);
      expect(data.length, file).toBe(record.bytes);
      expect(createHash("sha256").update(data).digest("hex"), file).toBe(
        record.sha256,
      );
    }
    expect(
      crewStudyUrl(crewStudyPartFile("hair.long_wavy", true)!.file),
    ).toContain("%23full.glb");
    expect(crewStudyEquipment("boots", "wardrobe-t2-chest")).toBeUndefined();
    expect(crewStudyEquipment("chest", "unknown")).toBeUndefined();
  });

  it("retargets source clips lazily onto 32 joints and scales body/socket/stride once for both bodies", async () => {
    const { scene, engine, crew } = await load();
    expect(crew.skeleton?.bones).toHaveLength(32);
    expect(crew.model.scaling.asArray()).toEqual([0.9, 0.9, 0.9]);
    expect(crew.hasClip("ZeroG_Flight")).toBe(true);
    expect(crew.hasClip("rifle.aim")).toBe(true);
    expect(
      scene.animationGroups.filter((group) => group.name === "pilot_rest_idle"),
    ).toHaveLength(0);
    crew.prepareClip("pilot_rest_idle");
    expect(
      scene.animationGroups.filter((group) => group.name === "pilot_rest_idle"),
    ).toHaveLength(1);
    crew.prepareClip("pilot_rest_idle");
    expect(
      scene.animationGroups.filter((group) => group.name === "pilot_rest_idle"),
    ).toHaveLength(1);
    for (const bodyType of ["male", "female"] as const) {
      crew.customize({
        bodyType,
        equippedComponents: {},
        hairStyle: "none",
        weapon: "none",
      });
      expect(
        crew.root
          .getChildMeshes()
          .filter((m) => m.isEnabled() && /GEO-crew-head_low/.test(m.name)),
      ).toHaveLength(0);
      expect(
        crew.root
          .getChildMeshes()
          .filter((m) => m.isEnabled() && /GEO-crew-head-/.test(m.name))
          .every((m) => m.name.includes(bodyType)),
      ).toBe(true);
      crew.update({ moving: true, seated: false });
      const walking = scene.animationGroups.find(
        (g) => g.name === "walk" && g.isPlaying,
      )!;
      expect(walking.speedRatio).toBeCloseTo(
        WALK_SPEED_MPS / 1.791 / CREW_STUDY_SCALE,
        3,
      );
    }
    const socket = crew.socketNodes["socket.head"]
      .computeWorldMatrix(true)
      .getTranslation();
    expect(socket.y).toBeLessThan(1.8);
    expect(crew.joints.get("prop.R")).toBeDefined();
    scene.dispose();
    engine.dispose();
  });

  it("uses source coverage only after actual parts load, and substitutes a single low scalp", async () => {
    const { scene, engine, crew } = await load();
    const outfit = createStudyCrewOutfit(scene, crew, {
      face: false,
      load: (url) => {
        return SceneLoader.LoadAssetContainerAsync(
          "",
          urlBytes(url),
          scene,
          undefined,
          ".glb",
        );
      },
    });
    crew.customize({
      bodyType: "female",
      equippedComponents: {},
      hairStyle: "scientist",
    });
    outfit.apply({
      bodyType: "female",
      equippedComponents: {},
      hairStyle: "scientist",
    });
    await settle(outfit);
    expect(
      crew.root
        .getChildMeshes()
        .some((m) => m.isEnabled() && /GEO-crew-head_low-female/.test(m.name)),
    ).toBe(true);
    expect(
      crew.root
        .getChildMeshes()
        .some((m) => m.isEnabled() && /GEO-crew-head-female/.test(m.name)),
    ).toBe(false);
    outfit.apply({
      bodyType: "female",
      hairStyle: "scientist",
      equippedComponents: {
        helmet: "wardrobe-suit-helmet",
        uniform: "wardrobe-uniform-medical",
        gloves: "wardrobe-t2-gloves",
      },
    });
    await settle(outfit);
    expect(outfit.armour.helmet).toBe("headwear.eva_helmet");
    expect(
      crew.root
        .getChildMeshes()
        .filter(
          (m) =>
            m.isEnabled() &&
            /GEO-crew-(head|head_low|hands)-female/.test(m.name),
        ),
    ).toHaveLength(0);
    outfit.apply({
      bodyType: "female",
      hairStyle: "none",
      equippedComponents: {},
    });
    await settle(outfit);
    expect(
      crew.root
        .getChildMeshes()
        .some((m) => m.isEnabled() && /GEO-crew-base-female/.test(m.name)),
    ).toBe(true);
    expect(
      crew.root
        .getChildMeshes()
        .some((m) => m.isEnabled() && /GEO-crew-head-female/.test(m.name)),
    ).toBe(true);
    outfit.dispose();
    scene.dispose();
    engine.dispose();
  });

  it("assembles both T3 fits from existing equipment with authored regional underlayers", async () => {
    const { scene, engine, crew } = await load();
    const outfit = createStudyCrewOutfit(scene, crew, {
      face: false,
      load: (url) => {
        return SceneLoader.LoadAssetContainerAsync(
          "",
          urlBytes(url),
          scene,
          undefined,
          ".glb",
        );
      },
    });
    for (const bodyType of ["male", "female"] as const) {
      const equippedComponents = {
        chest: "crew-marine-chest",
        helmet: "crew-marine-helmet",
        legs: "crew-marine-legs",
        back: "crew-marine-back",
      };
      crew.customize({ bodyType, hairStyle: "none", equippedComponents });
      outfit.apply({ bodyType, hairStyle: "none", equippedComponents });
      await settle(outfit);
      expect(outfit.armour.chest).toBe("armor.chest.t3");
      expect(outfit.armour.helmet).toBe("armor.helmet.t3");
      expect(outfit.armour.back).toBe("armor.back.t3");
      expect(
        crew.root
          .getChildMeshes()
          .some((mesh) => mesh.isEnabled() && /GEO-crew-head/.test(mesh.name)),
      ).toBe(false);
      expect(
        crew.root
          .getChildMeshes()
          .some(
            (mesh) =>
              mesh.isEnabled() &&
              mesh.name.includes(
                `GEO-uniform.marine-${bodyType === "female" ? "narrow" : "wide"}`,
              ),
          ),
      ).toBe(true);
    }
    outfit.dispose();
    scene.dispose();
    engine.dispose();
  });

  it("includes sealed gloves in the EVA body item's presentation for both fits, without granting them to pilot clothing", async () => {
    const { scene, engine, crew } = await load();
    const outfit = createStudyCrewOutfit(scene, crew, {
      face: false,
      load: (url) =>
        SceneLoader.LoadAssetContainerAsync(
          "",
          urlBytes(url),
          scene,
          undefined,
          ".glb",
        ),
    });
    for (const bodyType of ["male", "female"] as const) {
      const look = {
        bodyType,
        hairStyle: "none" as const,
        equippedComponents: {
          uniform: "wardrobe-suit-body",
          helmet: "wardrobe-suit-helmet",
          back: "wardrobe-suit-pack",
          boots: "wardrobe-suit-boots",
        },
      };
      crew.customize(look);
      outfit.apply(look);
      await settle(outfit);
      expect(outfit.armour.uniform).toBe("uniform.pilot");
      expect(outfit.armour.gloves).toBe("gloves.flight");
      expect(
        crew.root
          .getChildMeshes()
          .some(
            (mesh) =>
              mesh.isEnabled() &&
              mesh.name.includes(
                `GEO-gloves.flight-${bodyType === "female" ? "narrow" : "wide"}`,
              ),
          ),
      ).toBe(true);
      expect(
        crew.root
          .getChildMeshes()
          .some(
            (mesh) =>
              mesh.isEnabled() && mesh.name === `GEO-crew-hands-${bodyType}`,
          ),
      ).toBe(false);
      outfit.apply({
        bodyType,
        hairStyle: "none",
        equippedComponents: {
          chest: "crew-pilot-chest",
          legs: "crew-pilot-legs",
        },
      });
      await settle(outfit);
      expect(outfit.armour.gloves).toBeUndefined();
      expect(
        crew.root
          .getChildMeshes()
          .some(
            (mesh) =>
              mesh.isEnabled() && mesh.name === `GEO-crew-hands-${bodyType}`,
          ),
      ).toBe(true);
    }
    outfit.dispose();
    scene.dispose();
    engine.dispose();
  });

  it("decodes straight-alpha source faces and preserves age/marks layer differences", async () => {
    const atlas = JSON.parse(
      readFileSync(new URL("face/face-f_classic.json", base), "utf8"),
    ) as CrewFaceAtlas;
    const image = await decodeCrewFacePng(
      bytes("face/face-f_classic.png"),
      (data) => inflateSync(data),
    );
    expect(image.height).toBe(atlas.layers.length * 16);
    const neutral = composeCrewFace(atlas, image, { expression: "neutral" });
    expect(
      composeCrewFace(atlas, image, { expression: "neutral", age: "older" }),
    ).not.toEqual(neutral);
    expect(composeCrewFace(atlas, image, { expression: "happy" })).not.toEqual(
      neutral,
    );
    expect(
      composeCrewFace(atlas, image, {
        expression: "neutral",
        blinkEyes: "closed",
      }),
    ).not.toEqual(neutral);
  });

  it("attaches a real asymmetric weapon to prop.R without reflecting it a second time", async () => {
    const { scene, engine, crew } = await load();
    const prop = crew.joints.get("prop.R")!;
    const item = await createVoxelItemVisual(scene, prop, "rifle", {
      study: true,
      source: bytes("items/rifle.glb"),
    });
    const itemMesh = item.root
      .getChildMeshes()
      .find((mesh) => mesh.getTotalVertices())!;
    expect(Math.sign(itemMesh.computeWorldMatrix(true).determinant())).toBe(
      Math.sign(prop.computeWorldMatrix(true).determinant()),
    );
    const muzzle = item.getMuzzleWorld()!;
    expect(
      Vector3.Distance(muzzle.position, prop.getAbsolutePosition()),
    ).toBeCloseTo(Math.hypot(0.26875, 0.7734375) * 0.9, 4);
    expect(muzzle.direction.length()).toBeCloseTo(1);
    item.dispose();
    scene.dispose();
    engine.dispose();
  });

  it("discards a stale helmet load without hiding the new bare body", async () => {
    const { scene, engine, crew } = await load();
    let resolve!: (
      value: Awaited<ReturnType<typeof SceneLoader.LoadAssetContainerAsync>>,
    ) => void;
    const deferred = new Promise<
      Awaited<ReturnType<typeof SceneLoader.LoadAssetContainerAsync>>
    >((done) => {
      resolve = done;
    });
    const outfit = createStudyCrewOutfit(scene, crew, {
      face: false,
      load: () => deferred,
    });
    outfit.apply({
      hairStyle: "none",
      equippedComponents: { helmet: "wardrobe-suit-helmet" },
    });
    outfit.apply({ hairStyle: "none", equippedComponents: {} });
    resolve(
      await SceneLoader.LoadAssetContainerAsync(
        "",
        bytes("parts/headwear/headwear.eva_helmet@all.glb"),
        scene,
        undefined,
        ".glb",
      ),
    );
    await settle(outfit);
    expect(outfit.armour).toEqual({});
    expect(
      crew.root
        .getChildMeshes()
        .some(
          (mesh) => mesh.isEnabled() && /GEO-crew-head-male/.test(mesh.name),
        ),
    ).toBe(true);
    outfit.dispose();
    scene.dispose();
    engine.dispose();
  });

  it("retains visible base fallback when a requested helmet rejects or has an incompatible rig", async () => {
    const { scene, engine, crew } = await load();
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    let reject = false;
    const outfit = createStudyCrewOutfit(scene, crew, {
      face: false,
      load: async (url) => {
        if (reject) throw new Error("Unavailable export");
        const file = decodeURIComponent(url.split("/assets/crew/")[1]);
        const container = await SceneLoader.LoadAssetContainerAsync(
          "",
          urlBytes(url),
          scene,
          undefined,
          ".glb",
        );
        container.skeletons[0].bones.pop();
        return container;
      },
    });
    for (const helmet of ["wardrobe-suit-helmet", "crew-marine-helmet"]) {
      outfit.apply({ hairStyle: "none", equippedComponents: { helmet } });
      await settle(outfit);
      expect(outfit.armour).toEqual({});
      expect(
        crew.root
          .getChildMeshes()
          .some(
            (mesh) => mesh.isEnabled() && /GEO-crew-head-male/.test(mesh.name),
          ),
      ).toBe(true);
      reject = true;
    }
    expect(warning).toHaveBeenCalledTimes(2);
    warning.mockRestore();
    outfit.dispose();
    scene.dispose();
    engine.dispose();
  });

  it("stows the same equipped back mesh while seated, including late loads, and restores it without reloading", async () => {
    const { scene, engine, crew } = await load();
    const loaded: string[] = [];
    const outfit = createStudyCrewOutfit(scene, crew, {
      face: false,
      load: (url) => {
        const file = decodeURIComponent(url.split("/assets/crew/")[1]);
        loaded.push(file.split("/").slice(1).join("/"));
        return SceneLoader.LoadAssetContainerAsync(
          "",
          urlBytes(url),
          scene,
          undefined,
          ".glb",
        );
      },
    });
    const appearance = {
      hairStyle: "none" as const,
      equippedComponents: { back: "crew-marine-back" },
    };
    crew.update({ moving: false, seated: true });
    scene.render();
    outfit.apply(appearance);
    await settle(outfit);
    const back = crew.root
      .getChildMeshes()
      .filter((mesh) => /GEO-armor.back.t3/.test(mesh.name));
    expect(back.length).toBeGreaterThan(0);
    expect(back.every((mesh) => !mesh.isEnabled())).toBe(true);
    expect(outfit.armour.back).toBe("armor.back.t3");
    expect(appearance.equippedComponents.back).toBe("crew-marine-back");
    crew.update({ moving: false, seated: false });
    scene.render();
    expect(back.every((mesh) => mesh.isEnabled())).toBe(true);
    crew.update({ moving: false, seated: true });
    scene.render();
    expect(back.every((mesh) => !mesh.isEnabled())).toBe(true);
    expect(loaded).toHaveLength(1);
    outfit.dispose();
    scene.dispose();
    engine.dispose();
  });

  it("keeps study walking ankles on the scaled deck, loads seated hair lazily, then returns to EVA", async () => {
    const { scene, engine, crew } = await load();
    engine.getDeltaTime = () => 16;
    scene.useConstantAnimationDeltaTime = true;
    const loaded: string[] = [];
    const outfit = createStudyCrewOutfit(scene, crew, {
      face: false,
      load: (url) => {
        const file = decodeURIComponent(url.split("/assets/crew/")[1]);
        loaded.push(file.split("/").slice(1).join("/"));
        return SceneLoader.LoadAssetContainerAsync(
          "",
          urlBytes(url),
          scene,
          undefined,
          ".glb",
        );
      },
    });
    crew.customize({
      bodyType: "female",
      hairStyle: "ponytail",
      equippedComponents: {},
      weapon: "none",
    });
    outfit.apply({
      bodyType: "female",
      hairStyle: "ponytail",
      equippedComponents: {},
    });
    await settle(outfit);
    crew.update({ moving: true, seated: false });
    let lowest = Infinity;
    for (let i = 0; i < 120; i++) {
      crew.root.position.z -= WALK_SPEED_MPS * 0.016;
      scene.render();
      for (const side of ["L", "R"])
        lowest = Math.min(
          lowest,
          crew.joints
            .get(`foot.${side}`)!
            .computeWorldMatrix(true)
            .getTranslation().y,
        );
    }
    expect(lowest).toBeGreaterThanOrEqual((3 / 32) * 0.9 - 0.002);
    expect(loaded).toHaveLength(1);
    crew.update({ moving: false, seated: true });
    for (let i = 0; i < 30; i++) scene.render();
    await settle(outfit);
    expect(outfit.hairState).toBe("seated");
    expect(loaded.some((file) => file.includes("@seated.glb"))).toBe(true);
    crew.update({
      moving: false,
      seated: false,
      eva: {
        phase: "free",
        forward: 1,
        strafe: 0,
        turn: 0,
        walking: false,
        cycling: false,
      },
    });
    for (let i = 0; i < 30; i++) scene.render();
    await settle(outfit);
    expect(outfit.hairState).toBe("stand");
    expect(crew.activeClips.some((clip) => clip.startsWith("ZeroG_"))).toBe(
      true,
    );
    outfit.dispose();
    scene.dispose();
    engine.dispose();
  });
});

it("resolves every explicit study hairstyle unchanged for either body, mode and state, while invalid ids fail", () => {
  const ids = Object.keys(CREW_STUDY.parts).filter((id) =>
    /^(hair|groom)\./.test(id),
  );
  expect(ids).toHaveLength(29);
  for (const female of [false, true])
    for (const id of ids) {
      expect(crewStudyHair(id, female, "scientist")).toBe(id);
      for (const mode of ["full", "cap", "fringe"])
        for (const state of ["stand", "sit", "lie"]) {
          const part = crewStudyPartFile(id, female, mode, state)!;
          expect(part, `${id}/${female}/${mode}/${state}`).toBeDefined();
          expect(bytes(part.file).length).toBeGreaterThan(0);
        }
    }
  for (const [alias, male, female] of [
    ["swept", "hair.swept", "hair.long_wavy"],
    ["cropped", "hair.crop", "hair.short_bob"],
    ["crest", "hair.crest", "hair.pixie"],
    ["scientist", "groom.fluffy_curls", "groom.twin_puffs"],
    ["bob", "hair.short_bob", "hair.short_bob"],
    ["ponytail", "hair.high_ponytail", "hair.long_ponytail"],
    ["bun", "hair.bun", "hair.bun"],
    ["braids", "hair.braids", "hair.braids"],
  ]) {
    expect(crewStudyHair(alias, false)).toBe(male);
    expect(crewStudyHair(alias, true)).toBe(female);
  }
  expect(crewStudyHair("none", false)).toBeUndefined();
  expect(crewStudyHair("none", true)).toBeUndefined();
  for (const invalid of [
    "hair.missing",
    "groom.missing",
    "bad",
    "constructor",
    "toString",
  ])
    expect(() => crewStudyHair(invalid, false, "scientist")).toThrow(
      "Unknown crew hairstyle",
    );
});

it("all 29 saved hairstyles hide under a full equipped helmet and return unchanged for both bodies", async () => {
  const { scene, engine, crew } = await load();
  const outfit = createStudyCrewOutfit(scene, crew, {
    face: false,
    load: (url) =>
      SceneLoader.LoadAssetContainerAsync(
        "",
        urlBytes(url),
        scene,
        undefined,
        ".glb",
      ),
  });
  for (const bodyType of ["male", "female"] as const) {
    const ids = Object.keys(CREW_STUDY.parts).filter((id) =>
      /^(hair|groom)\./.test(id),
    );
    for (const hairStyle of ids) {
      const saved = {
        bodyType,
        hairStyle: hairStyle as never,
        equippedComponents: {},
      };
      crew.customize(saved);
      outfit.apply(saved);
      await settle(outfit);
      expect(
        crew.root
          .getChildMeshes()
          .some((mesh) => mesh.name.includes(hairStyle) && mesh.isEnabled()),
      ).toBe(true);
      outfit.apply({
        ...saved,
        equippedComponents: { helmet: "wardrobe-suit-helmet" },
      });
      await settle(outfit);

      expect(
        crew.root
          .getChildMeshes()
          .filter(
            (mesh) => /GEO-(hair|groom)\./.test(mesh.name) && mesh.isEnabled(),
          ),
      ).toHaveLength(0);
      outfit.apply(saved);
      await settle(outfit);
      expect(
        crew.root
          .getChildMeshes()
          .some((mesh) => mesh.name.includes(hairStyle) && mesh.isEnabled()),
      ).toBe(true);
      expect(saved.hairStyle).toBe(hairStyle);
    }
    for (const facialHair of [
      "stubble",
      "short",
      "full",
      "goatee",
      "moustache",
      "handlebar",
      "sideburns",
      "chin_strap",
      "soul_patch",
    ] as const) {
      outfit.apply({
        bodyType,
        hairStyle: "none",
        facialHair,
        equippedComponents: {},
      });
      await settle(outfit);
      expect(
        crew.root
          .getChildMeshes()
          .some(
            (mesh) =>
              mesh.name.includes(`facial.${facialHair}`) && mesh.isEnabled(),
          ),
      ).toBe(true);
    }
  }
  outfit.dispose();
  scene.dispose();
  engine.dispose();
}, 30000);
