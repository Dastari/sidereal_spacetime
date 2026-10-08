import { afterEach, expect, test, vi } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Plane } from "@babylonjs/core/Maths/math.plane";
import { Scene } from "@babylonjs/core/scene";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { MultiMaterial } from "@babylonjs/core/Materials/multiMaterial";
import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial";
import { MaterialPluginBase } from "@babylonjs/core/Materials/materialPluginBase";
import { Skeleton } from "@babylonjs/core/Bones/skeleton";
import { MorphTargetManager } from "@babylonjs/core/Morph/morphTargetManager";
import { BakedVertexAnimationManager } from "@babylonjs/core/BakedVertexAnimation/bakedVertexAnimationManager";
import "@babylonjs/core/Meshes/thinInstanceMesh";
import "@babylonjs/core/Meshes/instancedMesh";
import {
  TemporalInstanceAttributes,
  prepareTemporalInstanceAttributes,
} from "./temporal-instance-attributes";
import { createTransmissionCaptureFilter } from "./transmission-capture";

const fixtures: { engine: NullEngine; scene: Scene }[] = [];
afterEach(() => {
  for (const { engine, scene } of fixtures.splice(0)) {
    scene.dispose();
    engine.dispose();
  }
});
function setup() {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  engine.getCaps().instancedArrays = true;
  fixtures.push({ engine, scene });
  scene.setTransformMatrix(
    Matrix.LookAtLH(new Vector3(0, 0, -10), Vector3.Zero(), Vector3.Up()),
    Matrix.OrthoLH(10, 10, 0.1, 100),
  );
  const rawFilter = createTransmissionCaptureFilter(scene, null);
  const filter: typeof rawFilter = function (this: unknown, ...args) {
    scene.incrementRenderId();
    return rawFilter.apply(this, args);
  };
  const box = (name: string, x = 0) => {
    const mesh = CreateBox(name, {}, scene);
    mesh.position.x = x;
    mesh.material = new PBRMaterial(name, scene);
    prepareTemporalInstanceAttributes(scene, [mesh.material]);
    mesh.computeWorldMatrix(true);
    return mesh;
  };
  return { scene, filter, box };
}

test("keeps intersecting/touching boxes in order and respects the valid list prefix", () => {
  const { filter, box } = setup(),
    a = box("inside"),
    b = box("outside", 20),
    c = box("intersecting", 5.25),
    d = box("touching", 5.5),
    tail = box("unused");
  expect(filter(0, [a, b, c, d, tail], 4)).toEqual([a, c, d]);
});

test("updates camera, door and parent transforms without cached membership", () => {
  const { scene, filter, box } = setup(),
    parent = new TransformNode("ship", scene),
    door = box("door");
  door.parent = parent;
  expect(filter(0, [door], 1)).toEqual([door]);
  parent.position.x = 20;
  expect(filter(0, [door], 1)).toEqual([]);
  scene.setTransformMatrix(
    Matrix.LookAtLH(
      new Vector3(20, 0, -10),
      new Vector3(20, 0, 0),
      Vector3.Up(),
    ),
    Matrix.OrthoLH(10, 10, 0.1, 100),
  );
  expect(filter(0, [door], 1)).toEqual([door]);
  door.position.x = 20;
  expect(filter(0, [door], 1)).toEqual([]);
});

test("checks hardware instances separately from a hidden detached source", () => {
  const { filter, box } = setup(),
    source = box("source", 30);
  source.isVisible = false;
  const inside = source.createInstance("inside"),
    outside = source.createInstance("outside");
  inside.position.x = 0;
  outside.position.x = 30;
  expect(filter(0, [source, outside, inside], 3)).toEqual([inside]);
  inside.position.x = 30;
  outside.position.x = 0;
  expect(filter(0, [source, outside, inside], 3)).toEqual([outside]);
});

test.each([1, -1])(
  "world boxes retain visible rotated nonuniform geometry (scale sign %s)",
  (sign) => {
    const { scene, filter } = setup(),
      parent = new TransformNode("mirrored-ship", scene);
    parent.rotation.y = Math.PI / 4;
    parent.scaling.set(sign * 10, 1, 1);
    const normal = new Vector3(Math.SQRT1_2, 0, -Math.SQRT1_2);
    parent.position.copyFrom(normal.scale(-4));
    const mesh = CreateBox(
      "long-narrow",
      { width: 1, height: 0.02, depth: 0.02 },
      scene,
    );
    mesh.parent = parent;
    mesh.computeWorldMatrix(true);
    Object.defineProperty(scene, "frustumPlanes", {
      get: () =>
        Array.from(
          { length: 6 },
          () => new Plane(normal.x, normal.y, normal.z, 0),
        ),
    });
    expect(mesh.isInFrustum(scene.frustumPlanes)).toBe(false);
    expect(
      mesh.getBoundingInfo().boundingBox.isInFrustum(scene.frustumPlanes),
    ).toBe(true);
    expect(filter(0, [mesh], 1)).toEqual([mesh]);
  },
);

