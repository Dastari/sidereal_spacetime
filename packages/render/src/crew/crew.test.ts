import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { SceneLoader } from "@babylonjs/core/Loading/sceneLoader";
import { Scene } from "@babylonjs/core/scene";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { createCrewVisual } from "./index";

const asset = () =>
  new Uint8Array(
    readFileSync(
      new URL(
        "../../../../assets/runtime/crew/frontier-crew.glb",
        import.meta.url,
      ),
    ),
  );

describe("original crew skeletal visual", () => {
  it("places the imported carbine support grip inside the left palm", async () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const crew = await createCrewVisual(
      scene,
      new TransformNode("ship", scene),
      asset(),
    );
    crew.customize({ outfit: "marine", weapon: "rifle", weaponFixture: false });
    crew.update({ moving: false, seated: false, reducedMotion: true });
    const equipment = await SceneLoader.LoadAssetContainerAsync(
      "",
      new Uint8Array(
        readFileSync(
          new URL(
            "../../../../assets/runtime/equipment/carbine.glb",
            import.meta.url,
          ),
        ),
      ),
      scene,
      undefined,
      ".glb",
    );
    equipment.addAllToScene();
    for (const root of equipment.rootNodes) root.parent = crew.sockets.handR;
    for (const node of scene.transformNodes) node.computeWorldMatrix(true);
    const support = Vector3.TransformCoordinates(
      new Vector3(0, 0, -0.23),
      equipment.rootNodes[0].getWorldMatrix(),
    );
    expect(
      Vector3.Distance(support, crew.sockets.handL.getAbsolutePosition()),
    ).toBeLessThan(0.01);
    scene.dispose();
    engine.dispose();
  });

  it("loads weighted geometry and clips, animates limbs without moving gameplay placement, and disposes owned resources", async () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    scene.useRightHandedSystem = true;
    const parent = new TransformNode("ship-frame", scene);
    const crew = await createCrewVisual(scene, parent, asset());
    expect(scene.skeletons).toHaveLength(1);
    expect(scene.skeletons[0].bones.length).toBe(16);
    expect(
      scene.meshes.filter((mesh) => mesh.skeleton && mesh.isEnabled()).length,
    ).toBeLessThanOrEqual(24);
    expect(scene.animationGroups.map((group) => group.name).sort()).toEqual(
      ["Idle", "Walk", "Sprint", "Seated"]
        .flatMap((gait) => [gait, `${gait}-Pistol`, `${gait}-Rifle`])
        .sort(),
    );
    crew.root.position.set(4, 0, -2);
    crew.update({ moving: true, seated: false });
    expect(
      scene.animationGroups.find((group) => group.name === "Idle")!.isPlaying,
    ).toBe(true);
    vi.spyOn(engine, "getDeltaTime").mockReturnValue(100);
    scene.onBeforeRenderObservable.notifyObservers(scene);
    scene.onBeforeRenderObservable.notifyObservers(scene);
    expect(
      scene.animationGroups.find((group) => group.name === "Idle")!.isPlaying,
    ).toBe(false);
    const walk = scene.animationGroups.find((group) => group.name === "Walk")!;
    const thigh = scene.getTransformNodeByName("thigh.L")!;
    walk.goToFrame(walk.from);
    const before = thigh.rotationQuaternion!.clone();
    walk.goToFrame(walk.from + (walk.to - walk.from) / 4);
    expect(thigh.rotationQuaternion!.equalsWithEpsilon(before)).toBe(false);
    expect(crew.root.position.asArray()).toEqual([4, 0, -2]);
    crew.update({ moving: false, seated: true, reducedMotion: true });
    expect(
      scene.animationGroups.find((group) => group.name === "Seated")!.isPlaying,
    ).toBe(false);
    crew.dispose();
    crew.dispose();
    expect(scene.meshes).toHaveLength(0);
    expect(scene.skeletons).toHaveLength(0);
    expect(scene.animationGroups).toHaveLength(0);
    expect(parent.isDisposed()).toBe(false);
    scene.dispose();
    engine.dispose();
  });

  it("supports open/closed helmet, hair, backpack and per-instance material colors", async () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const parent = new TransformNode("ship-frame", scene);
    const crew = await createCrewVisual(scene, parent, asset());
    const mesh = (name: string) =>
      scene.meshes.find((mesh) => mesh.name.startsWith(name))!;
    crew.customize({ outfit: "crew" });
    expect(mesh("GEO-hair-swept").isEnabled()).toBe(true);
    expect(mesh("GEO-helmet-standard").isEnabled()).toBe(false);
    crew.customize({ helmet: "open", backpack: false, suit: "#e04a20" });
    expect(mesh("GEO-hair-swept").isEnabled()).toBe(false);
    expect(mesh("GEO-helmet-standard").isEnabled()).toBe(true);
    expect(mesh("GEO-visor-standard").isEnabled()).toBe(false);
    expect(mesh("GEO-backpack-utility").isEnabled()).toBe(false);
    const suit = scene.getMaterialByName("crew.suit") as PBRMaterial;
    expect(suit.albedoColor.r).toBeGreaterThan(suit.albedoColor.b);
    crew.customize({ helmet: "closed" });
    expect(mesh("GEO-visor-standard").isEnabled()).toBe(true);
    crew.customize({ helmet: "none" });
    expect(mesh("GEO-hair-swept").isEnabled()).toBe(true);
    expect(mesh("GEO-visor-standard").isEnabled()).toBe(false);
    crew.dispose();
    scene.dispose();
    engine.dispose();
  });
  it("selects exclusive modular geometry and preserves a posed hand socket for an external prop", async () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const crew = await createCrewVisual(
      scene,
      new TransformNode("ship", scene),
      asset(),
    );
    const visibleSlots = () =>
      new Set(
        scene.meshes
          .filter((m) => m.skeleton && m.isEnabled())
          .map((m) =>
            m.name.replace(/^GEO-/, "").replace(/_primitive\d+$/, ""),
          ),
      );
    for (const [outfit, armor, helmet, pack] of [
      ["engineer", "utility", "engineer", "utility"],
      ["marine", "heavy", "marine", "oxygen"],
      ["explorer", "expedition", "explorer", "field"],
    ] as const) {
      crew.customize({ outfit });
      const slots = visibleSlots();
      expect(slots.has(`armor-${armor}`)).toBe(true);
      expect(slots.has(`helmet-${helmet}`)).toBe(true);
      expect(slots.has(`backpack-${pack}`)).toBe(true);
      expect([...slots].filter((s) => s.startsWith("armor-"))).toHaveLength(1);
      expect([...slots].filter((s) => s.startsWith("helmet-"))).toHaveLength(1);
      expect([...slots].filter((s) => s.startsWith("hair-"))).toHaveLength(0);
      expect([...slots].filter((s) => s.startsWith("weapon-"))).toHaveLength(0);
    }
    crew.customize({
      helmet: "none",
      hairStyle: "crest",
      armor: "none",
      weapon: "rifle",
    });
    expect(visibleSlots().has("hair-crest")).toBe(true);
    expect(visibleSlots().has("weapon-rifle")).toBe(true);
    crew.update({ moving: true, seated: false, sprinting: true });
    expect(
      scene.animationGroups.find((g) => g.name === "Sprint-Rifle")!.isPlaying,
    ).toBe(true);
    const prop = new TransformNode("external-prop", scene);
    prop.parent = crew.sockets.handR;
    expect(crew.sockets.handR.parent!.name).toBe("hand.R");
    expect(crew.sockets.handL.parent!.name).toBe("hand.L");
    crew.customize({ weaponFixture: false });
    expect(visibleSlots().has("weapon-rifle")).toBe(false);
    expect(prop.isEnabled()).toBe(true);
    crew.dispose();
    expect(prop.isDisposed()).toBe(true);
    scene.dispose();
    engine.dispose();
  });

  it("exports a distinct sprint gait and two-handed rifle pose without changing placement", async () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const crew = await createCrewVisual(
      scene,
      new TransformNode("ship", scene),
      asset(),
    );
    crew.root.position.set(2, 0, 3);
    const pose = (
      moving: boolean,
      sprinting: boolean,
      weaponPose: "none" | "one-handed" | "rifle",
    ) => {
      crew.update({
        moving,
        seated: false,
        sprinting,
        weaponPose,
        reducedMotion: true,
      });
      return scene
        .getTransformNodeByName("forearm.L")!
        .rotationQuaternion!.clone();
    };
    const idle = pose(false, false, "none");
    const rifle = pose(false, false, "rifle");
    crew.sockets.handR.computeWorldMatrix(true);
    expect(crew.sockets.handR.getDirection(Vector3.Up()).y).toBeGreaterThan(
      0.99,
    );
    expect(rifle.equalsWithEpsilon(idle)).toBe(false);
    const walk = pose(true, false, "none");
    const sprint = pose(true, true, "none");
    expect(sprint.equalsWithEpsilon(walk)).toBe(false);
    expect(crew.root.position.asArray()).toEqual([2, 0, 3]);
    expect(
      scene.animationGroups.find((g) => g.name === "Sprint")!.isPlaying,
    ).toBe(false);
    crew.dispose();
    scene.dispose();
    engine.dispose();
  });
});

