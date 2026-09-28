import { afterEach, describe, expect, it } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { PREFAB_SHIPS } from "@sidereal/content/prefabs";
import { defaultPrefabComponentCatalog } from "@sidereal/content/ship-prefab-catalog";
import { prefabConstructionDocument } from "@sidereal/sim/prefab-construction";
import { castPrefabBeam, prefabBeamModel } from "@sidereal/sim/prefab-beam";
import {
  PREFAB_OBJECT_PREFIX,
  createImpactFlash,
  createPrefabBeamClip,
  createPrefabObjectPicker,
  prefabBindingOf,
} from "./prefab-ship-interaction";

const cleanup: (() => void)[] = [];
afterEach(() => {
  for (const dispose of cleanup.splice(0)) dispose();
});
const catalog = defaultPrefabComponentCatalog();
const FED_WREN = PREFAB_SHIPS.find((p) => p.id === "fed.s.wren")!;
const binding = prefabBindingOf(
  JSON.stringify(prefabConstructionDocument(FED_WREN, catalog)),
)!;

function fixture() {
  const engine = new NullEngine({
    renderWidth: 1600,
    renderHeight: 1200,
    textureSize: 512,
    deterministicLockstep: false,
    lockstepMaxSteps: 4,
  });
  const scene = new Scene(engine);
  const camera = new FreeCamera("camera", new Vector3(0, 30, 0.01), scene);
  camera.setTarget(Vector3.Zero());
  scene.activeCamera = camera;
  const ship = new TransformNode("ship", scene);
  // A moved and turned ship: every helper must work in the ship's own frame.
  ship.position.set(120, 0, -40);
  ship.rotationQuaternion = Quaternion.RotationAxis(Vector3.Up(), 0.7);
  const rect = { left: 0, top: 0, width: 800, height: 600 };
  const canvas = {
    getBoundingClientRect: () => rect,
    addEventListener() {},
    removeEventListener() {},
    style: {} as CSSStyleDeclaration,
  } as unknown as HTMLCanvasElement;
  function screen(world: Vector3) {
    camera.getViewMatrix(true);
    scene.updateTransformMatrix(true);
    const p = Vector3.Project(
      world,
      Matrix.IdentityReadOnly,
      scene.getTransformMatrix(),
      camera.viewport.toGlobal(
        engine.getRenderWidth(),
        engine.getRenderHeight(),
      ),
    );
    return {
      clientX: (p.x / engine.getRenderWidth()) * rect.width,
      clientY: (p.y / engine.getRenderHeight()) * rect.height,
    };
  }
  cleanup.push(() => {
    scene.dispose();
    engine.dispose();
  });
  return { scene, camera, ship, canvas, screen };
}

describe("prefab ship interaction presentation", () => {
  it("only binds trusted prefab construction documents", () => {
    expect(binding.doc.id).toBe("fed.s.wren");
    expect(prefabBindingOf(undefined)).toBeUndefined();
    expect(prefabBindingOf(JSON.stringify({ layout: {} }))).toBeUndefined();
  });

  it("clips a horizontal beam where the authoritative planar cast stops it", () => {
    const { ship } = fixture();
    const clip = createPrefabBeamClip(ship, binding);
    const world = ship.computeWorldMatrix(true);
    // Engine room walkway (plan 1.5,3 -> ship-local (0.5, -4.5)), muzzle 1.3 m above the floor
    // top, aiming port at the reactor.
    const local = new Vector3(0.5, 0.1875 + 1.3, 4.5);
    const origin = Vector3.TransformCoordinates(local, world);
    const direction = Vector3.TransformNormal(new Vector3(-1, 0, 0), world);
    const expected = castPrefabBeam(
      prefabBeamModel(binding.doc, binding.catalog),
      [0.5, -4.5],
      -Math.PI / 2,
      60,
    );
    expect(expected.kind).toBe("object");
    expect(expected.targetId).toBe("mount:reactor");
    expect(clip(origin, direction, 60)).toBeCloseTo(expected.distanceM, 5);
    // Pitched down towards the open engine-room door, the floor stops it first.
    const down = Vector3.TransformNormal(
      new Vector3(0, -1, -1).normalize(),
      world,
    );
    expect(clip(origin, down, 60)).toBeCloseTo(1.3 * Math.SQRT2, 5);
  });

  it("picks the object under the cursor in the ship frame and ignores deck objects in flight view", () => {
    const { scene, ship, canvas, screen } = fixture();
    let deck = true;
    const picker = createPrefabObjectPicker(
      scene,
      canvas,
      ship,
      binding,
      () => deck,
    );
    cleanup.push(() => picker.dispose());
    const world = ship.computeWorldMatrix(true);
    // Reactor centre: plan (1.5, 5.5, top 2.79) -> ship-root local (-2, 2.79, 4.5).
    const reactorTop = Vector3.TransformCoordinates(
      new Vector3(-2, 2.7, 4.5),
      world,
    );
    expect(picker.pick(screen(reactorTop))).toBe(
      PREFAB_OBJECT_PREFIX + "mount:reactor",
    );
    deck = false;
    // A roof radiator (flight view only) above the reactor: plan (1.5, 5, top 3.59) -> ship-root
    // local (-1.5, 3.5, 4.5).
    const radiatorTop = Vector3.TransformCoordinates(
      new Vector3(-1.5, 3.5, 4.5),
      world,
    );
    expect(picker.pick(screen(radiatorTop))).toBe(
      PREFAB_OBJECT_PREFIX + "mount:rad-b",
    );
    expect(picker.pick(screen(reactorTop))).not.toBe(
      PREFAB_OBJECT_PREFIX + "mount:reactor",
    );
    expect(picker.objectIds()).toContain(
      PREFAB_OBJECT_PREFIX + "socket:bunks:0",
    );
    picker.select(PREFAB_OBJECT_PREFIX + "mount:reactor");
    expect(scene.meshes.some((m) => m.name === "prefab-object-selected")).toBe(
      true,
    );
    picker.select(undefined);
    expect(scene.meshes.some((m) => m.name === "prefab-object-selected")).toBe(
      false,
    );
  });

  it("plays a short impact flash at a ship-local point and cleans it up", () => {
    const { scene, ship } = fixture();
    let now = 0;
    const flash = createImpactFlash(scene, ship, () => now);
    cleanup.push(() => flash.dispose());
    const meshes = flash.play(1, 2, 1.3);
    expect(meshes.length).toBeGreaterThan(1);
    expect(meshes[0].position.x).toBeCloseTo(1, 9);
    expect(meshes[0].position.z).toBeCloseTo(-2, 9);
    expect(meshes[0].parent).toBe(ship);
    now = 200;
    scene.render();
    expect(flash.meshes().length).toBe(meshes.length);
    now = 400;
    scene.render();
    expect(flash.meshes().length).toBe(0);
  });
});
