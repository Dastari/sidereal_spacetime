import { afterEach, expect, it } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { createInsetWallCutaway } from "./inset-wall-cutaway";
const engines: NullEngine[] = [];
afterEach(() => {
  for (const e of engines.splice(0)) e.dispose();
});
function setup() {
  const e = new NullEngine();
  engines.push(e);
  const scene = new Scene(e);
  scene.useRightHandedSystem = true;
  const parent = new TransformNode("ship", scene),
    camera = new ArcRotateCamera(
      "camera",
      0,
      1,
      5,
      new Vector3(0.75, 1, -2),
      scene,
    ),
    material = new PBRMaterial("shared-native", scene);
  scene.activeCamera = camera;
  const wall = (id: string, z = 0) => {
    const root = new TransformNode(id, scene);
    root.parent = parent;
    root.position.z = z;
    root.metadata = { nativeKey: "convex-r004/span-9f29a130438b-q4" };
    const mesh = CreateBox(id + "mesh", {}, scene);
    mesh.parent = root;
    mesh.material = material;
    mesh.metadata = { role: "wall" };
    return { root, mesh };
  };
  return { scene, parent, camera, material, wall };
}
it("fades only near occluders, leaves far walls opaque and restores exterior visibility", () => {
  const f = setup(),
    near = f.wall("near"),
    far = f.wall("far", -4),
    behind = f.wall("behind", -2.2);
  const walls = [near, far, behind];
  const h = createInsetWallCutaway(f.scene, f.parent, {
    roots: walls.map((w) => w.root),
    meshes: walls.map((w) => w.mesh),
  });
  h.update(new Vector3(0.75, 2, 3), true);
  expect(near.mesh.visibility).toBe(0.12);
  expect(far.mesh.visibility).toBe(1);
  expect(behind.mesh.visibility).toBe(1);
  expect(near.mesh.material).toBe(far.mesh.material);
  expect(near.mesh.metadata.cutawayFade).toBe(true);
  h.update(new Vector3(0.75, 2, 3), false);
  expect(walls.every((w) => w.mesh.visibility === 1)).toBe(true);
});
for (let q = 0; q < 4; q++)
  it("uses inverse placed world frame for cardinal rotation " + q, () => {
    const f = setup(),
      wall = f.wall("wall");
    f.parent.position.set(30, 8, -15);
    f.parent.rotation.y = 0.7;
    wall.root.rotation.y = (q * Math.PI) / 2;
    const world = wall.root.computeWorldMatrix(true);
    f.camera.setTarget(
      Vector3.TransformCoordinates(new Vector3(0.75, 1, -2), world),
    );
    const camera = Vector3.TransformCoordinates(new Vector3(0.75, 2, 3), world);
    const h = createInsetWallCutaway(f.scene, f.parent, {
      roots: [wall.root],
      meshes: [wall.mesh],
    });
    h.update(camera, true);
    expect(wall.mesh.visibility).toBe(0.12);
  });
it("includes the actor corridor but avoids distant sideways walls and rays above the wall", () => {
  const f = setup(),
    wall = f.wall("near"),
    h = createInsetWallCutaway(f.scene, f.parent, {
      roots: [wall.root],
      meshes: [wall.mesh],
    });
  f.camera.setTarget(new Vector3(1.7, 1, -2));
  h.update(new Vector3(1.7, 2, 3), true);
  expect(wall.mesh.visibility).toBe(0.12);
  f.camera.setTarget(new Vector3(2, 1, -2));
  h.update(new Vector3(2, 2, 3), true);
  expect(wall.mesh.visibility).toBe(1);
  f.camera.setTarget(new Vector3(0.75, 4, -2));
  h.update(new Vector3(0.75, 5, 3), true);
  expect(wall.mesh.visibility).toBe(1);
});