it("knees flex forward with stable supporting ankles in the exported walk clip", async () => {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  scene.useRightHandedSystem = true;
  const crew = await createCrewVisual(
    scene,
    new TransformNode("ship", scene),
    asset(),
  );
  crew.update({ moving: true, seated: false, reducedMotion: true });
  const walk = scene.animationGroups.find((g) => g.name === "Walk")!;
  const leftKnee = scene.getTransformNodeByName("shin.L")!;
  const leftFoot = scene.getTransformNodeByName("foot.L")!;
  const leftHip = scene.getTransformNodeByName("thigh.L")!;
  const samples = [0, 0.25, 0.5, 0.75].map((phase) => {
    walk.goToFrame(walk.from + (walk.to - walk.from) * phase);
    for (const node of scene.transformNodes) node.computeWorldMatrix(true);
    return {
      knee: leftKnee.getAbsolutePosition().clone(),
      ankle: leftFoot.getAbsolutePosition().clone(),
      hip: leftHip.getAbsolutePosition().clone(),
    };
  });
  // At three stance samples ankle stays at the same deck height. Recovery lifts it.
  expect(Math.abs(samples[0].ankle.y - samples[1].ankle.y)).toBeLessThan(0.015);
  expect(Math.abs(samples[0].ankle.y - samples[2].ankle.y)).toBeLessThan(0.015);
  expect(samples[3].ankle.y - samples[0].ankle.y).toBeGreaterThan(0.05);
  // Joint is non-collinear with the hip/ankle: real flexion, not rigid whole-leg swing.
  for (const sample of samples) {
    const a = sample.hip.subtract(sample.knee).normalize(),
      b = sample.ankle.subtract(sample.knee).normalize();
    expect(Vector3.Dot(a, b)).toBeGreaterThan(-0.999);
  }
  crew.dispose();
  scene.dispose();
  engine.dispose();
});

