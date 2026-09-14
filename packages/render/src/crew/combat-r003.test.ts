import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { SceneLoader } from "@babylonjs/core/Loading/sceneLoader";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { createCrewVisual } from "./index";
import { bindPoseEquipment } from "../equipment/pose-anchors";
import type { EquipmentPoseDiagnostics, PoseIntent } from "./equipment-pose";
import type { AuthoredAimSpace } from "./aim-space";
import type { EquipmentPoseItem } from "@sidereal/content/equipment-poses";
import { CHARACTER_COMPONENT_SETS } from "@sidereal/content/character-components";

const installed = new URL(
  "../../../../assets/runtime/crew/components/modular-crew.glb",
  import.meta.url,
);
const staged = new URL(
  "../../../../assets/runtime/crew/poses/r003/",
  import.meta.url,
);
const aimSpace = JSON.parse(
  readFileSync(new URL("runtime-aim-space.json", staged), "utf8"),
) as AuthoredAimSpace;
const metadata = JSON.parse(
  readFileSync(new URL("profile-socket-metadata.json", staged), "utf8"),
) as { items: Record<string, EquipmentPoseItem> };
const mixedHeavy = {
  ...CHARACTER_COMPONENT_SETS.medic,
  helmet: "marine-helmet",
  chest: "marine-chest",
  shoulders: "marine-shoulders",
  legs: "engineer-legs",
  back: "salvage-back",
};

async function fixture(bodyType: "male" | "female", id: string) {
  const engine = new NullEngine(),
    scene = new Scene(engine),
    ship = new TransformNode("ship", scene);
  ship.position.set(3, 2.8, -4);
  ship.rotation.y = 0.7;
  const crew = await createCrewVisual(
    scene,
    ship,
    new Uint8Array(readFileSync(installed)),
  );
  crew.customize({
    bodyType,
    equippedComponents: mixedHeavy,
    outfit: "medic",
    armor: "none",
    weapon: "none",
    weaponFixture: false,
  });
  const rifle = id === "carbine" || id === "long-rifle";
  crew.update({
    moving: false,
    seated: false,
    reducedMotion: true,
    weaponPose: rifle ? "rifle" : "one-handed",
  });
  const solver = crew.createPoseController();
  solver.setAimSpace(aimSpace);
  const gear = await SceneLoader.LoadAssetContainerAsync(
    "",
    new Uint8Array(readFileSync(new URL(`equipment/${id}.glb`, staged))),
    scene,
    undefined,
    ".glb",
  );
  gear.addAllToScene();
  const held = new TransformNode("held", scene);
  held.parent = crew.sockets.handR;
  for (const root of gear.rootNodes) root.parent = held;
  const item = metadata.items[id];
  let binding = bindPoseEquipment(
    held,
    gear.rootNodes[0] as TransformNode,
    item,
    crew.root,
  );
  solver.bind(binding);
  const originalPlacement = crew.root.position.clone();
  const base: PoseIntent = {
    yaw: 0,
    pitch: 0,
    facing: 0,
    active: true,
    reducedMotion: false,
    profile: item.profile,
    itemId: `actual-${id}`,
    shotSequence: 3n,
  };
  const clip = scene.animationGroups.find(
    (group) => group.name === (rifle ? "Idle-Rifle" : "Idle-Pistol"),
  )!;
  function step(changes: Partial<PoseIntent> = {}, dt = 1 / 60) {
    scene.onBeforeAnimationsObservable.notifyObservers(scene);
    clip.goToFrame(clip.from);
    solver.update({ ...base, ...changes }, dt);
    scene.onAfterAnimationsObservable.notifyObservers(scene);
    expect(crew.root.position.asArray()).toEqual(originalPlacement.asArray());
    expect(ship.position.asArray()).toEqual([3, 2.8, -4]);
    return solver.diagnostics;
  }
  function settle(changes: Partial<PoseIntent> = {}, frames = 90) {
    for (let i = 0; i < frames; i++) step(changes);
    return solver.diagnostics;
  }
  return {
    scene,
    ship,
    crew,
    solver,
    held,
    item,
    step,
    settle,
    get binding() {
      return binding;
    },
    rebind() {
      solver.bind(undefined);
      binding = bindPoseEquipment(
        held,
        gear.rootNodes[0] as TransformNode,
        item,
        crew.root,
      );
      solver.bind(binding);
    },
    dispose() {
      crew.dispose();
      gear.dispose();
      held.dispose();
      scene.dispose();
      engine.dispose();
    },
  };
}

