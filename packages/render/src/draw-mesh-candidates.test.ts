import { expect, test, vi } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import "@babylonjs/core/Meshes/instancedMesh";
import { ActionManager } from "@babylonjs/core/Actions/actionManager";
import { ExecuteCodeAction } from "@babylonjs/core/Actions/directActions";
import { createDrawMeshCandidates } from "./draw-mesh-candidates";

test("hidden banks skip readiness and bounds work and return on the first enabled frame", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  new FreeCamera("view", new Vector3(0, 0, -5), scene).setTarget(
    Vector3.Zero(),
  );
  const bank = new TransformNode("bank", scene),
    mesh = CreateBox("floor", {}, scene);
  mesh.parent = bank;
  const ready = vi.spyOn(mesh, "isReady").mockReturnValue(true);
  const bounds = vi.spyOn(mesh, "computeWorldMatrix");
  const original = scene.getActiveMeshCandidates;
  const shadowList = [mesh];
  const owner = createDrawMeshCandidates(scene);
  const evaluate = () => {
    scene.updateTransformMatrix();
    ready.mockClear();
    bounds.mockClear();
    (
      scene as unknown as { _evaluateActiveMeshes(): void }
    )._evaluateActiveMeshes();
  };
  bank.setEnabled(false);
  evaluate();
  expect(ready).not.toHaveBeenCalled();
  expect(bounds).not.toHaveBeenCalled();
  expect(scene.meshes).toContain(mesh);
  expect(shadowList).toEqual([mesh]);
  mesh.position.x = 1;
  bank.setEnabled(true);
  evaluate();
  expect(ready).toHaveBeenCalled();
  expect(bounds).toHaveBeenCalled();
  expect(mesh.getAbsolutePosition().x).toBe(1);
  expect(
    scene.getActiveMeshes().data.slice(0, scene.getActiveMeshes().length),
  ).toContain(mesh);
  mesh.isVisible = false;
  evaluate();
  expect(ready).not.toHaveBeenCalled();
  expect(bounds).not.toHaveBeenCalled();
  mesh.isVisible = true;
  mesh.visibility = 0;
  evaluate();
  expect(ready).not.toHaveBeenCalled();
  owner.dispose();
  expect(scene.getActiveMeshCandidates).toBe(original);
  scene.dispose();
  engine.dispose();
});

test("preserves upstream prefix/order, hidden instance owners and intersection side effects", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  const source = CreateBox("prototype", {}, scene),
    instance = source.createInstance("placed");
  source.isVisible = false;
  const hidden = CreateBox("hidden", {}, scene);
  hidden.isVisible = false;
  const trigger = CreateBox("trigger", {}, scene);
  trigger.isVisible = false;
  trigger.actionManager = new ActionManager(scene);
  trigger.actionManager.registerAction(
    new ExecuteCodeAction(ActionManager.OnIntersectionEnterTrigger, () => {}),
  );
  const suffix = CreateBox("outside-prefix", {}, scene);
  const upstream = {
    data: [hidden, source, instance, trigger, suffix],
    length: 4,
  };
  const previous = vi.fn(function (this: Scene) {
    expect(this).toBe(scene);
    return upstream;
  });
  scene.getActiveMeshCandidates = previous;
  let enabled = true;
  const owner = createDrawMeshCandidates(scene, () => enabled);
  const selected = scene.getActiveMeshCandidates();
  expect(selected.data).toEqual([source, instance, trigger]);
  expect(selected.length).toBe(3);
  expect(upstream.data).toEqual([hidden, source, instance, trigger, suffix]);
  const particle = { isStarted: () => true, emitter: hidden };
  scene.particleSystems.push(
    particle as unknown as Scene["particleSystems"][number],
  );
  expect(scene.getActiveMeshCandidates().data).toEqual([
    hidden,
    source,
    instance,
    trigger,
  ]);
  scene.particleSystems.length = 0;
  enabled = false;
  expect(scene.getActiveMeshCandidates()).toBe(upstream);
  enabled = true;
  const stockLOD = scene.customLODSelector;
  scene.customLODSelector = (mesh) => mesh;
  expect(scene.getActiveMeshCandidates()).toBe(upstream);
  scene.customLODSelector = stockLOD;
  // A later owner can keep our callback in its chain; disposing must fall through.
  const owned = scene.getActiveMeshCandidates;
  const later = () => owned();
  scene.getActiveMeshCandidates = later;
  owner.dispose();
  owner.dispose();
  expect(scene.getActiveMeshCandidates).toBe(later);
  expect(scene.getActiveMeshCandidates()).toBe(upstream);
  scene.dispose();
  engine.dispose();
});

test("receiver and material-use registries retain live exceptions without preparing static hidden banks", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  const visible = CreateBox("visible", {}, scene),
    hidden = CreateBox("bank", {}, scene);
  const live = CreateBox("hidden-mutable", {}, scene);
  visible.metadata = hidden.metadata = { role: "floor" };
  live.metadata = { role: "floor", mutableMaterial: true };
  hidden.setEnabled(false);
  live.isVisible = false;
  let enabled = true;
  const owner = createDrawMeshCandidates(scene, () => enabled);
  expect(owner.receivers()).toEqual([visible]);
  expect(owner.materialUses()).toEqual([visible, live]);
  hidden.setEnabled(true);
  expect(owner.receivers()).toEqual([visible, hidden]);
  expect(owner.materialUses()).toEqual([visible, hidden, live]);
  hidden.dispose();
  const late = CreateBox("late", {}, scene);
  late.metadata = { role: "equipment" };
  expect(owner.receivers()).toEqual([visible, late]);
  enabled = false;
  expect(owner.receivers()).toBe(scene.meshes);
  expect(owner.materialUses()).toBe(scene.meshes);
  owner.dispose();
  scene.dispose();
  engine.dispose();
});
