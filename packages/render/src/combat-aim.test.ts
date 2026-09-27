import { afterEach, describe, expect, it } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { combatTargetDirection, createCombatAim } from "./combat-aim";

const cleanup: (() => void)[] = [];
afterEach(() => {
  for (const dispose of cleanup.splice(0)) dispose();
});

function fixture(width = 800, height = 600, scaling = 1) {
  const engine = new NullEngine({
    renderWidth: 1600,
    renderHeight: 1200,
    textureSize: 512,
    deterministicLockstep: false,
    lockstepMaxSteps: 4,
  });
  engine.setHardwareScalingLevel(scaling);
  const scene = new Scene(engine);
  const camera = new FreeCamera("camera", new Vector3(7, 10, 12), scene);
  camera.setTarget(Vector3.Zero());
  scene.activeCamera = camera;
  const ship = new TransformNode("ship", scene);
  const rect = { left: 125, top: 75, width, height };
  const canvas = {
    getBoundingClientRect: () => rect,
  } as HTMLCanvasElement;
  function screen(world: Vector3) {
    camera.getViewMatrix(true);
    scene.updateTransformMatrix(true);
    const projected = Vector3.Project(
      world,
      Matrix.IdentityReadOnly,
      scene.getTransformMatrix(),
      camera.viewport.toGlobal(
        engine.getRenderWidth(),
        engine.getRenderHeight(),
      ),
    );
    return {
      x: rect.left + (projected.x / engine.getRenderWidth()) * width,
      y: rect.top + (projected.y / engine.getRenderHeight()) * height,
    };
  }
  cleanup.push(() => {
    scene.dispose();
    engine.dispose();
  });
  return { engine, scene, camera, ship, canvas, screen };
}

