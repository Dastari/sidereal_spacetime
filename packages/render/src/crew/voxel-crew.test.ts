import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { SceneLoader } from "@babylonjs/core/Loading/sceneLoader";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import {
  VOXEL_CREW_ACTIONS,
  VOXEL_CREW_EXTRA_ACTIONS,
  VOXEL_CREW_SOCKETS,
  resolveCrewBundle,
} from "@sidereal/content/crew-voxel-bundle";
import { createVoxelCrewVisual } from "./voxel-crew";
import { selectVoxelCrewLayers, voxelCrewSpeedRatio } from "./voxel-crew-clips";

const asset = () =>
  new Uint8Array(
    readFileSync(new URL("../../../../assets/runtime/crew/voxel/r001/crew-body.glb", import.meta.url)),
  );

const load = async () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const crew = await createVoxelCrewVisual(scene, new TransformNode("ship-frame", scene), asset());
  return { engine, scene, crew };
};

describe("voxel crew bundle selection", () => {
  it("never selects the proposal bundle unless a local preview is enabled", () => {
    expect(resolveCrewBundle({ previewEnabled: false, query: "voxel" })).toBe("legacy");
    expect(resolveCrewBundle({ previewEnabled: true, query: null })).toBe("legacy");
    expect(resolveCrewBundle({ previewEnabled: true, query: "anything" })).toBe("legacy");
    expect(resolveCrewBundle({ previewEnabled: true, query: "voxel" })).toBe("voxel");
  });
});

describe("voxel crew clip mapping", () => {
  it("maps gameplay states onto full-body or layered clips", () => {
    expect(selectVoxelCrewLayers({ moving: false, seated: false }, "none")).toMatchObject({ full: "idle" });
    expect(selectVoxelCrewLayers({ moving: true, seated: false }, "none")).toMatchObject({ full: "walk" });
    expect(selectVoxelCrewLayers({ moving: true, seated: false, sprinting: true }, "none")).toMatchObject({ full: "run" });
    expect(selectVoxelCrewLayers({ moving: false, seated: true }, "rifle")).toMatchObject({ full: "sit_idle" });
    expect(selectVoxelCrewLayers({ moving: false, seated: false, combat: true }, "rifle")).toMatchObject({ full: "aim_rifle" });
    expect(selectVoxelCrewLayers({ moving: false, seated: false }, "rifle")).toMatchObject({ full: "idle_armed" });
    expect(selectVoxelCrewLayers({ moving: false, seated: false, combat: true }, "pistol")).toMatchObject({ full: "aim_pistol" });
    expect(selectVoxelCrewLayers({ moving: true, seated: false, combat: true }, "rifle")).toMatchObject({
      lower: "walk",
      upper: "aim_rifle",
    });
    expect(selectVoxelCrewLayers({ moving: true, seated: false, sprinting: true, combat: true }, "rifle")).toMatchObject({
      lower: "run",
      upper: "idle_armed",
    });
    expect(selectVoxelCrewLayers({ moving: false, seated: false, dead: true }, "rifle")).toMatchObject({ full: "death" });
    expect(selectVoxelCrewLayers({ moving: true, seated: false, carrying: true }, "rifle")).toMatchObject({ full: "carry_walk" });
  });

  it("scales in-place locomotion toward gameplay speed within readable bounds", () => {
    const walk = voxelCrewSpeedRatio("walk", { moving: true, seated: false });
    const run = voxelCrewSpeedRatio("run", { moving: true, seated: false });
    expect(walk).toBeGreaterThan(1);
    expect(walk).toBeLessThanOrEqual(1.6);
    expect(run).toBeGreaterThan(1);
    expect(voxelCrewSpeedRatio("idle", { moving: false, seated: false })).toBe(1);
  });
});