function contacts(d: EquipmentPoseDiagnostics, label: string) {
  expect.soft(d.status, label).toBe("solved");
  expect.soft(d.requestedFailure, label).toBeUndefined();
  expect.soft(d.primaryErrorM, `${label}: primary grip`).toBeLessThan(0.004);
  expect.soft(d.supportErrorM, `${label}: support grip`).toBeLessThan(0.025);
  expect.soft(d.penetrationM, `${label}: weapon/body`).toBeLessThan(1e-5);
  expect.soft(d.upperArmPenetrationM, `${label}: arms`).toBeLessThan(0.005);
}

describe.each(["male", "female"] as const)(
  "r003 %s modular combat regressions",
  (bodyType) => {
    it("keeps knee flexion aligned with the feet through large combat turns", async () => {
      const f = await fixture(bodyType, "carbine");
      try {
        for (const yaw of [0, 1.2, -1.2]) {
          f.settle({ yaw }, 150);
          for (const side of ["R", "L"]) {
            const node = (part: string) =>
              f.scene.transformNodes.find(
                (node) => node.name === `${part}.${side}`,
              )!;
            const thigh = node("thigh"),
              shin = node("shin"),
              foot = node("foot");
            for (const joint of [thigh, shin, foot])
              joint.computeWorldMatrix(true);
            const hip = thigh.getAbsolutePosition(),
              knee = shin.getAbsolutePosition(),
              ankle = foot.getAbsolutePosition();
            const axis = ankle.subtract(hip).normalize();
            const bend = knee.subtract(hip);
            bend
              .subtractInPlace(axis.scale(Vector3.Dot(bend, axis)))
              .normalize();
            const toes = foot.getDirection(Vector3.Forward());
            toes.y = 0;
            toes
              .subtractInPlace(axis.scale(Vector3.Dot(toes, axis)))
              .normalize();
            expect(
              Vector3.Dot(bend, toes),
              `${bodyType}/${side}/yaw=${yaw}: knee flexion over toes`,
            ).toBeGreaterThan(0.985);
          }
        }
      } finally {
        f.dispose();
      }
    }, 60000);
    it("retains raised/downward rifle pitch and physical aim through mixed heavy armor", async () => {
      for (const id of ["carbine", "long-rifle"]) {
        const f = await fixture(bodyType, id);
        try {
          for (const pitch of [-0.6, -0.3, 0, 0.3, 0.6]) {
            const d = f.settle({ pitch });
            const label = `${bodyType}/${id}/pitch=${pitch}`;
            contacts(d, label);
            expect.soft(d.pitch, label).toBeCloseTo(pitch, 3);
            expect.soft(d.aimErrorDegrees, label).toBeLessThan(0.1);
            const physical = f.binding.socket("Aim.Muzzle")!;
            const desired = Vector3.TransformNormal(
              new Vector3(0, Math.sin(pitch), -Math.cos(pitch)),
              f.ship.computeWorldMatrix(true),
            ).normalize();
            expect
              .soft(Vector3.Dot(physical.direction, desired), label)
              .toBeGreaterThan(0.99999);
            expect
              .soft(
                Vector3.Distance(d.muzzle!.position, physical.position),
                label,
              )
              .toBeLessThan(1e-6);
          }
        } finally {
          f.dispose();
        }
      }
    }, 60000);

    it("holds both low-ready grips, hides the muzzle and immediately takes noncombat travel facing", async () => {
      for (const id of ["carbine", "long-rifle"]) {
        const f = await fixture(bodyType, id);
        try {
          f.settle({ yaw: 1.2 });
          const facing = -1.4;
          f.crew.root.rotation.y = -facing;
          const first = f.step({
            active: false,
            moving: true,
            facing,
            yaw: 1.2,
          });
          expect(first.heading).toBeCloseTo(facing, 10);
          const model = f.crew.root
            .getChildren()
            .find((node) => node.name === "crew-model") as TransformNode;
          expect(model.rotation.y).toBeCloseTo(Math.PI, 10);
          const d = f.settle({ active: false, moving: true, facing, yaw: 1.2 });
          contacts(d, `${bodyType}/${id}/low-ready`);
          expect(d.muzzle).toBeUndefined();
          expect(d.pitch).toBeLessThan(-0.25);
          const before = f.binding.socket("Grip.Primary")!.position.clone();
          for (let i = 0; i < 10; i++)
            f.step({ active: false, moving: true, facing, yaw: 1.2 }, 0);
          expect(
            Vector3.Distance(
              before,
              f.binding.socket("Grip.Primary")!.position,
            ),
          ).toBeLessThan(1e-5);
          for (const state of [
            { hidden: true },
            { seated: true },
            { sprinting: true, moving: true },
          ]) {
            f.settle({ ...state, active: false, facing });
            expect(f.solver.diagnostics.muzzle).toBeUndefined();
          }
        } finally {
          f.dispose();
        }
      }
    }, 60000);

    it("relaxes the empty pistol hand below the chest in combat and while carrying", async () => {
      const f = await fixture(bodyType, "compact-pistol");
      try {
        expect(f.item.profile).toBe("PISTOL_ONE_HAND");
        for (const active of [true, false]) {
          f.settle({ active });
          const inverse = Matrix.Invert(f.crew.root.computeWorldMatrix(true));
          const left = Vector3.TransformCoordinates(
            f.crew.sockets.handL.getAbsolutePosition(),
            inverse,
          );
          const right = Vector3.TransformCoordinates(
            f.crew.sockets.handR.getAbsolutePosition(),
            inverse,
          );
          expect
            .soft(left.y, `${bodyType}/pistol/${active}: free hand height`)
            .toBeLessThan(0.95);
          expect
            .soft(
              right.y - left.y,
              `${bodyType}/pistol/${active}: hands separate`,
            )
            .toBeGreaterThan(0.15);
          if (active) contacts(f.solver.diagnostics, `${bodyType}/pistol`);
          else expect(f.solver.diagnostics.muzzle).toBeUndefined();
        }
      } finally {
        f.dispose();
      }
    }, 60000);

    it("applies accepted recoil once and does not replay history after re-equipping", async () => {
      const f = await fixture(bodyType, "carbine");
      try {
        // Let acquisition finish before comparing the decaying recoil against
        // neutral; otherwise its remaining low-ready blend is a moving baseline.
        const neutral = f.settle({}, 240).muzzle!.direction.clone();
        const initialPitch = f.solver.diagnostics.pitch;
        const shot = f.step({ shotSequence: 4n });
        expect(shot.pitch).toBeGreaterThan(initialPitch + 0.005);
        expect(shot.muzzle!.direction.y).toBeGreaterThan(neutral.y + 0.005);
        f.settle({ shotSequence: 4n });
        expect(f.solver.diagnostics.pitch).toBeCloseTo(initialPitch, 5);
        f.rebind();
        const restored = f.step({ shotSequence: 90n, reducedMotion: true }, 0);
        expect(restored.pitch).toBeCloseTo(initialPitch, 5);
        expect(
          Vector3.Distance(restored.muzzle!.direction, neutral),
        ).toBeLessThan(1e-5);
        f.step({ hidden: true, shotSequence: 91n });
        f.step({ shotSequence: 91n, reducedMotion: true }, 0);
        expect(f.solver.diagnostics.pitch).toBeCloseTo(initialPitch, 5);
        expect(f.solver.diagnostics.muzzle).toBeDefined();
      } finally {
        f.dispose();
      }
    }, 60000);
  },
);
