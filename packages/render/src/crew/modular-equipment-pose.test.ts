import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { SceneLoader } from "@babylonjs/core/Loading/sceneLoader";
import { createCrewVisual } from "./index";
import { bindPoseEquipment } from "../equipment/pose-anchors";
import type { EquipmentPoseDiagnostics, PoseIntent } from "./equipment-pose";
import type { AuthoredAimSpace } from "./aim-space";
import type { EquipmentPoseItem } from "@sidereal/content/equipment-poses";
import { CHARACTER_COMPONENT_SETS } from "@sidereal/content/character-components";

const installed = new URL(
  "../../../../assets/runtime/crew/components/",
  import.meta.url,
);
const paired = new URL(
  "../../../../assets/art-library/designs/crew.animation.aim/revisions/r002/",
  import.meta.url,
);
const currentPose = new URL(
  "../../../../assets/art-library/designs/crew.animation.aim/revisions/r003/",
  import.meta.url,
);
const modularBytes = readFileSync(new URL("modular-crew.glb", installed));
const aimBytes = readFileSync(new URL("runtime-aim-space.json", currentPose));
const aimSpace = JSON.parse(aimBytes.toString()) as AuthoredAimSpace;
const metadata = JSON.parse(
  readFileSync(new URL("profile-socket-metadata.json", currentPose), "utf8"),
) as { items: Record<string, EquipmentPoseItem> };
const itemIds = [
  "carbine",
  "long-rifle",
  "heavy-handgun",
  "compact-pistol",
  "flashlight",
  "sample-scanner",
  "plasma-cutter",
];
const sha = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");

interface Gltf {
  nodes: {
    name: string;
    children?: number[];
    translation?: number[];
    rotation?: number[];
    scale?: number[];
    matrix?: number[];
  }[];
  skins: { joints: number[]; inverseBindMatrices: number }[];
  bufferViews: { byteOffset?: number; byteStride?: number }[];
  accessors: {
    bufferView: number;
    byteOffset?: number;
    componentType: number;
    count: number;
    type: string;
    normalized?: boolean;
  }[];
  meshes: {
    name: string;
    primitives: { attributes: Record<string, number> }[];
  }[];
  animations: { name: string }[];
}
function glb(bytes: Buffer) {
  const jsonLength = bytes.readUInt32LE(12);
  const json = JSON.parse(
    bytes.subarray(20, 20 + jsonLength).toString(),
  ) as Gltf;
  const binary = bytes.subarray(28 + jsonLength);
  function values(index: number) {
    const a = json.accessors[index],
      view = json.bufferViews[a.bufferView];
    const lanes = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 }[a.type]!;
    const width = { 5121: 1, 5123: 2, 5125: 4, 5126: 4 }[a.componentType]!;
    if (!lanes || !width)
      throw new Error(`Unsupported test accessor ${a.type}/${a.componentType}`);
    const offset = (view.byteOffset ?? 0) + (a.byteOffset ?? 0),
      stride = view.byteStride ?? width * lanes;
    return Array.from({ length: a.count }, (_, row) =>
      Array.from({ length: lanes }, (_, lane) => {
        const p = offset + row * stride + lane * width;
        const value =
          a.componentType === 5126
            ? binary.readFloatLE(p)
            : width === 1
              ? binary.readUInt8(p)
              : width === 2
                ? binary.readUInt16LE(p)
                : binary.readUInt32LE(p);
        return a.normalized ? value / (width === 1 ? 255 : 65535) : value;
      }),
    );
  }
  return { json, values };
}

