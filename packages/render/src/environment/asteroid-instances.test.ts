import { expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { Ray } from "@babylonjs/core/Culling/ray";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { MultiMaterial } from "@babylonjs/core/Materials/multiMaterial";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { SceneLoader } from "@babylonjs/core/Loading/sceneLoader";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { InstancedMesh } from "@babylonjs/core/Meshes/instancedMesh";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import "@babylonjs/loaders/glTF";
import { createStaticAsteroidInstances } from "./asteroid-instances";

test("authored asteroid instances keep independent contact poses, bounds, picking and shadow policy", async () => {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  const data = readFileSync(
    new URL("../../../../assets/runtime/voxels/asteroid.glb", import.meta.url),
  );
  const imported = await SceneLoader.ImportMeshAsync(
    "",
    "",
    "data:model/gltf-binary;base64," + data.toString("base64"),
    scene,
    undefined,
    ".glb",
  );
  const source = new TransformNode("source", scene),
    parent = new TransformNode("contacts", scene);
  for (const mesh of imported.meshes) if (!mesh.parent) mesh.parent = source;
  source.setEnabled(false);
  const control = source.clone("control", parent)!;
  control.setEnabled(true);
  const factory = createStaticAsteroidInstances(source);
  expect(factory).toBeDefined();
  const contacts = Array.from({ length: 140 }, (_, i) =>
    factory!(`contact-${i}`, parent),
  );
  const pose = (node: TransformNode) => {
    node.position.set(12, -4, 37);
    node.scaling.setAll(2.7);
    node.rotation.set(0.1, 0.6, 0.2);
    node.computeWorldMatrix(true);
  };
  pose(control);
  pose(contacts[0]);
  const before = control.getChildMeshes(),
    after = contacts[0].getChildMeshes();
  expect(after).toHaveLength(before.length);
  for (let i = 0; i < before.length; i++) {
    const a = before[i],
      b = after[i];
    expect(Array.from(b.computeWorldMatrix(true).m)).toEqual(
      Array.from(a.computeWorldMatrix(true).m),
    );
    expect(b.material).toBe(a.material);
    expect([b.isVisible, b.isPickable, b.visibility, b.receiveShadows]).toEqual(
      [a.isVisible, a.isPickable, a.visibility, a.receiveShadows],
    );
    if (a.getTotalVertices()) {
      expect(b).toBeInstanceOf(InstancedMesh);
      for (const kind of [VertexBuffer.PositionKind, VertexBuffer.NormalKind])
        expect(b.getVerticesData(kind)).toEqual(a.getVerticesData(kind));
      expect(b.getIndices()).toEqual(a.getIndices());
      expect(b.getBoundingInfo().boundingBox.minimumWorld.asArray()).toEqual(
        a.getBoundingInfo().boundingBox.minimumWorld.asArray(),
      );
    }
  }
  const b = after.find((m) => m.getTotalVertices() > 0)!,
    a = before.find((m) => m.getTotalVertices() > 0)!;
  const center = b.getBoundingInfo().boundingSphere.centerWorld;
  const ray = new Ray(
    center.add(new Vector3(0, 100, 0)),
    new Vector3(0, -1, 0),
    200,
  );
  const hit = scene.pickWithRay(ray, (m) => m === b),
    controlHit = scene.pickWithRay(ray, (m) => m === a);
  expect(hit?.hit).toBe(true);
  expect(hit?.pickedMesh).toBe(b);
  expect(hit?.pickedPoint?.asArray()).toEqual(
    controlHit?.pickedPoint?.asArray(),
  );
  const meshes = contacts
    .flatMap((c) => c.getChildMeshes())
    .filter((m) => m.getTotalVertices() > 0);
  expect(new Set(meshes.map((m) => (m as InstancedMesh).sourceMesh)).size).toBe(
    1,
  );
  expect(meshes).toHaveLength(140);
  expect(
    source.getChildMeshes().every((m) => !m.isVisible && !m.isPickable),
  ).toBe(true);
  contacts[0].dispose(false, false);
  expect(meshes[1].isDisposed()).toBe(false);
  expect((meshes[1] as InstancedMesh).sourceMesh.geometry).toBeDefined();
  parent.dispose(false, false);
  source.dispose(false, true);
  expect(scene.meshes).toHaveLength(0);
  scene.dispose();
  engine.dispose();
});
test("custom-transform sources retain the clone path without changing visibility", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine),
    source = new TransformNode("source", scene),
    mesh = CreateBox("box", {}, scene);
  mesh.parent = source;
  source.setEnabled(false);
  mesh.onAfterWorldMatrixUpdateObservable.add(() => {});
  expect(createStaticAsteroidInstances(source)).toBeUndefined();
  expect(mesh.isVisible).toBe(true);
  expect(source.isEnabled(false)).toBe(false);
  scene.dispose();
  engine.dispose();
});