describe("physical combat target intent", () => {
  it("derives yaw and upward/downward pitch from the actual origin in ship space", () => {
    const world = Matrix.Compose(
      Vector3.One(),
      Quaternion.RotationYawPitchRoll(0.7, 0, 0),
      new Vector3(120, 4, -83),
    );
    const localOrigin = new Vector3(-0.2, 3.7, 0.1);
    const origin = Vector3.TransformCoordinates(localOrigin, world);
    for (const height of [-2, 0, 2]) {
      const localTarget = localOrigin.add(new Vector3(2, height, -4));
      const direction = combatTargetDirection(
        Vector3.TransformCoordinates(localTarget, world),
        origin,
        world,
      )!;
      expect(direction.angle).toBeCloseTo(Math.atan2(2, 4), 6);
      expect(direction.pitch).toBeCloseTo(
        Math.atan2(height, Math.hypot(2, 4)),
        6,
      );
    }
    expect(combatTargetDirection(origin, origin, world)).toBeUndefined();
  });

  it.each([
    [800, 600, 1],
    [800, 600, 2],
    [1000, 500, 0.5],
  ])(
    "keeps the target under the CSS cursor at %i × %i with hardware scale %f",
    (width, height, scaling) => {
      const f = fixture(width, height, scaling);
      const aim = createCombatAim(f.scene, f.canvas, f.ship, []);
      const target = new Vector3(2, 0, -3);
      const pointer = f.screen(target);
      aim.pointer(pointer.x, pointer.y);
      const resolved = aim.aim(0, 0, 1)!;
      expect(Vector3.Distance(resolved.target, target)).toBeLessThan(1e-4);
      expect(resolved.distance).toBeGreaterThan(1);
      expect(resolved.surface).toBe(false);
      expect(resolved.pitch).toBeLessThan(0);
      const projected = f.screen(resolved.target);
      // Babylon keeps projection matrices as float32; require subpixel agreement.
      expect(
        Math.hypot(projected.x - pointer.x, projected.y - pointer.y),
      ).toBeLessThan(0.001);
    },
  );

  it("falls back to the active raised walking deck, including the ship transform", () => {
    const f = fixture();
    f.ship.position.set(3, 2, -1);
    f.ship.rotation.y = 0.4;
    const world = f.ship.computeWorldMatrix(true);
    const target = Vector3.TransformCoordinates(new Vector3(2, 2.8, -4), world);
    const pointer = f.screen(target);
    const aim = createCombatAim(f.scene, f.canvas, f.ship, []);
    aim.pointer(pointer.x, pointer.y);
    const resolved = aim.aim(0, 0, 60, { deckHeight: 2.8 })!;
    expect(Vector3.Distance(resolved.target, target)).toBeLessThan(1e-4);
    expect(resolved.pitch).toBeCloseTo(Math.atan2(-1.3, Math.hypot(2, 4)), 5);
  });

  it("targets visible surfaces above the deck and ignores cutaway/hidden occluders", () => {
    const f = fixture();
    const box = CreateBox("raised fixture", { size: 1 }, f.scene);
    box.position.set(1, 2, -3);
    box.computeWorldMatrix(true);
    const target = new Vector3(1, 2.5, -3);
    const origin = new Vector3(0.2, 1.3, 0);
    const aim = createCombatAim(f.scene, f.canvas, f.ship, [box]);
    const pointer = f.screen(target);
    aim.pointer(pointer.x, pointer.y);
    const resolved = aim.aim(0, 0, 60, { origin })!;
    expect(resolved.surface).toBe(true);
    expect(Vector3.Distance(resolved.target, target)).toBeLessThan(1e-4);
    expect(resolved.angle).toBeCloseTo(Math.atan2(0.8, 3), 5);
    expect(resolved.pitch).toBeGreaterThan(0);
    box.visibility = 0.25;
    const cutaway = aim.aim(0, 0)!;
    expect(cutaway.surface).toBe(false);
    expect(cutaway.target.y).toBeCloseTo(0);
    box.visibility = 1;
    box.setEnabled(false);
    expect(aim.aim(0, 0)!.surface).toBe(false);
  });

  it("keeps beam and dot on the final physical muzzle direction despite cursor movement", () => {
    const f = fixture();
    const box = CreateBox("blocking wall", { size: 1 }, f.scene);
    box.position.set(0, 1, -3);
    box.computeWorldMatrix(true);
    const aim = createCombatAim(f.scene, f.canvas, f.ship, [box]);
    const muzzle = {
      position: new Vector3(0, 1, 0),
      direction: new Vector3(0, 0, -1),
    };
    for (const target of [new Vector3(4, 0, -3), new Vector3(-4, 0, 3)]) {
      const pointer = f.screen(target);
      aim.pointer(pointer.x, pointer.y);
      aim.aim(0, 0);
      aim.update(true, muzzle, 0, 0, 1 / 60, 30);
      expect(aim.meshes[1].position.asArray()).toEqual([0, 1, -2.5]);
      expect(aim.meshes[0].scaling.z).toBeCloseTo(2.5);
    }
    aim.update(false, muzzle, 0, 0, 1 / 60);
    expect(aim.meshes.every((mesh) => !mesh.isEnabled())).toBe(true);
    aim.dispose();
    expect(aim.meshes.every((mesh) => mesh.isDisposed())).toBe(true);
  });

  it("projects a correctly pitched physical beam impact onto the same cursor pixel", () => {
    const f = fixture(800, 600, 2);
    const floor = CreateBox(
      "walking floor",
      { width: 20, depth: 20, height: 0.2 },
      f.scene,
    );
    floor.position.y = -0.1;
    floor.computeWorldMatrix(true);
    const aim = createCombatAim(f.scene, f.canvas, f.ship, [floor]);
    const target = new Vector3(2, 0, -3);
    const pointer = f.screen(target);
    const origin = new Vector3(0.3, 1.3, 0);
    aim.pointer(pointer.x, pointer.y);
    const intent = aim.aim(0, 0, 60, { origin })!;
    const direction = new Vector3(
      Math.sin(intent.angle) * Math.cos(intent.pitch),
      Math.sin(intent.pitch),
      -Math.cos(intent.angle) * Math.cos(intent.pitch),
    );
    aim.update(true, { position: origin, direction }, 0, 0, 1 / 60, 60);
    const impact = aim.meshes[1].position;
    expect(Vector3.Distance(impact, target)).toBeLessThan(1e-4);
    const screen = f.screen(impact);
    expect(Math.hypot(screen.x - pointer.x, screen.y - pointer.y)).toBeLessThan(
      0.001,
    );
  });
});