it("weapon changes preserve stride phase and interrupted pose fades stay normalized", async () => {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  const crew = await createCrewVisual(
    scene,
    new TransformNode("ship", scene),
    asset(),
  );
  const deltaTime = vi.spyOn(engine, "getDeltaTime").mockReturnValue(0);
  crew.update({ moving: true, seated: false });
  scene.onBeforeRenderObservable.notifyObservers(scene);
  expect(scene.animationGroups.find((g) => g.name === "Walk")!.isPlaying).toBe(
    true,
  );
  deltaTime.mockReturnValue(50);
  for (let i = 0; i < 4; i++)
    scene.onBeforeRenderObservable.notifyObservers(scene);
  const walk = scene.animationGroups.find((g) => g.name === "Walk")!;
  walk.goToFrame(walk.from + (walk.to - walk.from) * 0.35);
  crew.customize({ weapon: "rifle", weaponFixture: false });
  const rifle = scene.animationGroups.find((g) => g.name === "Walk-Rifle")!;
  expect(
    (rifle.getCurrentFrame() - rifle.from) / (rifle.to - rifle.from),
  ).toBeCloseTo(0.35, 2);
  scene.onBeforeRenderObservable.notifyObservers(scene);
  crew.customize({ weapon: "pistol" });
  scene.onBeforeRenderObservable.notifyObservers(scene);
  crew.customize({ weapon: "none" });
  for (let i = 0; i < 6; i++) {
    scene.onBeforeRenderObservable.notifyObservers(scene);
    const sum = scene.animationGroups.reduce(
      (n, g) => n + (g.animatables[0]?.weight ?? 0),
      0,
    );
    expect(sum).toBeCloseTo(1, 5);
  }
  expect(walk.isPlaying).toBe(true);
  expect(rifle.isPlaying).toBe(false);
  crew.dispose();
  scene.dispose();
  engine.dispose();
});