test("transparent submesh materials fall back before changing a source hierarchy", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine),
    source = new TransformNode("source", scene),
    mesh = CreateBox("box", {}, scene);
  mesh.parent = source;
  source.setEnabled(false);
  const transparent = new PBRMaterial("transparent", scene);
  transparent.alpha = 0.5;
  const multi = new MultiMaterial("multi", scene);
  multi.subMaterials = [transparent];
  mesh.material = multi;
  expect(createStaticAsteroidInstances(source)).toBeUndefined();
  expect(mesh.isVisible).toBe(true);
  expect(source.isEnabled(false)).toBe(false);
  scene.dispose();
  engine.dispose();
});

test("supported contact culling policy is preserved and collision-enabled sources keep clones", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine),
    source = new TransformNode("source", scene),
    mesh = CreateBox("box", {}, scene),
    parent = new TransformNode("contacts", scene);
  mesh.parent = source;
  mesh.layerMask = 2;
  mesh.cullingStrategy = 3;
  mesh.alwaysSelectAsActiveMesh = true;
  mesh.alphaIndex = 7;
  mesh.metadata = { partId: "rock" };
  source.setEnabled(false);
  const control = source.clone("control", parent)!;
  control.setEnabled(true);
  const candidate = createStaticAsteroidInstances(source)!("candidate", parent);
  const a = control.getChildMeshes()[0],
    b = candidate.getChildMeshes()[0];
  expect([
    b.layerMask,
    b.cullingStrategy,
    b.alwaysSelectAsActiveMesh,
    b.alphaIndex,
    b.metadata,
  ]).toEqual([
    a.layerMask,
    a.cullingStrategy,
    a.alwaysSelectAsActiveMesh,
    a.alphaIndex,
    a.metadata,
  ]);
  const collision = new TransformNode("collision", scene),
    box = CreateBox("collider", {}, scene);
  box.parent = collision;
  box.checkCollisions = true;
  collision.setEnabled(false);
  expect(createStaticAsteroidInstances(collision)).toBeUndefined();
  expect(box.isVisible).toBe(true);
  expect(collision.isEnabled(false)).toBe(false);
  scene.dispose();
  engine.dispose();
});

test("hidden off-camera owner batches and culls contacts independently", async () => {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  try {
    const source = new TransformNode("source", scene),
      parent = new TransformNode("contacts", scene);
    const camera = new FreeCamera("camera", new Vector3(0, 0, -50), scene);
    camera.setTarget(Vector3.Zero());
    camera.minZ = 0.1;
    camera.maxZ = 1000;
    const data = readFileSync(
      new URL(
        "../../../../assets/runtime/voxels/asteroid.glb",
        import.meta.url,
      ),
    );
    const imported = await SceneLoader.ImportMeshAsync(
      "",
      "",
      "data:model/gltf-binary;base64," + data.toString("base64"),
      scene,
      undefined,
      ".glb",
    );
    for (const mesh of imported.meshes) if (!mesh.parent) mesh.parent = source;
    source.position.x = 5000;
    source.setEnabled(false);
    const factory = createStaticAsteroidInstances(source)!,
      a = factory("a", parent),
      b = factory("b", parent);
    a.position.set(0, 0, 0);
    b.position.set(20, 0, 0);
    const evaluate = () => {
      scene.incrementRenderId();
      scene.updateTransformMatrix(true);
      (
        scene as unknown as { _evaluateActiveMeshes(): void }
      )._evaluateActiveMeshes();
      const shape = a
          .getChildMeshes()
          .find((m) => m instanceof InstancedMesh) as InstancedMesh,
        batch = shape.sourceMesh._getInstancesRenderList(0),
        active = scene.getActiveMeshes();
      return {
        instanceCount: batch.visibleInstances[0]?.length ?? 0,
        renderSelf: batch.renderSelf[0],
        activeInstances: active.data
          .slice(0, active.length)
          .filter((m) => m instanceof InstancedMesh).length,
      };
    };
    expect(evaluate()).toEqual({
      instanceCount: 2,
      renderSelf: false,
      activeInstances: 2,
    });
    const hit = scene.pickWithRay(
      new Ray(camera.position, Vector3.Forward(), 100),
    );
    expect(hit?.pickedMesh).toBeInstanceOf(InstancedMesh);
    expect(a.getChildMeshes()).toContain(hit?.pickedMesh);
    b.setEnabled(false);
    expect(evaluate()).toEqual({
      instanceCount: 1,
      renderSelf: false,
      activeInstances: 1,
    });
  } finally {
    scene.dispose();
    engine.dispose();
  }
});
