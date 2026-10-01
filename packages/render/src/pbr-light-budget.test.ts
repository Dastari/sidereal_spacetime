import { afterEach, expect, test, vi } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { MultiMaterial } from "@babylonjs/core/Materials/multiMaterial";
import { MaterialDefines } from "@babylonjs/core/Materials/materialDefines";
import type { Effect } from "@babylonjs/core/Materials/effect";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { PointLight } from "@babylonjs/core/Lights/pointLight";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { toneCrewEmissive } from "./crew/voxel-crew-outfit";
import { createStaticMaterialFreeze } from "./static-material-freeze";
import { createPrefabShipView } from "./prefab-ship/ship-view";
import { prefabById } from "@sidereal/content/prefabs";
import { defaultPrefabComponentCatalog } from "@sidereal/content/ship-prefab-catalog";
import {
  createPbrLightBudget,
  pbrLightCapabilities,
  pbrLightLimit,
  protectPbrLight,
  registerLocalPbrLight,
  setPbrLightBudget,
} from "./pbr-light-budget";

const scenes: Scene[] = [];
afterEach(() => {
  for (const scene of scenes.splice(0)) {
    const engine = scene.getEngine();
    scene.dispose();
    engine.dispose();
  }
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function setup(knownCaps = true) {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  scenes.push(scene);
  const getParameter = vi.fn((key: number) => ({ 1: 12, 2: 12, 3: 24 })[key]);
  const gl = {
    MAX_VERTEX_UNIFORM_BLOCKS: 1,
    MAX_FRAGMENT_UNIFORM_BLOCKS: 2,
    MAX_UNIFORM_BUFFER_BINDINGS: 3,
    getParameter,
  };
  const getContext = vi.fn(() => gl);
  if (knownCaps)
    vi.spyOn(engine, "getRenderingCanvas").mockReturnValue({
      getContext,
    } as unknown as HTMLCanvasElement);
  const mesh = CreateBox("ship", {}, scene);
  const material = new PBRMaterial("primary", scene);
  mesh.material = material;
  setPbrLightBudget(material, 8);
  const budget = createPbrLightBudget(scene);
  return { scene, mesh, material, budget, getParameter, getContext };
}
function global(scene: Scene, order: number) {
  const light = new HemisphericLight(`global-${order}`, Vector3.Up(), scene);
  light.shadowEnabled = false;
  protectPbrLight(light, order);
  return light;
}
function local(scene: Scene, id: string, x: number) {
  const light = new PointLight(id, new Vector3(x, 0, 0), scene);
  light.range = 10;
  registerLocalPbrLight(light, id);
  return light;
}
const focus = new Vector3(0, 0, 0);

test("stock backend reservations constrain eight lights without changing caps", () => {
  expect(
    pbrLightLimit({
      backend: "webgl2",
      vertexBlocks: 12,
      fragmentBlocks: 12,
      bindingPoints: 24,
    }),
  ).toBe(8);
  expect(
    pbrLightLimit({
      backend: "webgl2",
      vertexBlocks: 9,
      fragmentBlocks: 12,
      bindingPoints: 24,
    }),
  ).toBe(7);
  expect(
    pbrLightLimit({
      backend: "webgl2",
      vertexBlocks: 12,
      fragmentBlocks: 7,
      bindingPoints: 24,
    }),
  ).toBe(5);
  expect(
    pbrLightLimit({
      backend: "webgl2",
      vertexBlocks: 12,
      fragmentBlocks: 12,
      bindingPoints: 6,
    }),
  ).toBe(4);
  expect(pbrLightLimit({ backend: "webgpu", stageBlocks: 12 })).toBe(8);
  expect(pbrLightLimit({ backend: "webgpu", stageBlocks: 8 })).toBe(4);
  expect(pbrLightLimit({ backend: "webgpu", stageBlocks: 4 })).toBe(0);
  expect(
    pbrLightLimit({
      backend: "webgl2",
      vertexBlocks: 2,
      fragmentBlocks: 12,
      bindingPoints: 24,
    }),
  ).toBe(0);
  for (const stageBlocks of [undefined, NaN, Infinity, 0, -1, 8.5])
    expect(pbrLightLimit({ backend: "webgpu", stageBlocks })).toBe(4);
  expect(pbrLightLimit({ backend: "unknown" })).toBe(4);
});

test("reads the existing WebGL context once and uses a safe missing-cap fallback", () => {
  const a = setup();
  expect(pbrLightCapabilities(a.scene.getEngine())).toEqual({
    backend: "webgl2",
    vertexBlocks: 12,
    fragmentBlocks: 12,
    bindingPoints: 24,
  });
  a.budget.update(focus);
  setPbrLightBudget(a.material, 12);
  expect(a.getContext).toHaveBeenCalledExactlyOnceWith("webgl2");
  expect(a.getParameter).toHaveBeenCalledTimes(3);
  const b = setup(false);
  expect(b.budget.limit).toBe(4);
  expect(b.material.maxSimultaneousLights).toBe(4);
});

test("protected globals beat actual shadow-priority locals, with four nearest tasks", () => {
  const { scene, mesh, budget } = setup();
  const tasks = Array.from({ length: 8 }, (_, i) =>
    local(scene, `room-${i}`, 8 - i),
  );
  tasks[0].shadowEnabled = true;
  tasks[0].renderPriority = 100;
  const globals = [3, 1, 0, 2].map((i) => global(scene, i));
  scene.sortLightsByPriority();
  expect(budget.update(focus)).toBe(true);
  expect(mesh.lightSources.slice(0, 4)).toEqual([
    globals[2],
    globals[1],
    globals[3],
    globals[0],
  ]);
  expect(mesh.lightSources.slice(4, 8)).toEqual(tasks.slice(4).reverse());
  expect(tasks.every((l) => l.isEnabled())).toBe(true);
  expect(tasks[0].shadowEnabled).toBe(true);
  expect(globals.every((l) => !l.shadowEnabled)).toBe(true);
});

test("restores protected order after Babylon resync, and includes late meshes", () => {
  const { scene, mesh, budget } = setup();
  const task = local(scene, "task", 0),
    key = global(scene, 0);
  budget.update(focus);
  task.shadowEnabled = true;
  task.renderPriority = 100;
  mesh._resyncLightSources();
  expect(mesh.lightSources[0]).toBe(task);
  const late = CreateBox("late helmet", {}, scene);
  late.material = new PBRMaterial("late", scene);
  expect(budget.update(focus)).toBe(true);
  expect(mesh.lightSources[0]).toBe(key);
  expect(late.lightSources[0]).toBe(key);
});

test("preserves lower requests but owned late outfits request bounded eight", () => {
  const { scene, mesh, material, budget } = setup();
  material.maxSimultaneousLights = 2;
  budget.update(focus);
  expect(material.maxSimultaneousLights).toBe(2);
  material.maxSimultaneousLights = 0;
  budget.update(focus);
  expect(material.maxSimultaneousLights).toBe(0);
  const zeroSetter = vi.spyOn(material, "maxSimultaneousLights", "set");
  budget.update(focus);
  expect(zeroSetter).not.toHaveBeenCalled();
  const late = CreateBox("head", {}, scene),
    imported = new PBRMaterial("primary", scene);
  late.material = imported;
  expect(imported.maxSimultaneousLights).toBe(4);
  toneCrewEmissive([late]);
  expect(imported.maxSimultaneousLights).toBe(8);
  imported.maxSimultaneousLights = 12;
  budget.update(focus);
  expect(imported.maxSimultaneousLights).toBe(8);
  imported.maxSimultaneousLights = 2;
  budget.update(focus);
  expect(imported.maxSimultaneousLights).toBe(2);
  expect(mesh.material).toBe(material);
});

test("clamps detached prototype materials and dirty-marks their actual shader once", () => {
  const { scene, mesh: source, material, budget } = setup();
  const a = source.createInstance("instance-a"),
    b = source.createInstance("instance-b");
  scene.removeMesh(source);
  scene.removeMaterial(material);
  material.maxSimultaneousLights = 12;
  const defines = new MaterialDefines();
  defines.markAsProcessed();
  source.subMeshes[0].setEffect({ isReady: () => true } as Effect, defines);
  const dirty = vi.spyOn(source, "_markSubMeshesAsLightDirty");
  const task = local(scene, "room", 0),
    key = global(scene, 0);
  task.renderPriority = 100;
  budget.update(focus);
  expect(material.maxSimultaneousLights).toBe(8);
  expect(a.lightSources).toBe(source.lightSources);
  expect(b.lightSources.slice(0, 2)).toEqual([key, task]);
  expect(dirty).toHaveBeenCalledTimes(1);
  expect(defines.isDirty).toBe(true);
  source.subMeshes[0].setEffect(null);
  source.dispose();
});

test("multi-materials outside scene.materials cannot escape later cap leases", () => {
  const { scene, mesh, material, budget } = setup();
  const multi = new MultiMaterial("container", scene),
    other = new PBRMaterial("metal", scene);
  multi.subMaterials = [material, other];
  mesh.material = multi;
  scene.removeMaterial(other);
  other.maxSimultaneousLights = 12;
  material.maxSimultaneousLights = 2;
  budget.update(focus);
  expect(other.maxSimultaneousLights).toBe(8);
  expect(material.maxSimultaneousLights).toBe(2);
});

test("a later cap raise invalidates the detached frozen source even with unchanged lights", () => {
  const { scene, mesh: source, material, budget } = setup();
  const instance = source.createInstance("placed");
  source.metadata = { role: "hull" };
  instance.metadata = { role: "hull", partId: "placed" };
  scene.removeMesh(source);
  scene.removeMaterial(material);
  global(scene, 0);
  budget.update(focus);
  const defines = new MaterialDefines();
  defines.markAsProcessed();
  source.subMeshes[0].setEffect(
    { isReady: () => true, dispose: () => {} } as unknown as Effect,
    defines,
  );
  const freeze = createStaticMaterialFreeze(scene);
  freeze.prepare();
  scene.onBeforeRenderObservable.notifyObservers(scene);
  scene.onAfterRenderObservable.notifyObservers(scene);
  expect(material.isFrozen).toBe(true);
  material.maxSimultaneousLights = 12;
  // Prove the controller handles a stale compiled prototype, independently of
  // Babylon setters that only walk currently attached Scene mesh lists.
  defines.markAsProcessed();
  expect(budget.update(focus)).toBe(true);
  expect(material.maxSimultaneousLights).toBe(8);
  expect(defines.isDirty).toBe(true);
  freeze.prepare();
  scene.onBeforeRenderObservable.notifyObservers(scene);
  expect(material.isFrozen).toBe(false);
  freeze.dispose();
  source.subMeshes[0].setEffect(null);
  source.dispose();
});

test("does not change authored receivers, power or shadow decisions", () => {
  const { scene, mesh, budget } = setup();
  const key = global(scene, 0),
    excluded = global(scene, 1),
    off = local(scene, "off", 0);
  excluded.excludedMeshes = [mesh];
  off.setEnabled(false);
  const only = local(scene, "only", 1),
    other = CreateBox("other", {}, scene);
  only.includedOnlyMeshes = [other];
  const enabled = vi.spyOn(off, "setEnabled");
  budget.update(focus);
  expect(mesh.lightSources).toEqual([key]);
  expect(other.lightSources).toContain(only);
  expect(enabled).not.toHaveBeenCalled();
  off.setEnabled(true);
  budget.update(focus);
  expect(mesh.lightSources).toEqual([key, off]);
  expect(excluded.excludedMeshes).toHaveLength(1);
  expect(excluded.excludedMeshes[0]).toBe(mesh);
  expect(only.includedOnlyMeshes).toHaveLength(1);
  expect(only.includedOnlyMeshes[0]).toBe(other);
});

test("stable owner ties ignore creation order and parent motion uses current world position", () => {
  const { scene, mesh, budget } = setup();
  const z = local(scene, "owner-z", 0),
    a = local(scene, "owner-a", 0);
  const parent = new TransformNode("ship", scene);
  a.parent = parent;
  budget.update(focus);
  expect(mesh.lightSources).toEqual([a, z]);
  parent.position.x = 100;
  budget.update(focus);
  expect(mesh.lightSources).toEqual([z, a]);
});

test("owner replacement and same-prefab instances dispose independently", () => {
  const { scene, mesh, budget } = setup();
  const one = local(scene, "ship-a:room-bridge", 0),
    two = local(scene, "ship-b:room-bridge", 1);
  expect(() => registerLocalPbrLight(two, "ship-a:room-bridge")).toThrow(
    /Duplicate/,
  );
  one.dispose();
  const replacement = local(scene, "ship-a:room-bridge", 2);
  budget.update(focus);
  expect(mesh.lightSources).toEqual([two, replacement]);
  replacement.dispose();
  budget.update(focus);
  expect(mesh.lightSources).toEqual([two]);
});

test("stationary frames do not dirty effects or rewrite light enable state", () => {
  const { scene, mesh, budget } = setup();
  global(scene, 0);
  const task = local(scene, "task", 0);
  budget.update(focus);
  const dirty = vi.spyOn(mesh, "_markSubMeshesAsLightDirty"),
    enable = vi.spyOn(task, "setEnabled");
  for (let i = 0; i < 10; i++) expect(budget.update(focus)).toBe(false);
  expect(dirty).not.toHaveBeenCalled();
  expect(enable).not.toHaveBeenCalled();
  budget.dispose();
  task.setEnabled(false);
  dirty.mockClear();
  expect(budget.update(focus)).toBe(false);
  expect(dirty).not.toHaveBeenCalled();
});

test("changing the effective local selection invalidates frozen shared PBR effects", () => {
  const { scene, mesh, material, budget } = setup();
  mesh.metadata = { role: "hull", partId: "hull" };
  material.maxSimultaneousLights = 1;
  local(scene, "near", 0);
  local(scene, "far", 100);
  budget.update(focus);
  const defines = new MaterialDefines();
  defines.markAsProcessed();
  mesh.subMeshes[0].setEffect({ isReady: () => true } as Effect, defines);
  const freeze = createStaticMaterialFreeze(scene);
  freeze.prepare();
  scene.onBeforeRenderObservable.notifyObservers(scene);
  scene.onAfterRenderObservable.notifyObservers(scene);
  expect(material.isFrozen).toBe(true);
  expect(budget.update(new Vector3(100, 0, 0))).toBe(true);
  freeze.prepare();
  scene.onBeforeRenderObservable.notifyObservers(scene);
  expect(material.isFrozen).toBe(false);
  expect(defines.isDirty).toBe(true);
  freeze.dispose();
  mesh.subMeshes[0].setEffect(null);
});

test("one scene owner is enforced and policy replacement retains live lamp ownership", () => {
  const { scene, mesh, budget } = setup();
  const task = local(scene, "task", 0),
    key = global(scene, 0);
  expect(() => createPbrLightBudget(scene)).toThrow(/already owns/);
  budget.dispose();
  const replacement = createPbrLightBudget(scene);
  budget.dispose();
  expect(() => createPbrLightBudget(scene)).toThrow(/already owns/);
  replacement.update(focus);
  expect(mesh.lightSources).toEqual([key, task]);
});

test("two actual Wren views rebuild and dispose without duplicate room owner IDs", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: false })),
  );
  const stub: object = new Proxy(() => stub, {
    get: (_t, key) =>
      key === "then" ? undefined : key === Symbol.toPrimitive ? () => 0 : stub,
    apply: () => stub,
  });
  vi.stubGlobal(
    "OffscreenCanvas",
    class {
      constructor(
        public width: number,
        public height: number,
      ) {}
      getContext() {
        return stub;
      }
    },
  );
  const { scene, budget } = setup();
  scene.useRightHandedSystem = true;
  const doc = prefabById("fed.s.wren")!,
    catalog = defaultPrefabComponentCatalog();
  const one = await createPrefabShipView(scene, doc, {
    catalog,
    view: "deck",
    standinComponents: true,
    roomLights: 2,
    parent: new TransformNode("ship-a", scene),
  });
  const two = await createPrefabShipView(scene, doc, {
    catalog,
    view: "deck",
    standinComponents: true,
    roomLights: 2,
    parent: new TransformNode("ship-b", scene),
  });
  const lamps = () =>
    scene.lights.filter((l) => l.name.includes(":room-light:"));
  expect(lamps()).toHaveLength(4);
  const second = lamps().slice(2);
  await one.update(doc);
  budget.update(focus);
  expect(lamps()).toHaveLength(4);
  one.dispose();
  budget.update(focus);
  expect(lamps()).toEqual(second);
  two.dispose();
  expect(lamps()).toHaveLength(0);
});