describe("voxel crew runtime", () => {
  it("loads one rig with every authored action, sockets and three body variants", async () => {
    const { engine, scene, crew } = await load();
    expect(scene.skeletons).toHaveLength(1);
    expect(scene.skeletons[0].bones.map((b) => b.name).sort()).toEqual(
      [
        "root", "pelvis", "spine", "chest", "neck", "head",
        ...["shoulder", "upper_arm", "forearm", "hand", "thigh", "shin", "foot", "toe"].flatMap((b) => [`${b}.L`, `${b}.R`]),
      ].sort(),
    );
    const names = new Set(scene.animationGroups.map((g) => g.name));
    for (const action of [...VOXEL_CREW_ACTIONS, ...VOXEL_CREW_EXTRA_ACTIONS]) expect(names.has(action)).toBe(true);
    for (const socket of VOXEL_CREW_SOCKETS) expect(crew.socketNodes[socket]).toBeDefined();
    const bodies = scene.meshes.filter((m) => m.name.startsWith("GEO-crew-body-") && m.isEnabled());
    expect(new Set(bodies.map((m) => m.name.replace(/_primitive\d+$/, "")))).toEqual(new Set(["GEO-crew-body-male"]));
    crew.customize({ bodyType: "female" });
    const female = scene.meshes.filter((m) => m.name.startsWith("GEO-crew-body-") && m.isEnabled());
    expect(new Set(female.map((m) => m.name.replace(/_primitive\d+$/, "")))).toEqual(new Set(["GEO-crew-body-female"]));
    const enabled = (prefix: string) =>
      scene.meshes.some((m) => m.name.startsWith(prefix) && m.isEnabled());
    expect(enabled("GEO-crew-hands-female")).toBe(true);
    crew.setHiddenRegions(["hands", "head"]);
    expect(enabled("GEO-crew-hands-female")).toBe(false);
    expect(enabled("GEO-crew-head-female")).toBe(false);
    expect(enabled("GEO-crew-hair-default-female")).toBe(false);
    expect(enabled("GEO-crew-body-female")).toBe(true);
    crew.setHiddenRegions([]);
    expect(enabled("GEO-crew-hands-female")).toBe(true);
    crew.dispose();
    expect(scene.animationGroups).toHaveLength(0);
    scene.dispose();
    engine.dispose();
  });

  it("stands 1.8 m tall, faces gameplay forward (-Z) and keeps the grip socket in the right hand", async () => {
    const { engine, scene, crew } = await load();
    scene.useRightHandedSystem = false;
    for (const node of scene.transformNodes) node.computeWorldMatrix(true);
    const face = crew.socketNodes["socket.face"].getAbsolutePosition();
    const back = crew.socketNodes["socket.back"].getAbsolutePosition();
    const head = crew.socketNodes["socket.head"].getAbsolutePosition();
    expect(head.y).toBeGreaterThan(1.75);
    expect(head.y).toBeLessThan(1.85);
    expect(face.z).toBeLessThan(back.z); // face is toward -Z
    const grip = crew.socketNodes["socket.hand.R"].getAbsolutePosition();
    const hand = scene.transformNodes.find((n) => n.name === "hand.R")!.getAbsolutePosition();
    expect(Vector3.Distance(grip, hand)).toBeLessThan(0.08);
    crew.dispose();
    scene.dispose();
    engine.dispose();
  });

  it("item sockets hold a -Z-forward item (glTF, CHAR-WEAPONS frame) pointing where the character faces", async () => {
    const { engine, scene, crew } = await load();
    const item = await SceneLoader.LoadAssetContainerAsync(
      "",
      new Uint8Array(readFileSync(new URL("../../../../assets/runtime/equipment/carbine.glb", import.meta.url))),
      scene,
      undefined,
      ".glb",
    );
    item.addAllToScene();
    for (const root of item.rootNodes) root.parent = crew.itemSockets.R;
    for (const node of scene.transformNodes) node.computeWorldMatrix(true);
    for (const mesh of scene.meshes) mesh.computeWorldMatrix(true);
    const gltfRoot = item.rootNodes[0].getChildren()[0] as TransformNode;
    const forward = Vector3.TransformNormal(new Vector3(0, 0, -1), gltfRoot.getWorldMatrix()).normalize();
    const up = Vector3.TransformNormal(new Vector3(0, 1, 0), gltfRoot.getWorldMatrix()).normalize();
    const face = crew.socketNodes["socket.face"].getAbsolutePosition();
    const back = crew.socketNodes["socket.back"].getAbsolutePosition();
    const bodyForward = face.subtract(back);
    bodyForward.y = 0;
    bodyForward.normalize();
    expect(Vector3.Dot(forward, bodyForward)).toBeGreaterThan(0.99);
    expect(up.y).toBeGreaterThan(0.99);
    crew.dispose();
    scene.dispose();
    engine.dispose();
  });

  it("layers a rifle aim over walking and plays one shoot action per accepted shot", async () => {
    const { engine, scene, crew } = await load();
    crew.customize({ weapon: "rifle" });
    crew.update({ moving: true, seated: false, combat: true, shotSequence: 0n });
    expect(crew.layers).toMatchObject({ lower: "walk", upper: "aim_rifle" });
    const playing = () => crew.activeClips;
    expect(playing()).toEqual(["aim_rifle:upper", "walk:lower"]);
    crew.update({ moving: true, seated: false, combat: true, shotSequence: 1n });
    expect(playing()).toContain("shoot_rifle:upper");
    crew.update({ moving: false, seated: true });
    expect(playing()).toContain("sit_idle");
    crew.dispose();
    scene.dispose();
    engine.dispose();
  });

  it("walk swings the legs while the placement root stays put", async () => {
    const { engine, scene, crew } = await load();
    crew.root.position.set(3, 0, -2);
    crew.update({ moving: true, seated: false });
    expect(crew.activeClips).toEqual(["walk"]);
    const walk = scene.animationGroups.find((g) => g.name === "walk")!;
    const thigh = walk.targetedAnimations.find(
      (ta) => (ta.target as { name?: string }).name === "thigh.R" && ta.animation.targetProperty === "rotationQuaternion",
    )!;
    const a = thigh.animation.evaluate(walk.from) as Quaternion;
    const b = thigh.animation.evaluate((walk.from + walk.to) / 2) as Quaternion;
    const angle = 2 * Math.acos(Math.min(1, Math.abs(Quaternion.Dot(a, b))));
    expect(angle).toBeGreaterThan((20 * Math.PI) / 180);
    expect(crew.root.position.asArray()).toEqual([3, 0, -2]);
    crew.dispose();
    scene.dispose();
    engine.dispose();
  });
});
