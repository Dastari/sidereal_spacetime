import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import { expect, test } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { createPlanetShadows } from "./planet-shadows";
test("hero shadow allocation is isolated, nearest-only and restores primary light exclusions", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  new FreeCamera("camera", new Vector3(0, 0, -5), scene);
  const primary = new DirectionalLight(
    "primary",
    new Vector3(-0.6, -1, 0.45),
    scene,
  );
  const ship = CreateBox("ship", {}, scene);
  primary.excludedMeshes = [ship];
  const candidates = [0, 50].map((x, i) => {
    const node = new TransformNode("body" + i, scene);
    node.position.x = x;
    const surface = CreateBox("surface" + i, {}, scene);
    surface.parent = node;
    surface.metadata = { role: "planet", style: i === 1 ? "ice" : "temperate" };
    surface.material = new PBRMaterial("pbr" + i, scene);
    return { node, radius: 1, lod: 0, surface };
  });
  const manager = createPlanetShadows(scene);
  manager.setPrimaryLight(primary);
  manager.update(candidates);
  const key = scene.getLightByName("planet-hero-key") as DirectionalLight;
  expect(key.includedOnlyMeshes).toHaveLength(1);
  expect(key.includedOnlyMeshes[0]).toBe(candidates[0].surface);
  expect(primary.excludedMeshes.map((m) => m.uniqueId)).toEqual([
    ship.uniqueId,
    candidates[0].surface.uniqueId,
  ]);
  expect(key.getShadowGenerator()?.getShadowMap()?.getSize().width).toBe(1024);
  expect((key.getShadowGenerator() as ShadowGenerator).normalBias).toBeCloseTo(
    0.0008,
  );
  manager.update([{ ...candidates[1], lod: 0 }]);
  expect(primary.excludedMeshes.map((m) => m.uniqueId)).toEqual([
    ship.uniqueId,
    candidates[1].surface.uniqueId,
  ]);
  expect(candidates[0].surface.receiveShadows).toBe(false);
  expect((key.getShadowGenerator() as ShadowGenerator).normalBias).toBeCloseTo(
    0.003,
  );
  manager.update([candidates[0]]);
  expect((key.getShadowGenerator() as ShadowGenerator).normalBias).toBeCloseTo(
    0.0008,
  );
  manager.update([
    { node: new TransformNode("gas-no-pbr", scene), radius: 1, lod: 0 },
  ]);
  expect(key.isEnabled()).toBe(false);
  expect(primary.excludedMeshes.map((m) => m.uniqueId)).toEqual([
    ship.uniqueId,
  ]);
  manager.dispose();
  scene.dispose();
  engine.dispose();
});

test("semantic shadows follow active descendants across same-root swaps and restore light state", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  new FreeCamera("camera", new Vector3(0, 0, -5), scene);
  const primary = new DirectionalLight(
    "primary",
    new Vector3(-1, -1, 0),
    scene,
  );
  const root = new TransformNode("body", scene);
  const levels = [0, 1, 2].map(() => {
    const node = new TransformNode("arbitrary-level", scene);
    node.parent = root;
    return node;
  });
  const make = (name: string, parent: TransformNode, metadata: object = {}) => {
    const mesh = CreateBox(name, {}, scene);
    mesh.parent = parent;
    mesh.material = new PBRMaterial("shared-role-independent-name", scene);
    mesh.metadata = { role: "planet", ...metadata };
    return mesh;
  };
  const current = make("smoke-closed-core-is-actually-terrain", levels[0]);
  const retained = make("retained", levels[1]);
  const pending = make("pending", levels[2]);
  levels[1].setEnabled(false);
  levels[2].setEnabled(false);
  const smoke = make("renamed-a", levels[0], {
    planetWeather: true,
    planetShadow: { cast: false, receive: true },
  });
  const core = make("renamed-b", levels[0], {
    planetShadow: { cast: false, receive: true },
  });
  const cloud = make("renamed-c", levels[0], { planetWeather: true });
  const noReceive = make("effect", levels[0], {
    planetShadow: { cast: true, receive: false },
  });
  const unrelated = make("nonplanet", levels[0], { role: "crew" });
  const hidden = make("hidden", levels[0]);
  hidden.isVisible = false;
  const zeroVisibility = make("zero", levels[0]);
  zeroVisibility.visibility = 0;
  cloud.receiveShadows = true;
  primary.excludedMeshes = [unrelated, cloud];
  const manager = createPlanetShadows(scene);
  manager.setPrimaryLight(primary);
  const update = () => manager.update([{ node: root, radius: 1, lod: 0 }]);
  const key = scene.getLightByName("planet-hero-key") as DirectionalLight;
  const casters = () => key.getShadowGenerator()!.getShadowMap()!.renderList!;
  try {
    update();
    expect(key.includedOnlyMeshes.map((m) => m.uniqueId).sort()).toEqual(
      [current, smoke, core, cloud, noReceive].map((m) => m.uniqueId).sort(),
    );
    expect(
      casters()
        .map((m) => m.uniqueId)
        .sort(),
    ).toEqual([current, cloud, noReceive].map((m) => m.uniqueId).sort());
    expect(smoke.receiveShadows).toBe(true);
    expect(core.receiveShadows).toBe(true);
    expect(noReceive.receiveShadows).toBe(false);
    expect(casters()).not.toContain(pending);
    // Preparing an unchanged disabled level must not remove the current caster.
    update();
    expect(casters()).toContain(current);
    levels[0].setEnabled(false);
    levels[1].setEnabled(true);
    update();
    expect(key.includedOnlyMeshes.map((m) => m.uniqueId)).toEqual([
      retained.uniqueId,
    ]);
    expect(casters().map((m) => m.uniqueId)).toEqual([retained.uniqueId]);
    expect(current.receiveShadows).toBe(false);
    expect(cloud.receiveShadows).toBe(true);
    expect(primary.excludedMeshes.map((m) => m.uniqueId)).toEqual([
      unrelated.uniqueId,
      cloud.uniqueId,
      retained.uniqueId,
    ]);
    // A ready retained level can be revisited without allocating another body.
    levels[1].setEnabled(false);
    levels[0].setEnabled(true);
    update();
    expect(casters()).toContain(current);
    primary.setEnabled(false);
    update();
    expect(key.isEnabled()).toBe(false);
    expect(key.includedOnlyMeshes).toHaveLength(0);
    expect(casters()).toHaveLength(0);
    expect(primary.excludedMeshes.map((m) => m.uniqueId)).toEqual([
      unrelated.uniqueId,
      cloud.uniqueId,
    ]);
    primary.setEnabled(true);
    update();
    expect(key.isEnabled()).toBe(true);
    root.setEnabled(false);
    update();
    expect(key.isEnabled()).toBe(false);
    root.setEnabled(true);
    update();
    levels[0].setEnabled(false);
    update();
    expect(key.isEnabled()).toBe(false);
    expect(primary.excludedMeshes.map((m) => m.uniqueId)).toEqual([
      unrelated.uniqueId,
      cloud.uniqueId,
    ]);
  } finally {
    manager.dispose();
    scene.dispose();
    engine.dispose();
  }
});
