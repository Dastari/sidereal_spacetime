import { expect, test } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import "@babylonjs/core/Meshes/thinInstanceMesh";
import { refreshShadowCasterTransforms } from "./shadow-transform-refresh";

function fixture(run: (scene: Scene) => void) {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  scene.activeCamera = new FreeCamera("camera", new Vector3(0, 5, -20), scene);
  try {
    run(scene);
  } finally {
    scene.dispose();
    engine.dispose();
  }
}
function snapshot(mesh: AbstractMesh) {
  return [
    ...mesh.getWorldMatrix().asArray(),
    ...mesh
      .getBoundingInfo()
      .boundingBox.vectorsWorld.flatMap((v) => v.asArray()),
  ];
}
function sameAsForced(meshes: AbstractMesh[]) {
  refreshShadowCasterTransforms(meshes);
  const cached = meshes.map(snapshot);
  for (const mesh of meshes) mesh.computeWorldMatrix(true);
  expect(meshes.map(snapshot)).toEqual(cached);
}

test("shared parents rebuild once and hidden banks follow same-frame transform changes", () =>
  fixture((scene) => {
    const root = new TransformNode("root", scene),
      middle = new TransformNode("middle", scene);
    middle.parent = root;
    const meshes = Array.from({ length: 20 }, (_, i) => {
      const mesh = CreateBox(String(i), {}, scene);
      mesh.parent = middle;
      mesh.position.set(i, 2, -i);
      return mesh;
    });
    meshes[1].setEnabled(false);
    meshes[2].isVisible = false;
    refreshShadowCasterTransforms(meshes);
    const rootRevision = root._childUpdateId,
      middleRevision = middle._childUpdateId;
    root.position.set(10, 20, 30);
    root.scaling.set(-2, 3, 4);
    middle.rotationQuaternion = Quaternion.RotationYawPitchRoll(0.7, 0.2, -0.3);
    middle.setPreTransformMatrix(Matrix.Translation(2, 0, 1));
    refreshShadowCasterTransforms(meshes);
    expect(root._childUpdateId - rootRevision).toBe(1);
    expect(middle._childUpdateId - middleRevision).toBe(1);
    sameAsForced(meshes);
    const nextRoot = new TransformNode("next", scene);
    nextRoot.position.set(100, -3, 12);
    meshes[1].parent = nextRoot;
    const later = CreateBox("later", {}, scene);
    later.parent = nextRoot;
    meshes.push(later);
    sameAsForced(meshes);
  }));

test("untracked scalingDeterminant and changed local bounds match forced refresh", () =>
  fixture((scene) => {
    const mesh = CreateBox("hull", {}, scene);
    mesh.computeWorldMatrix(true);
    mesh.scalingDeterminant = 2;
    expect(mesh.isSynchronized()).toBe(true);
    refreshShadowCasterTransforms([mesh]);
    expect(mesh.getWorldMatrix().m[0]).toBe(2);
    mesh.bakeTransformIntoVertices(Matrix.Scaling(4, 2, 3));
    sameAsForced([mesh]);
  }));

test("refresh does not dirty frozen caster or non-caster siblings", () =>
  fixture((scene) => {
    const root = new TransformNode("ship", scene);
    const rigid = CreateBox("rigid", {}, scene),
      frozen = CreateBox("frozen", {}, scene);
    rigid.parent = frozen.parent = root;
    frozen.position.x = 5;
    frozen.freezeWorldMatrix();
    const held = snapshot(frozen);
    root.position.x = 20;
    sameAsForced([rigid]);
    expect(snapshot(frozen)).toEqual(held);
    sameAsForced([rigid, frozen]);
    expect(snapshot(frozen)).toEqual(held);
    expect(frozen.isWorldMatrixFrozen).toBe(true);
  }));

