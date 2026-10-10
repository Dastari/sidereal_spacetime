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
  crewStudyPartFile,
  crewStudyUrl,
} from "@sidereal/content/crew-study";
import { createVoxelCrewVisual } from "./voxel-crew";
import { createStudyCrewOutfit } from "./crew-study-outfit";
import { createVoxelItemVisual } from "../equipment/voxel-items";
import { WALK_SPEED_MPS } from "@sidereal/sim";
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
        const file = decodeURIComponent(
          url.split(`/${CREW_STUDY.revision}/`)[1],
        );
        return SceneLoader.LoadAssetContainerAsync(
          "",
          bytes(file),
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
        const file = decodeURIComponent(
          url.split(`/${CREW_STUDY.revision}/`)[1],
        );
        return SceneLoader.LoadAssetContainerAsync(
          "",
          bytes(file),
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
          bytes(decodeURIComponent(url.split(`/${CREW_STUDY.revision}/`)[1])),
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
        const file = decodeURIComponent(
          url.split(`/${CREW_STUDY.revision}/`)[1],
        );
        const container = await SceneLoader.LoadAssetContainerAsync(
          "",
          bytes(file),
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
        const file = decodeURIComponent(
          url.split(`/${CREW_STUDY.revision}/`)[1],
        );
        loaded.push(file);
        return SceneLoader.LoadAssetContainerAsync(
          "",
          bytes(file),
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
        const file = decodeURIComponent(
          url.split(`/${CREW_STUDY.revision}/`)[1],
        );
        loaded.push(file);
        return SceneLoader.LoadAssetContainerAsync(
          "",
          bytes(file),
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