it("preserves ten distinct looks, optical visor material and selective emission", async () => {
  const { CREW_OUTFITS } = await import("./appearance");
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const crew = await createCrewVisual(
    scene,
    new TransformNode("ship", scene),
    asset(),
  );
  expect(Object.keys(CREW_OUTFITS)).toHaveLength(10);
  const signatures = new Set<string>();
  for (const outfit of Object.keys(CREW_OUTFITS) as Array<
    keyof typeof CREW_OUTFITS
  >) {
    crew.customize({ outfit, weapon: "none" });
    const visible = scene.meshes
      .filter((m) => m.skeleton && m.isEnabled())
      .map((m) => m.name)
      .sort();
    signatures.add(visible.join(","));
    if (outfit === "scientist")
      expect(
        visible.some((name) => name.startsWith("GEO-hair-scientist")),
      ).toBe(true);
    else
      expect(
        visible.some((name) => name.startsWith(`GEO-helmet-${outfit}`)),
      ).toBe(true);
  }
  expect(signatures.size).toBe(10);
  crew.customize({ outfit: "engineer" });
  crew.customize({ outfit: "scientist" });
  const hair = scene.getMaterialByName("crew.hair") as PBRMaterial;
  expect(hair.albedoColor.b).toBeGreaterThan(hair.albedoColor.r);
  crew.customize({ hair: "#FF0000", skin: "#804020" });
  crew.customize({ outfit: "captain" });
  expect(hair.albedoColor.r).toBeCloseTo(1);
  expect(hair.albedoColor.b).toBeCloseTo(0);
  const skin = scene.getMaterialByName("crew.skin") as PBRMaterial;
  expect(skin.albedoColor.r).toBeGreaterThan(skin.albedoColor.g);
  const visor = scene.getMaterialByName("crew.visor") as PBRMaterial;
  expect(visor.alpha).toBeCloseTo(0.82);
  expect(visor.subSurface.isRefractionEnabled).toBe(true);
  const light = scene.getMaterialByName("crew.light") as PBRMaterial;
  crew.customize({ outfit: "recon" });
  expect(light.emissiveColor.g).toBeGreaterThan(light.emissiveColor.r);
  expect(light.emissiveIntensity).toBeCloseTo(1.3);
  crew.customize({ outfit: "marine" });
  expect(light.emissiveColor.r).toBeGreaterThan(light.emissiveColor.g);
  expect(light.emissiveIntensity).toBeCloseTo(1.3);
  crew.dispose();
  scene.dispose();
  engine.dispose();
});

it.each([false, true])(
  "combat aligns actual muzzle and preserves stance (right handed=%s)",
  async (rightHanded) => {
    const { equipmentAimSource } = await import("../equipment/anchors");
    const engine = new NullEngine(),
      scene = new Scene(engine);
    scene.useRightHandedSystem = rightHanded;
    const parent = new TransformNode("ship", scene);
    parent.rotation.y = 0.7;
    const crew = await createCrewVisual(scene, parent, asset());
    crew.customize({ weapon: "rifle", weaponFixture: false });
    const gear = await SceneLoader.LoadAssetContainerAsync(
      "",
      new Uint8Array(
        readFileSync(
          new URL(
            "../../../../assets/runtime/equipment/carbine.glb",
            import.meta.url,
          ),
        ),
      ),
      scene,
      undefined,
      ".glb",
    );
    gear.addAllToScene();
    for (const node of gear.rootNodes) node.parent = crew.sockets.handR;
    const data = JSON.parse(
      readFileSync(
        new URL(
          "../../../../assets/runtime/equipment/manifest.json",
          import.meta.url,
        ),
        "utf8",
      ),
    ).entries.find((e: { file: string }) => e.file === "carbine.glb");
    const aim = equipmentAimSource(
      gear.rootNodes[0] as TransformNode,
      crew.sockets.handR.parent as TransformNode,
      data,
    );
    crew.bindHeldEquipment(aim);
    crew.update({
      moving: false,
      seated: false,
      combat: true,
      reducedMotion: true,
    });
    const foot = scene.getTransformNodeByName("foot.L")!;
    foot.computeWorldMatrix(true);
    const ankle = foot.getAbsolutePosition().clone();
    scene.onAfterAnimationsObservable.notifyObservers(scene);
    const expected = crew.root.getDirection(new Vector3(0, 0, -1)).normalize();
    expect(
      Vector3.Dot(aim.getMuzzleWorld()!.direction, expected),
    ).toBeGreaterThan(0.999);
    foot.computeWorldMatrix(true);
    expect(Vector3.Distance(ankle, foot.getAbsolutePosition())).toBeLessThan(
      0.002,
    );
    const support = Vector3.TransformCoordinates(
      new Vector3(0, 0, -0.23),
      gear.rootNodes[0].getWorldMatrix(),
    );
    crew.sockets.handL.computeWorldMatrix(true);
    expect(
      Vector3.Distance(support, crew.sockets.handL.getAbsolutePosition()),
    ).toBeLessThan(0.035);
    const first = aim.getMuzzleWorld()!.position.clone();
    for (let i = 0; i < 10; i++) {
      scene.onBeforeAnimationsObservable.notifyObservers(scene);
      scene.onAfterAnimationsObservable.notifyObservers(scene);
    }
    expect(
      Vector3.Distance(first, aim.getMuzzleWorld()!.position),
    ).toBeLessThan(0.0001);
    expect(crew.root.position.asArray()).toEqual([0, 0, 0]);
    crew.update({
      moving: false,
      seated: true,
      combat: true,
      reducedMotion: true,
    });
    scene.onAfterAnimationsObservable.notifyObservers(scene);
    expect(
      Vector3.Distance(first, aim.getMuzzleWorld()!.position),
    ).toBeGreaterThan(0.05);
    scene.dispose();
    engine.dispose();
  },
);
