import { expect, test } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { Vector3, Matrix } from "@babylonjs/core/Maths/math.vector";
import { PointLight } from "@babylonjs/core/Lights/pointLight";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { PREFAB_SHIPS } from "@sidereal/content/prefabs";
import { defaultPrefabComponentCatalog } from "@sidereal/content/ship-prefab-catalog";
import { WAYFARER_GAMEPLAY_OBJECTS } from "@sidereal/content/wayfarer-authored-gameplay";
import { FURNISHING_DEFAULT } from "@sidereal/content/wayfarer-furnishings";
import { createFurnishingPreview } from "./furnishing-preview";
const doc = PREFAB_SHIPS.find((p) => p.id === "fed.m.wayfarer")!;
test("moving a batched furnishing extracts its real geometry and restores unrelated/source indices on cancel", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine),
    root = new TransformNode("ship", scene);
  const source = WAYFARER_GAMEPLAY_OBJECTS.find(
    (o) => o.object === "Lounge_coffee_table",
  )!;
  const cx = (source.min[0] + source.max[0]) / 2,
    cy = (source.min[1] + source.max[1]) / 2;
  const accepted = {
    ...FURNISHING_DEFAULT,
    dx: 0.4,
    dy: -0.2,
    yaw: Math.PI / 2,
  };
  const batch = new Mesh("material-batch", scene);
  batch.parent = root;
  const data = new VertexData();
  // A distinct authored witness already rotated 90 degrees at its accepted pose.
  data.positions = [
    -cy + 0.2 - 0.1,
    1,
    -cx - 0.4,
    -cy + 0.2,
    1,
    -cx - 0.4 - 0.1,
    -cy + 0.2,
    1.1,
    -cx - 0.4,
    10,
    0,
    0,
    11,
    0,
    0,
    10,
    1,
    0,
  ];
  data.normals = Array(6).fill([0, 1, 0]).flat();
  data.indices = [0, 1, 2, 3, 4, 5];
  data.applyToMesh(batch);
  batch.metadata = {
    authoredStudy: {
      placementRanges: [
        { object: source.object, indexStart: 0, indexCount: 3 },
        { object: "unrelated", indexStart: 3, indexCount: 3 },
      ],
    },
  };
  const light = new PointLight("owned", Vector3.Zero(), scene);
  light.includedOnlyMeshes = [batch];
  const lightNode = new TransformNode(
    `asset-lighting:fixture:${source.object}`,
    scene,
  );
  lightNode.parent = root;
  lightNode.position.set(-cy + 0.2, 1.2, -cx - 0.4);
  light.parent = lightNode;
  const originalLightPosition = lightNode.position.clone();
  const preview = createFurnishingPreview(
    scene,
    {} as HTMLCanvasElement,
    root,
    {
      doc,
      catalog: defaultPrefabComponentCatalog(),
      furnishings: { [source.object]: accepted },
    },
    () => {},
  );
  const next = { ...accepted, dx: 1, dy: 2, yaw: Math.PI };
  expect(preview.show(source.object, next)).toBe(true);
  expect(Array.from(batch.getIndices()!)).toEqual([0, 0, 0, 3, 4, 5]);
  const ghost = scene.meshes.find((m) =>
    m.name.startsWith("furnishing-preview:"),
  )!;
  const witness = Vector3.TransformCoordinates(
    new Vector3(-0.1, 1, 0),
    ghost.computeWorldMatrix(true),
  );
  // Delta rotation is 90 degrees, around accepted centre; the authored +X witness becomes -X.
  expect(witness.x).toBeCloseTo(-cy - 2);
  expect(witness.z).toBeCloseTo(-cx - 1 + 0.1);
  expect([...light.includedOnlyMeshes]).toEqual([batch, ghost]);
  expect(lightNode.parent?.name).toBe("furnishing-placement-preview");
  lightNode.computeWorldMatrix(true);
  const movedLight = lightNode.getAbsolutePosition();
  expect(movedLight.x).toBeCloseTo(-cy - 2);
  expect(movedLight.z).toBeCloseTo(-cx - 1);
  preview.clear();
  expect(lightNode.parent).toBe(root);
  expect(lightNode.position.equals(originalLightPosition)).toBe(true);
  expect([...light.includedOnlyMeshes]).toEqual([batch]);
  expect(Array.from(batch.getIndices()!)).toEqual([0, 1, 2, 3, 4, 5]);
  expect(scene.meshes).toEqual([batch]);
  expect(preview.show("fixed-or-missing", next)).toBe(false);
  preview.dispose();
  scene.dispose();
  engine.dispose();
});
test("pointer rays retain source-plan meaning through ship heading, canvas CSS scaling and render scale", () => {
  const engine = new NullEngine({
    renderWidth: 800,
    renderHeight: 600,
    textureSize: 512,
    deterministicLockstep: false,
    lockstepMaxSteps: 4,
  });
  const scene = new Scene(engine);
  scene.useRightHandedSystem = true;
  const root = new TransformNode("ship", scene);
  root.rotation.y = 0.8;
  root.position.set(20, 0, -30);
  const local = new Vector3(-2, 1, -3),
    world = Vector3.TransformCoordinates(local, root.computeWorldMatrix(true));
  const camera = new FreeCamera(
    "camera",
    world.add(new Vector3(8, 12, 8)),
    scene,
  );
  camera.setTarget(world);
  scene.activeCamera = camera;
  scene.updateTransformMatrix(true);
  const canvas = {
    getBoundingClientRect: () => ({
      left: 100,
      top: 50,
      width: 400,
      height: 300,
    }),
  } as HTMLCanvasElement;
  const preview = createFurnishingPreview(
    scene,
    canvas,
    root,
    { doc, catalog: defaultPrefabComponentCatalog() },
    () => {},
  );
  for (const scaling of [1, 2]) {
    engine.setHardwareScalingLevel(scaling);
    const p = Vector3.Project(
      world,
      Matrix.Identity(),
      scene.getTransformMatrix(),
      camera.viewport.toGlobal(
        engine.getRenderWidth(),
        engine.getRenderHeight(),
      ),
    );
    const ray = preview.ray(
      100 + (p.x / engine.getRenderWidth()) * 400,
      50 + (p.y / engine.getRenderHeight()) * 300,
    )!;
    const t = (1 - ray.origin[2]) / ray.direction[2];
    expect(ray.origin[0] + ray.direction[0] * t).toBeCloseTo(3, 4);
    expect(ray.origin[1] + ray.direction[1] * t).toBeCloseTo(2, 4);
  }
  preview.dispose();
  scene.dispose();
  engine.dispose();
});
