/** Actual modular rig evaluation for paired r003 source/browser comparison. */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { SceneLoader } from "@babylonjs/core/Loading/sceneLoader";
import { createCrewVisual } from "../../packages/render/src/crew";
import { bindPoseEquipment } from "../../packages/render/src/equipment/pose-anchors";
import { CHARACTER_COMPONENT_SETS } from "../../packages/content/src/character-components";
import {
  EQUIPMENT_POSE_PROFILES,
  type EquipmentPoseItem,
  type EquipmentPoseType,
} from "../../packages/content/src/equipment-poses";
import type { PoseIntent } from "../../packages/render/src/crew/equipment-pose";
const output = process.argv[2];
if (!output) throw Error("Supply a new output directory");
mkdirSync(output, { recursive: false });
const folder = "assets/art-library/designs/crew.animation.aim/revisions/r003/";
const crewPath = "assets/runtime/crew/components/modular-crew.glb",
  bytes = readFileSync(crewPath);
const items = JSON.parse(
  readFileSync(folder + "profile-socket-metadata.json", "utf8"),
).items as Record<string, EquipmentPoseItem>;
const aimSpace = JSON.parse(
  readFileSync(folder + "runtime-aim-space.json", "utf8"),
);
const cases = [
  ...[true, false].flatMap((active) =>
    ["male", "female"].map((body) => ({
      name: `${body}-rifle-heavy-${active ? "up" : "low-ready"}`,
      body: body as "male" | "female",
      asset: "carbine",
      active,
      pitch: active ? 0.6 : 0,
      armor: "heavy" as const,
    })),
  ),

  {
    name: "male-rifle-raised",
    body: "male",
    asset: "carbine",
    active: true,
    pitch: 0,
    armor: false,
  },
  {
    name: "male-rifle-low-ready",
    body: "male",
    asset: "carbine",
    active: false,
    pitch: 0,
    armor: false,
  },
  {
    name: "male-rifle-down",
    body: "male",
    asset: "carbine",
    active: true,
    pitch: -0.6,
    armor: false,
  },
  {
    name: "male-rifle-up",
    body: "male",
    asset: "carbine",
    active: true,
    pitch: 0.6,
    armor: false,
  },
  {
    name: "female-rifle-raised",
    body: "female",
    asset: "long-rifle",
    active: true,
    pitch: 0,
    armor: false,
  },
  {
    name: "female-rifle-armor",
    body: "female",
    asset: "carbine",
    active: true,
    pitch: 0,
    armor: true,
  },
  {
    name: "female-pistol-raised",
    body: "female",
    asset: "compact-pistol",
    active: true,
    pitch: 0,
    armor: false,
  },
  {
    name: "female-pistol-carry",
    body: "female",
    asset: "compact-pistol",
    active: false,
    pitch: 0,
    armor: false,
  },
  {
    name: "preserved-heavy-stance",
    body: "male",
    asset: "carbine",
    active: true,
    pitch: 0,
    armor: false,
    profile: "HEAVY_WEAPON",
  },
] as const;
const samples = [];
for (const candidate of cases) {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  scene.useRightHandedSystem = true;
  const ship = new TransformNode("ship", scene),
    crew = await createCrewVisual(scene, ship, new Uint8Array(bytes));
  const equippedComponents =
    candidate.armor === "heavy"
      ? {
          ...CHARACTER_COMPONENT_SETS.medic,
          helmet: "marine-helmet",
          chest: "marine-chest",
          shoulders: "marine-shoulders",
          legs: "engineer-legs",
          back: "salvage-back",
        }
      : candidate.armor
        ? CHARACTER_COMPONENT_SETS.medic
        : {};
  crew.customize({
    bodyType: candidate.body,
    equippedComponents,
    armor: "none",
    weapon: "none",
    weaponFixture: false,
    hairStyle: candidate.body === "female" ? "ponytail" : "swept",
  });
  crew.update({
    moving: false,
    seated: false,
    reducedMotion: true,
    weaponPose: candidate.asset.includes("pistol") ? "one-handed" : "rifle",
  });
  const solver = crew.createPoseController();
  solver.setAimSpace(aimSpace);
  const item = {
    ...items[candidate.asset],
    profile: ("profile" in candidate
      ? candidate.profile
      : items[candidate.asset].profile) as EquipmentPoseType,
  };
  const gear = await SceneLoader.LoadAssetContainerAsync(
    "",
    new Uint8Array(
      readFileSync(folder + "equipment/" + candidate.asset + ".glb"),
    ),
    scene,
    undefined,
    ".glb",
  );
  gear.addAllToScene();
  const held = new TransformNode("held", scene);
  held.parent = crew.sockets.handR;
  for (const r of gear.rootNodes) r.parent = held;
  solver.bind(
    bindPoseEquipment(
      held,
      gear.rootNodes[0] as TransformNode,
      item,
      crew.root,
    ),
  );
  const intent: PoseIntent = {
    yaw: 0,
    facing: 0,
    pitch: candidate.pitch,
    active: candidate.active,
    profile: item.profile,
    itemId: candidate.asset,
    reducedMotion: true,
  };
  for (let i = 0; i < 60; i++) {
    scene.onBeforeAnimationsObservable.notifyObservers(scene);
    solver.update(intent, 0.1);
    scene.onAfterAnimationsObservable.notifyObservers(scene);
  }
  const bones = Object.fromEntries(
    scene.transformNodes
      .filter((n) =>
        /^(root|pelvis|spine|head|upper_arm\.[LR]|forearm\.[LR]|hand\.[LR]|thigh\.[LR]|shin\.[LR]|foot\.[LR])$/.test(
          n.name,
        ),
      )
      .map((n) => [n.name, Array.from(n.computeWorldMatrix(true).m)]),
  );
  const sample = {
    ...candidate,
    equippedComponents,
    intent,
    crewSha256: createHash("sha256").update(bytes).digest("hex"),
    bones,
    equipment: Array.from(gear.rootNodes[0].computeWorldMatrix(true).m),
    diagnostics: solver.diagnostics,
  };
  writeFileSync(
    output + "/" + candidate.name + ".json",
    JSON.stringify(sample, null, 2),
  );
  samples.push({
    name: candidate.name,
    status: solver.diagnostics.status,
    pitch: solver.diagnostics.pitch,
    primary: solver.diagnostics.primaryErrorM,
    support: solver.diagnostics.supportErrorM,
    body: solver.diagnostics.penetrationM,
    arm: solver.diagnostics.upperArmPenetrationM,
  });
  crew.dispose();
  gear.dispose();
  held.dispose();
  scene.dispose();
  engine.dispose();
}
writeFileSync(
  output + "/manifest.json",
  JSON.stringify(
    {
      source:
        "Actual Babylon modular r008 and paired r003 GLBs; RH world matrices for native reproduction",
      profiles: EQUIPMENT_POSE_PROFILES,
      samples,
    },
    null,
    2,
  ),
);
console.log(JSON.stringify(samples, null, 2));
