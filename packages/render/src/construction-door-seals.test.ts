import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { loadConstructionDoorSeals } from "./construction-door-seals";
const bytes = readFileSync(
  "assets/art-library/designs/shipyard.structure.boundary-kit/revisions/r002/kit.glb",
);
function setup() {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  scene.useRightHandedSystem = true;
  const binding = (id: string) => {
    const frame = new TransformNode("frame-" + id, scene),
      hinge = new TransformNode("hinge-" + id, scene);
    hinge.parent = frame;
    hinge.position.set(0.3125, 0, 0.0625);
    return { openingId: id, frame, hinge };
  };
  return { engine, scene, binding };
}
test("native morph is independent per opening, shares its physical leaf hinge and never defaults to sealed", async () => {
  const { engine, scene, binding } = setup();
  try {
    const a = binding("a"),
      b = binding("b");
    b.frame.position.x = 4;
    const result = await loadConstructionDoorSeals(scene, bytes, [a, b]);
    const [one, two] = result.entries;
    expect(one.ring.isVisible).toBe(false);
    expect(two.ring.isVisible).toBe(false);
    expect(one.ring.parent).toBe(a.hinge);
    expect(one.seats.parent).toBe(a.frame);
    expect(one.ring.geometry).toBe(two.ring.geometry);
    expect(one.ring.morphTargetManager).not.toBe(two.ring.morphTargetManager);
    result.setStates([
      { openingId: "a", hingeFraction: 0, sealRetraction: 0 },
      { openingId: "b", hingeFraction: 0, sealRetraction: 1 },
    ]);
    expect(one.ring.morphTargetManager!.getTarget(0).influence).toBe(0);
    expect(two.ring.morphTargetManager!.getTarget(0).influence).toBe(1);
    expect(one.ring.isVisible).toBe(true);
    a.hinge.rotation.y = -Math.PI / 2;
    result.setStates([{ openingId: "a", hingeFraction: 1, sealRetraction: 1 }]);
    expect(one.ring.isVisible).toBe(true);
    expect(two.ring.isVisible).toBe(false);
    expect(a.hinge.rotation.y).toBe(-Math.PI / 2);
    result.setStates([{ openingId: "a", hingeFraction: 1, sealRetraction: 0 }]);
    expect(one.ring.isVisible).toBe(false);
    result.setStates([{ openingId: "a", hingeFraction: 0, sealRetraction: 0 }]);
    expect(one.ring.isVisible).toBe(false);
    const manager = one.ring.morphTargetManager;
    result.dispose();
    expect(one.ring.isDisposed()).toBe(true);
    expect(a.hinge.isDisposed()).toBe(false);
    expect(scene.morphTargetManagers).not.toContain(manager);
    expect(scene.morphTargetManagers).toHaveLength(0);
    expect(scene.meshes).toHaveLength(0);
  } finally {
    scene.dispose();
    engine.dispose();
  }
});
test("gasket rejects changed bytes, duplicate opening identities and incompatible bind transforms", async () => {
  const { engine, scene, binding } = setup();
  try {
    const a = binding("a");
    await expect(
      loadConstructionDoorSeals(scene, new Uint8Array([0]), [a]),
    ).rejects.toThrow(/hash/);
    await expect(
      loadConstructionDoorSeals(scene, bytes, [a, a]),
    ).rejects.toThrow(/binding/);
    a.hinge.position.x = 0;
    await expect(loadConstructionDoorSeals(scene, bytes, [a])).rejects.toThrow(
      /bind/,
    );
  } finally {
    scene.dispose();
    engine.dispose();
  }
});