it("installed r009 and exact paired aim assets share all 16 rest/bind joints and valid skin weights", () => {
  const manifest = JSON.parse(
    readFileSync(new URL("manifest.json", installed), "utf8"),
  );
  expect(manifest.revision).toBe(9);
  expect(sha(modularBytes)).toBe(manifest.files["modular-crew.glb"]);
  const pairedBytes = readFileSync(new URL("crew-poses.glb", paired));
  expect(sha(pairedBytes)).toBe(
    "44af8cbc0bb6f08aa558b9ac2f30359c832e8b52f5a45a3f351ff2a8e25ae00c",
  );
  expect(sha(aimBytes)).toBe(
    "ec269e27b11673dc9080da6114d51ddfdfff26f8acad773c4e0951c4168e1885",
  );
  const current = glb(modularBytes),
    source = glb(pairedBytes);
  const rig = (asset: ReturnType<typeof glb>) => {
    const skin = asset.json.skins[0],
      binds = asset.values(skin.inverseBindMatrices);
    return skin.joints.map((nodeIndex, i) => {
      const node = asset.json.nodes[nodeIndex];
      return {
        name: node.name,
        translation: node.translation,
        rotation: node.rotation,
        scale: node.scale,
        matrix: node.matrix,
        children: node.children?.map((n) => asset.json.nodes[n].name),
        inverseBind: binds[i],
      };
    });
  };
  expect(rig(current)).toHaveLength(16);
  expect(rig(current)).toEqual(rig(source));
  expect(current.json.animations).toHaveLength(12);
  expect(source.json.animations).toHaveLength(75);
  const jointCount = current.json.skins[0].joints.length;
  let vertices = 0;
  for (const mesh of current.json.meshes)
    for (const primitive of mesh.primitives) {
      const a = primitive.attributes;
      expect(a.JOINTS_0, mesh.name).toBeDefined();
      expect(a.WEIGHTS_0, mesh.name).toBeDefined();
      const positions = current.values(a.POSITION),
        joints = current.values(a.JOINTS_0),
        weights = current.values(a.WEIGHTS_0);
      expect(joints.length).toBe(positions.length);
      expect(weights.length).toBe(positions.length);
      expect(
        positions.every((p) => p.every(Number.isFinite)),
        mesh.name,
      ).toBe(true);
      expect(
        joints.every((row) =>
          row.every((j) => Number.isInteger(j) && j >= 0 && j < jointCount),
        ),
        mesh.name,
      ).toBe(true);
      expect(
        weights.every(
          (row) =>
            row.every((w) => Number.isFinite(w) && w >= 0 && w <= 1) &&
            Math.abs(row.reduce((a, b) => a + b, 0) - 1) < 1e-5,
        ),
        mesh.name,
      ).toBe(true);
      vertices += positions.length;
    }
  expect(vertices).toBeGreaterThan(10000);
  const delivered = JSON.parse(
    readFileSync(
      new URL("equipment-delivery-manifest.json", currentPose),
      "utf8",
    ),
  );
  for (const id of itemIds)
    expect(sha(readFileSync(new URL(`equipment/${id}.glb`, currentPose)))).toBe(
      delivered.files[`equipment/${id}.glb`].sha256,
    );
});

const looks = {
  medic: CHARACTER_COMPONENT_SETS.medic,
  mixedHeavy: {
    ...CHARACTER_COMPONENT_SETS.medic,
    helmet: "marine-helmet",
    chest: "marine-chest",
    shoulders: "marine-shoulders",
    legs: "engineer-legs",
    back: "salvage-back",
  },
};

function finiteDiagnostics(d: EquipmentPoseDiagnostics, label: string) {
  expect(
    [
      d.primaryErrorM,
      d.supportErrorM,
      d.shoulderErrorM,
      d.penetrationM,
      d.upperArmPenetrationM,
      d.heading,
      d.torsoYaw,
      d.pitch,
    ].every(Number.isFinite),
    label,
  ).toBe(true);
  expect(
    d.muzzle?.position.asArray().every(Number.isFinite) ?? true,
    label,
  ).toBe(true);
  expect(
    d.muzzle?.direction.asArray().every(Number.isFinite) ?? true,
    label,
  ).toBe(true);
}

function settledContacts(d: EquipmentPoseDiagnostics, label: string) {
  finiteDiagnostics(d, label);
  expect.soft(["solved", "fallback"], label).toContain(d.status);
  expect.soft(d.primaryErrorM, `${label}: primary grip`).toBeLessThan(0.004);
  expect.soft(d.supportErrorM, `${label}: support grip`).toBeLessThan(0.025);
  expect.soft(d.shoulderErrorM, `${label}: shoulder`).toBeLessThan(0.13);
  expect.soft(d.penetrationM, `${label}: weapon/body`).toBe(0);
  expect
    .soft(d.upperArmPenetrationM, `${label}: upper arms`)
    .toBeLessThan(0.005);
}

