import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { SceneLoader } from "@babylonjs/core/Loading/sceneLoader";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { inflateSync } from "node:zlib";
import {
  VOXEL_CREW_ACTIONS,
  VOXEL_CREW_EXPRESSION_TRACKS,
  VOXEL_CREW_EXTRA_ACTIONS,
  VOXEL_CREW_NOMINAL_SPEED,
  VOXEL_CREW_REVISION,
  VOXEL_CREW_SOCKETS,
  resolveCrewBundle,
  type VoxelCrewAction,
} from "@sidereal/content/crew-voxel-bundle";
import { composeFace, type FaceAtlas } from "@sidereal/content/crew-voxel-face";
import { createVoxelCrewVisual } from "./voxel-crew";
import { selectVoxelCrewLayers, voxelCrewSpeedRatio } from "./voxel-crew-clips";

const asset = () =>
  new Uint8Array(
    readFileSync(new URL("../../../../assets/runtime/crew/voxel/r004/crew-body.glb", import.meta.url)),
  );

const load = async () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const crew = await createVoxelCrewVisual(scene, new TransformNode("ship-frame", scene), asset(), { faceAtlas: false });
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
    expect(walk).toBeLessThanOrEqual(1.3);
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
    const enabled = (prefix: string) =>
      scene.meshes.some((m) => m.name.startsWith(prefix) && m.isEnabled());
    const suits = scene.meshes.filter((m) => m.name.startsWith("GEO-crew-suit-") && m.isEnabled());
    expect(new Set(suits.map((m) => m.name.replace(/_primitive\d+$/, "")))).toEqual(new Set(["GEO-crew-suit-male"]));
    // default look: suit + gear; the underwear base body and bare hands are replaced
    expect(enabled("GEO-crew-base-male")).toBe(false);
    expect(enabled("GEO-crew-hands-male")).toBe(false);
    expect(enabled("GEO-crew-gear-male")).toBe(true);
    crew.customize({ bodyType: "female" });
    expect(enabled("GEO-crew-suit-female")).toBe(true);
    expect(enabled("GEO-crew-suit-male")).toBe(false);
    // wardrobe base: underwear body + bare hands always available
    crew.setOutfit({ suit: false, gear: false });
    expect(enabled("GEO-crew-base-female")).toBe(true);
    expect(enabled("GEO-crew-hands-female")).toBe(true);
    expect(enabled("GEO-crew-suit-female")).toBe(false);
    expect(enabled("GEO-crew-gear-female")).toBe(false);
    crew.setHiddenRegions(["hands", "head"]);
    expect(enabled("GEO-crew-hands-female")).toBe(false);
    expect(enabled("GEO-crew-head-female")).toBe(false);
    expect(enabled("GEO-crew-hair-default-female")).toBe(false);
    expect(enabled("GEO-crew-base-female")).toBe(true);
    crew.setHiddenRegions([]);
    expect(enabled("GEO-crew-hands-female")).toBe(true);
    crew.dispose();
    expect(scene.animationGroups).toHaveLength(0);
    scene.dispose();
    engine.dispose();
  });

  it("stands 1.8 m tall to the hair, faces gameplay forward (-Z) and keeps the grip socket in the right hand", async () => {
    const { engine, scene, crew } = await load();
    scene.useRightHandedSystem = false;
    for (const node of scene.transformNodes) node.computeWorldMatrix(true);
    const face = crew.socketNodes["socket.face"].getAbsolutePosition();
    const back = crew.socketNodes["socket.back"].getAbsolutePosition();
    const head = crew.socketNodes["socket.head"].getAbsolutePosition();
    // skull top at 55 vox (1.72 m); default hair reaches 1.80-1.84 m
    expect(head.y).toBeCloseTo(55 / 32, 2);
    const hair = scene.meshes.find((m) => m.name.startsWith("GEO-crew-hair-default-male"))!;
    hair.refreshBoundingInfo({ applySkeleton: true });
    const top = hair.getBoundingInfo().boundingBox.maximumWorld.y;
    expect(top).toBeGreaterThan(1.78);
    expect(top).toBeLessThan(1.86);
    expect(face.z).toBeLessThan(back.z); // face is toward -Z
    const grip = crew.socketNodes["socket.hand.R"].getAbsolutePosition();
    const hand = scene.transformNodes.find((n) => n.name === "hand.R")!.getAbsolutePosition();
    expect(Vector3.Distance(grip, hand)).toBeLessThan(0.12); // wrist joint -> fist centre
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

  it("support-hand IK pins socket.hand.L onto a held item's support socket after animations", async () => {
    const { engine, scene, crew } = await load();
    crew.customize({ weapon: "rifle" });
    crew.update({ moving: false, seated: false, combat: true });
    for (const node of scene.transformNodes) node.computeWorldMatrix(true);
    // a rifle foregrip: child of the primary grip socket (same axes as socket.hand.L), 6 vox along
    // the barrel and 1 vox to the left, like the published rifle grip profile
    const target = new TransformNode("support-grip", scene);
    target.parent = crew.socketNodes["socket.hand.R"];
    target.position.set(6 / 32, 1 / 32, 0.5 / 32);
    target.rotationQuaternion = Quaternion.Identity();
    crew.setSupportTarget(target);
    new FreeCamera("review", new Vector3(0, 1, -4), scene);
    engine.getDeltaTime = () => 50;         // let the idle_armed -> aim_rifle blend complete
    for (let i = 0; i < 8; i++) scene.render(); // animations (aim_rifle) then the support-hand solve
    for (const node of scene.transformNodes) node.computeWorldMatrix(true);
    const left = crew.socketNodes["socket.hand.L"].getAbsolutePosition();
    expect(crew.supportError).toBeLessThan(0.002);
    expect(Vector3.Distance(left, target.getAbsolutePosition())).toBeLessThan(0.005);
    crew.setSupportTarget(null);
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

describe("voxel crew assets agree with the content contract", () => {
  const manifest = JSON.parse(
    readFileSync(new URL("../../../../assets/runtime/crew/voxel/r004/manifest.json", import.meta.url), "utf8"),
  ) as { revision: string; actions: { name: string; nominalSpeed?: number; expressionTrack?: [number, string][] }[] };
  it("pins revision, nominal stride speeds and expression tracks to the exported actions", () => {
    expect(manifest.revision).toBe(VOXEL_CREW_REVISION);
    for (const a of manifest.actions) {
      if (a.nominalSpeed) expect(VOXEL_CREW_NOMINAL_SPEED[a.name as VoxelCrewAction]).toBeCloseTo(a.nominalSpeed, 2);
      const track = VOXEL_CREW_EXPRESSION_TRACKS[a.name as VoxelCrewAction];
      if (track) expect(a.expressionTrack).toEqual(track.map(([f, e]) => [f, e]));
    }
  });
});

describe("voxel crew pixel face", () => {
  const atlas = JSON.parse(
    readFileSync(new URL("../../../../assets/runtime/crew/voxel/r004/face/face-atlas.json", import.meta.url), "utf8"),
  ) as FaceAtlas;
  const image = decodePng(readFileSync(new URL("../../../../assets/runtime/crew/voxel/r004/face/face-default.png", import.meta.url)));

  it("composes the same neutral face as the Blender pipeline", () => {
    const reference = decodePng(readFileSync(new URL("../../../../assets/runtime/crew/voxel/r004/face/face-neutral.png", import.meta.url)));
    const ours = composeFace(atlas, image, { expression: "neutral" });
    let worst = 0;
    for (let i = 0; i < ours.length; i++) worst = Math.max(worst, Math.abs(ours[i] - reference.data[i]));
    expect(worst).toBeLessThanOrEqual(1);
  });

  it("covers every required expression and viseme, and blink closes the eyes", () => {
    for (const e of ["neutral", "happy", "sad", "angry", "surprised", "confused", "hurt", "determined", "scared",
      "smug", "sleepy", "knocked_out"]) expect(atlas.expressions[e]).toBeDefined();
    for (const v of ["closed", "A", "E", "O", "MB"]) expect(atlas.visemes[v]).toBeDefined();
    const open = composeFace(atlas, image, { expression: "neutral" });
    const shut = composeFace(atlas, image, { expression: "neutral", blinkEyes: "closed" });
    expect(Buffer.from(open).equals(Buffer.from(shut))).toBe(false);
    const talking = composeFace(atlas, image, { expression: "neutral", viseme: "A" });
    expect(Buffer.from(open).equals(Buffer.from(talking))).toBe(false);
  });

  it("drives the face from action expression tracks, explicit expressions and auto-blink", async () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    let r = 0;
    const crew = await createVoxelCrewVisual(scene, new TransformNode("ship", scene), asset(), {
      faceAtlas: { atlas, image },
      random: () => (r = (r + 0.37) % 1),
    });
    expect(crew.face.ready).toBe(true);
    crew.play("emote_happy");
    const happy = scene.animationGroups.find((g) => g.name === "emote_happy")!;
    happy.goToFrame(happy.from + 10);
    scene.onBeforeRenderObservable.notifyObservers(scene);
    expect(crew.face.state.expression).toBe("happy");
    crew.face.setExpression("surprised");
    expect(crew.face.state.expression).toBe("surprised");
    crew.face.setExpression(null);
    crew.face.setViseme("O");
    expect(crew.face.state.viseme).toBe("O");
    crew.face.blink();
    expect(crew.face.state.blinkEyes).toBe("half");
    crew.face.tick(1 / 24);
    expect(crew.face.state.blinkEyes).toBe("closed");
    crew.face.tick(2 / 24);
    expect(crew.face.state.blinkEyes).toBe(null);
    const before = crew.face.uploads;
    crew.face.tick(7);                       // auto-blink fires within 2..6 s
    expect(crew.face.uploads).toBeGreaterThan(before);
    crew.dispose();
    scene.dispose();
    engine.dispose();
  });
});

function decodePng(buf: Buffer) {
  // Minimal RGBA8 / RGB8 non-interlaced PNG decoder for test fixtures.
  let o = 8;
  let width = 0, height = 0, channels = 4;
  const idat: Buffer[] = [];
  while (o < buf.length) {
    const len = buf.readUInt32BE(o);
    const type = buf.toString("ascii", o + 4, o + 8);
    const data = buf.subarray(o + 8, o + 8 + len);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      channels = data[9] === 6 ? 4 : 3;
    } else if (type === "IDAT") idat.push(data);
    o += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const px = new Uint8Array(width * height * channels);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)];
    for (let x = 0; x < stride; x++) {
      const v = raw[y * (stride + 1) + 1 + x];
      const a = x >= channels ? px[y * stride + x - channels] : 0;
      const b = y > 0 ? px[(y - 1) * stride + x] : 0;
      const c = x >= channels && y > 0 ? px[(y - 1) * stride + x - channels] : 0;
      const p = a + b - c;
      const pr = Math.abs(p - a) <= Math.abs(p - b) && Math.abs(p - a) <= Math.abs(p - c) ? a : Math.abs(p - b) <= Math.abs(p - c) ? b : c;
      px[y * stride + x] = (v + [0, a, b, (a + b) >> 1, pr][f]) & 255;
    }
  }
  if (channels === 4) return { width, height, data: px };
  const rgba = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) rgba.set([px[i * 3], px[i * 3 + 1], px[i * 3 + 2], 255], i * 4);
  return { width, height, data: rgba };
}