test("custom forced fallback can mutate an ancestor already visited by an earlier caster", () =>
  fixture((scene) => {
    const root = new TransformNode("ship", scene);
    const first = CreateBox("first", {}, scene),
      custom = CreateBox("custom", {}, scene),
      last = CreateBox("last", {}, scene);
    first.parent = custom.parent = last.parent = root;
    const original = custom.computeWorldMatrix;
    custom.computeWorldMatrix = function (force, camera) {
      if (force) root.position.x = 10;
      return original.call(this, force, camera);
    };
    refreshShadowCasterTransforms([first, custom, last]);
    expect(last.getWorldMatrix().m[12]).toBe(10);
    expect(snapshot(last)).toEqual(
      (last.computeWorldMatrix(true), snapshot(last)),
    );
  }));

test("ancestor matrix callbacks retain original repeated forced behavior", () =>
  fixture((scene) => {
    const root = new TransformNode("ship", scene),
      a = CreateBox("a", {}, scene),
      b = CreateBox("b", {}, scene);
    a.parent = b.parent = root;
    let count = 0;
    root.onAfterWorldMatrixUpdateObservable.add(() => count++);
    refreshShadowCasterTransforms([a, b]);
    expect(count).toBe(2);
  }));

test("overridden stock hooks cannot leave a later shared-parent caster stale", () =>
  fixture((scene) => {
    for (const key of [
      "_markSyncedWithParent",
      "_updateNonUniformScalingState",
    ] as const) {
      const root = new TransformNode("ship", scene);
      const first = CreateBox("custom-hook", {}, scene),
        last = CreateBox("last", {}, scene);
      first.parent = last.parent = root;
      const hooks = first as unknown as Record<
        typeof key,
        (...args: unknown[]) => unknown
      >;
      const original = hooks[key];
      hooks[key] = function (...args) {
        const result = original.apply(this, args);
        root.position.x = 10;
        return result;
      };
      refreshShadowCasterTransforms([first, last]);
      expect(last.getWorldMatrix().m[12]).toBe(10);
    }
  }));

test("hardware instances and staged thin-instance bounds stay equivalent", () =>
  fixture((scene) => {
    scene.getEngine().getCaps().instancedArrays = true;
    const root = new TransformNode("ship", scene),
      source = CreateBox("source", {}, scene);
    const a = source.createInstance("a"),
      b = source.createInstance("b");
    a.parent = b.parent = root;
    a.position.x = -10;
    b.position.x = 10;
    source.thinInstanceAdd(Matrix.Identity());
    source.thinInstanceSetMatrixAt(0, Matrix.Translation(30, 0, 0), false);
    root.scaling.set(-3, 1, 2);
    sameAsForced([a, b, source]);
    b.dispose();
    expect(() => refreshShadowCasterTransforms([a, b, source])).not.toThrow();
  }));

test("billboards and camera-relative transforms keep their forced path", () =>
  fixture((scene) => {
    const root = new TransformNode("root", scene),
      mesh = CreateBox("caster", {}, scene);
    mesh.parent = root;
    for (const mode of [
      TransformNode.BILLBOARDMODE_ALL,
      TransformNode.BILLBOARDMODE_Y,
    ]) {
      root.billboardMode = mode;
      sameAsForced([mesh]);
    }
    root.billboardMode = 0;
    root.infiniteDistance = true;
    sameAsForced([mesh]);
  }));

test("thin aggregate callbacks retain forced behavior and invalidate shared ancestry", () =>
  fixture((scene) => {
    scene.getEngine().getCaps().instancedArrays = true;
    const root = new TransformNode("ship", scene);
    const first = CreateBox("first", {}, scene),
      thin = CreateBox("thin", {}, scene),
      last = CreateBox("last", {}, scene);
    first.parent = thin.parent = last.parent = root;
    thin.thinInstanceAdd(Matrix.Identity());
    const original = thin.thinInstanceRefreshBoundingInfo;
    thin.thinInstanceRefreshBoundingInfo = function (...args) {
      original.apply(this, args);
      root.position.x = 10;
    };
    refreshShadowCasterTransforms([first, thin, last]);
    expect(last.getWorldMatrix().m[12]).toBe(10);
  }));