test("delegates the original callback receiver/arguments and preserves selected/null semantics", () => {
  const { scene, box } = setup(),
    a = box("inside"),
    b = box("outside", 20),
    receiver = { tag: "object-renderer" };
  const prior = vi.fn(function (
    this: unknown,
    face: number,
    list: unknown,
    length: number,
  ) {
    expect(this).toBe(receiver);
    expect([face, list, length]).toEqual([2, [a, b], 1]);
    return [b, a];
  });
  expect(
    createTransmissionCaptureFilter(scene, prior).call(receiver, 2, [a, b], 1),
  ).toEqual([a]);
  expect(
    createTransmissionCaptureFilter(scene, () => null)(0, [a, b], 1),
  ).toEqual([a]);
  expect(
    createTransmissionCaptureFilter(scene, () => [])(0, [a, b], 2),
  ).toEqual([]);
  expect(createTransmissionCaptureFilter(scene, null)(0, null, 0)).toBeNull();
});

test("fails open for missing/nonfinite planes and honours global skip-frustum mode", () => {
  const { scene, filter, box } = setup(),
    mesh = box("outside", 20);
  scene.skipFrustumClipping = true;
  expect(filter(0, [mesh], 1)).toBeNull();
  scene.skipFrustumClipping = false;
  Object.defineProperty(scene, "frustumPlanes", {
    configurable: true,
    get: () => [],
  });
  expect(filter(0, [mesh], 1)).toBeNull();
  Object.defineProperty(scene, "frustumPlanes", {
    get: () => Array.from({ length: 6 }, () => new Plane(NaN, 0, 0, 0)),
  });
  expect(filter(0, [mesh], 1)).toBeNull();
});

test("keeps exceptional/deformed/aggregate bounds and rejects disabled meshes upstream would skip", () => {
  const { scene, filter, box } = setup();
  const active = box("active", 20);
  active.alwaysSelectAsActiveMesh = true;
  const far = box("ignore-far", 20);
  far.ignoreCameraMaxZ = true;
  const stale = box("stale", 20);
  stale.doNotSyncBoundingInfo = true;
  const skin = box("skin", 20);
  skin.skeleton = new Skeleton("skeleton", "skeleton", scene);
  const morph = box("morph", 20);
  morph.morphTargetManager = new MorphTargetManager(scene);
  const baked = box("baked", 20);
  baked.bakedVertexAnimationManager = new BakedVertexAnimationManager(scene);
  const thin = box("thin", 20);
  thin.thinInstanceAdd(Matrix.Identity());
  expect(thin.hasThinInstances).toBe(true);
  const bad = box("bad");
  bad.position.x = NaN;
  const hidden = box("hidden");
  hidden.setEnabled(false);
  const list = [active, far, stale, skin, morph, baked, thin, bad, hidden];
  expect(filter(0, list, list.length)?.map((mesh) => mesh.name)).toEqual(
    list.slice(0, -1).map((mesh) => mesh.name),
  );
});

test("preserves mixed-material ownership and layer masks, keeps custom vertex shader/plugin bounds", () => {
  const { scene, filter, box } = setup(),
    mixed = box("mixed", 20),
    multi = new MultiMaterial("mixed-material", scene),
    glass = new PBRMaterial("glass", scene);
  glass.subSurface.isRefractionEnabled = true;
  multi.subMaterials = [mixed.material, glass];
  mixed.material = multi;
  const originalMaterials = multi.subMaterials.map(
    (material) => material?.uniqueId,
  );
  expect(filter(0, [mixed], 1)).toEqual([]);
  expect(multi.subMaterials.map((material) => material?.uniqueId)).toEqual(
    originalMaterials,
  );
  expect(glass.subSurface.isRefractionEnabled).toBe(true);
  const masked = box("masked");
  masked.layerMask = 0;
  expect(filter(0, [masked], 1)).toEqual([masked]);
  expect(masked.layerMask).toBe(0);
  const custom = box("custom", 20);
  custom.material = new ShaderMaterial("custom", scene, "custom", {});
  const resolved = box("resolved", 20);
  resolved.material!.customShaderNameResolve = () => "deformed";
  const plugin = box("plugin", 20);
  new MaterialPluginBase(plugin.material!, "custom-displacement", 200, {});
  expect(filter(0, [custom, resolved, plugin], 3)).toEqual([
    custom,
    resolved,
    plugin,
  ]);
});

test("retains locked bounds after geometry moves and unknown shader subclasses/default materials", () => {
  const { scene, filter, box } = setup(),
    locked = box("locked", 20);
  locked.getBoundingInfo().isLocked = true;
  locked.position.x = 0;
  expect(filter(0, [locked], 1)).toEqual([locked]);
  const materialLess = box("default", 20);
  materialLess.material = null;
  scene.defaultMaterial = new ShaderMaterial(
    "deformed-default",
    scene,
    "deformed",
    {},
  );
  expect(filter(0, [materialLess], 1)).toEqual([materialLess]);
  class DisplacedPBR extends PBRMaterial {}
  const subclass = box("material-subclass", 20);
  subclass.material = new DisplacedPBR("custom-derived", scene);
  expect(filter(0, [subclass], 1)).toEqual([subclass]);
  class DerivedTemporal extends TemporalInstanceAttributes {}
  const plugin = box("plugin-subclass", 20);
  plugin.material = new PBRMaterial("new-plugin-host", scene);
  new DerivedTemporal(plugin.material as PBRMaterial);
  expect(filter(0, [plugin], 1)).toEqual([plugin]);
});