describe("actual modular r009 with exact paired equipment and aim samples", () => {
  for (const bodyType of ["male", "female"] as const)
    for (const [look, equippedComponents] of Object.entries(looks)) {
      it(`${bodyType}/${look}: seven items, reversal, strafe/backward, sprint, hidden and disposal`, async () => {
        const engine = new NullEngine(),
          scene = new Scene(engine),
          ship = new TransformNode("ship", scene);
        ship.rotation.y = 0.7;
        const crew = await createCrewVisual(
          scene,
          ship,
          new Uint8Array(modularBytes),
        );
        crew.customize({
          bodyType,
          equippedComponents,
          outfit: "medic",
          armor: "none",
          weapon: "none",
          weaponFixture: false,
        });
        crew.update({
          moving: false,
          seated: false,
          reducedMotion: true,
          weaponPose: "none",
        });
        const solver = crew.createPoseController();
        solver.setAimSpace(aimSpace);
        const visible = crew.root
          .getChildMeshes()
          .filter((mesh) => mesh.isEnabled() && mesh.getTotalVertices() > 0);
        expect(
          visible.some((mesh) =>
            mesh.name.startsWith(`GEO-base-${bodyType}-modesty`),
          ),
        ).toBe(true);
        expect(
          visible.some((mesh) =>
            mesh.name.startsWith(
              `GEO-base-${bodyType === "male" ? "female" : "male"}`,
            ),
          ),
        ).toBe(false);
        for (const id of Object.values(equippedComponents))
          expect(
            visible.some(
              (mesh) =>
                mesh.name.replace(/_primitive\d+$/, "").replace(/\.\d+$/, "") === `GEO-${id}` &&
                (mesh.metadata?.gltf?.extras?.component_id ?? id) === id,
            ),
            id,
          ).toBe(true);
        const skinned = () => {
          for (const mesh of visible) {
            mesh.computeWorldMatrix(true);
            mesh.skeleton?.prepare();
            const positions = mesh.getPositionData(true, true);
            expect(positions?.length, mesh.name).toBeGreaterThan(0);
            expect(positions?.every(Number.isFinite), mesh.name).toBe(true);
          }
        };
        try {
          for (const id of itemIds) {
            const item = metadata.items[id];
            const weaponPose = item.profile.includes("RIFLE")
              ? "rifle"
              : "one-handed";
            const clipSuffix = weaponPose === "rifle" ? "-Rifle" : "-Pistol";
            crew.update({
              moving: false,
              seated: false,
              reducedMotion: true,
              weaponPose,
            });
            const gear = await SceneLoader.LoadAssetContainerAsync(
              "",
              new Uint8Array(
                readFileSync(new URL(`equipment/${id}.glb`, currentPose)),
              ),
              scene,
              undefined,
              ".glb",
            );
            gear.addAllToScene();
            const held = new TransformNode(id, scene);
            held.parent = crew.sockets.handR;
            for (const root of gear.rootNodes) root.parent = held;
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
              pitch: 0,
              facing: 0,
              active: true,
              reducedMotion: false,
              profile: item.profile,
              itemId: id,
            };
            let sampledClip = `Idle${clipSuffix}`;
            const step = (
              changes: Partial<PoseIntent> = {},
              dt = 1 / 60,
              fraction = 0,
            ) => {
              scene.onBeforeAnimationsObservable.notifyObservers(scene);
              const clip = scene.animationGroups.find(
                (group) => group.name === sampledClip,
              )!;
              clip.goToFrame(clip.from + (clip.to - clip.from) * fraction);
              solver.update({ ...intent, ...changes }, dt);
              scene.onAfterAnimationsObservable.notifyObservers(scene);
              finiteDiagnostics(
                solver.diagnostics,
                `${bodyType}/${look}/${id}`,
              );
            };
            for (let f = 0; f < 120; f++) step();
            settledContacts(
              solver.diagnostics,
              `${bodyType}/${look}/${id}/neutral`,
            );
            skinned();
            for (const yaw of [0.7, -0.7, 0]) {
              for (let f = 0; f < 90; f++) step({ yaw }, 1 / 60);
              settledContacts(
                solver.diagnostics,
                `${bodyType}/${look}/${id}/reversal-${yaw}`,
              );
            }
            // Sample actual locomotion clips, then overlay the pose on their bones.
            for (const movementHeading of [Math.PI / 2, Math.PI]) {
              sampledClip = `Walk${clipSuffix}`;
              crew.update({
                moving: true,
                seated: false,
                reducedMotion: true,
                weaponPose,
              });
              for (let f = 0; f < 45; f++)
                step({ moving: true, movementHeading }, 1 / 60);
              for (const fraction of [0, 0.25, 0.5, 0.75, 1]) {
                step({ moving: true, movementHeading }, 1 / 60, fraction);
                settledContacts(
                  solver.diagnostics,
                  `${bodyType}/${look}/${id}/movement-${movementHeading}/${fraction}`,
                );
                skinned();
              }
            }
            sampledClip = `Sprint${clipSuffix}`;
            crew.update({
              moving: true,
              sprinting: true,
              seated: false,
              reducedMotion: true,
              weaponPose,
            });
            for (let f = 0; f < 120; f++)
              step({ sprinting: true, moving: true }, 1 / 60, (f % 30) / 30);
            expect(solver.diagnostics.muzzle).toBeUndefined();
            expect(solver.diagnostics.penetrationM).toBe(0);
            expect(solver.diagnostics.upperArmPenetrationM).toBe(0);
            if (!item.profile.includes("RIFLE"))
              expect(held.parent).toBe(crew.sockets.handR);
            else expect(solver.diagnostics.primaryErrorM).toBeLessThan(0.004);
            skinned();
            step({ hidden: true }, 1 / 60);
            expect(solver.diagnostics.status).toBe("hidden");
            expect(solver.diagnostics.iterations).toBe(0);
            expect(solver.diagnostics.muzzle).toBeUndefined();
            expect(solver.diagnostics.penetrationM).toBe(0);
            expect(solver.diagnostics.primary).toBeUndefined();
            step({ seated: true }, 1 / 60);
            expect(solver.diagnostics.muzzle).toBeUndefined();
            for (const action of ["lowered", "unequip"] as const) {
              step({ action, reducedMotion: true });
              if (action === "unequip" || !item.profile.includes("RIFLE"))
                expect(solver.diagnostics.status).toBe("inactive");
              else
                expect(
                  ["solved", "fallback"],
                  `${bodyType}/${look}/${id}/${action}: ${JSON.stringify({ p: solver.diagnostics.primaryErrorM, s: solver.diagnostics.supportErrorM, b: solver.diagnostics.penetrationM, a: solver.diagnostics.upperArmPenetrationM, shoulder: solver.diagnostics.shoulderErrorM })}`,
                ).toContain(solver.diagnostics.status);
              expect(solver.diagnostics.muzzle).toBeUndefined();
              expect(solver.diagnostics.penetrationM).toBe(0);
            }
            sampledClip = `Idle${clipSuffix}`;
            crew.update({
              moving: false,
              seated: false,
              reducedMotion: true,
              weaponPose,
            });
            for (let f = 0; f < 120; f++) step();
            settledContacts(
              solver.diagnostics,
              `${bodyType}/${look}/${id}/restored`,
            );
            expect(crew.root.position.asArray()).toEqual([0, 0, 0]);
            expect(ship.rotation.y).toBe(0.7);
            solver.bind(undefined);
            expect(solver.isBound).toBe(false);
            expect(solver.diagnostics.muzzle).toBeUndefined();
            gear.dispose();
            held.dispose();
          }
          crew.dispose();
          expect(solver.diagnostics.status).toBe("disposed");
          expect(solver.isBound).toBe(false);
          expect(solver.diagnostics.muzzle).toBeUndefined();
          expect(ship.isDisposed()).toBe(false);
        } finally {
          crew.dispose();
          scene.dispose();
          engine.dispose();
        }
      }, 60000);
    }
});
