import { afterEach, expect, test, vi } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { MultiMaterial } from "@babylonjs/core/Materials/multiMaterial";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { MaterialDefines } from "@babylonjs/core/Materials/materialDefines";
import type { Effect } from "@babylonjs/core/Materials/effect";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { PointLight } from "@babylonjs/core/Lights/pointLight";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { toneCrewEmissive } from "./crew/voxel-crew-outfit";
import { createStaticMaterialFreeze } from "./static-material-freeze";
import {
  createPrefabShipView,
  createLegacyPrefabShipView,
} from "./prefab-ship/ship-view";
import { getAuthoredAssetLightSources } from "./authored-asset-lighting";
import { prefabById } from "@sidereal/content/prefabs";
import { defaultPrefabComponentCatalog } from "@sidereal/content/ship-prefab-catalog";
import {
  createPbrLightBudget,
  PBR_LIGHT_LAYOUT_WAIT,
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

test("import completion cannot compile over-budget PBR before the first frame", () => {
  const { scene, material, budget } = setup();
  for (let i = 0; i < 13; i++) local(scene, `room-${i}`, i);
  // This notification occurs during the base constructor, before PBR accessor
  // storage is initialized. Installing a guard must not read that storage.
  const late = new PBRMaterial("late-import", scene);
  const ordinary = new StandardMaterial("marker", scene);
  expect(
    Object.getOwnPropertyDescriptor(late, "maxSimultaneousLights")?.set,
  ).toBeTypeOf("function");
  const dirty = vi.spyOn(
    late as unknown as { _markAllSubMeshesAsLightsDirty(): void },
    "_markAllSubMeshesAsLightsDirty",
  );
  // Literal Babylon 9.25 glTF completion loop, before budget.update/render.
  for (const m of scene.materials) {
    if ("maxSimultaneousLights" in m) {
      const typed = m as PBRMaterial;
      typed.maxSimultaneousLights = Math.max(
        typed.maxSimultaneousLights,
        scene.lights.length,
      );
    }
  }
  expect(material.maxSimultaneousLights).toBe(8);
  expect(late.maxSimultaneousLights).toBe(8);
  expect(ordinary.maxSimultaneousLights).toBe(13);
  expect(dirty).toHaveBeenCalledTimes(1);
  late.maxSimultaneousLights = 13;
  expect(dirty).toHaveBeenCalledTimes(1);
  late.maxSimultaneousLights = 0;
  late.maxSimultaneousLights = 0;
  expect(late.maxSimultaneousLights).toBe(0);
  expect(dirty).toHaveBeenCalledTimes(2);
  late.maxSimultaneousLights = 2;
  expect(late.maxSimultaneousLights).toBe(2);
  expect(budget.limit).toBe(8);
});

test("detached frozen import guards restore only their controller's instance accessors", () => {
  const { scene, material, budget } = setup();
  const late = new PBRMaterial("detached-source", scene);
  scene.removeMaterial(late);
  late.freeze();
  late.maxSimultaneousLights = 20;
  expect(late.maxSimultaneousLights).toBe(8);
  expect(late.isFrozen).toBe(true);
  const clone = late.clone("late-clone")!;
  clone.maxSimultaneousLights = 20;
  expect(clone.maxSimultaneousLights).toBe(8);
  budget.dispose();
  expect(Object.hasOwn(material, "maxSimultaneousLights")).toBe(false);
  expect(Object.hasOwn(late, "maxSimultaneousLights")).toBe(false);
  const replacement = createPbrLightBudget(scene);
  late.maxSimultaneousLights = 18;
  expect(late.maxSimultaneousLights).toBe(8);
  expect(Object.hasOwn(late, "maxSimultaneousLights")).toBe(true);
  const replacementSet = Object.getOwnPropertyDescriptor(
    material,
    "maxSimultaneousLights",
  )?.set;
  budget.dispose();
  expect(
    Object.getOwnPropertyDescriptor(material, "maxSimultaneousLights")?.set,
  ).toBe(replacementSet);
  material.maxSimultaneousLights = 18;
  expect(material.maxSimultaneousLights).toBe(8);
  clone.dispose();
  replacement.dispose();
  expect(Object.hasOwn(material, "maxSimultaneousLights")).toBe(false);
  late.dispose();
});

test("constructor-time container imports are guarded without affecting other scenes", () => {
  const { scene, budget } = setup();
  const other = new Scene(scene.getEngine());
  scenes.push(other);
  scene._blockEntityCollection = true;
  let detached: PBRMaterial;
  try {
    detached = new PBRMaterial("container-never-added", scene);
  } finally {
    scene._blockEntityCollection = false;
  }
  expect(scene.materials).not.toContain(detached!);
  // No deferred callback, microtask, update or frame has run at this point.
  detached!.maxSimultaneousLights = 13;
  expect(detached!.maxSimultaneousLights).toBe(8);
  const foreign = new PBRMaterial("foreign-scene", other);
  foreign.maxSimultaneousLights = 13;
  expect(foreign.maxSimultaneousLights).toBe(13);
  expect(Object.hasOwn(foreign, "maxSimultaneousLights")).toBe(false);
  budget.dispose();
  const after = new PBRMaterial("after-disposal", scene);
  after.maxSimultaneousLights = 13;
  expect(after.maxSimultaneousLights).toBe(13);
  expect(Object.hasOwn(after, "maxSimultaneousLights")).toBe(false);
  detached!.dispose();
});

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
  expect(mesh.lightSources.slice(4, 8)).toEqual(tasks.slice(4));
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
  // The reordered layout is already linked, so it is adopted at once.
  vi.spyOn(material, "isReadyForSubMesh").mockReturnValue(true);
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
  material.maxSimultaneousLights = 2;
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

test("stable slots ignore creation order; over-budget admission uses current parent position", () => {
  const { scene, mesh, material, budget } = setup();
  const z = local(scene, "owner-z", 0),
    a = local(scene, "owner-a", 0);
  const parent = new TransformNode("ship", scene);
  a.parent = parent;
  budget.update(focus);
  expect(mesh.lightSources).toEqual([a, z]);
  parent.position.x = 100;
  expect(budget.update(focus)).toBe(false);
  expect(mesh.lightSources).toEqual([a, z]);
  material.maxSimultaneousLights = 1;
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
  expect(mesh.lightSources).toEqual([replacement, two]);
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
  // The reordered layout is already linked, so it is adopted at once.
  vi.spyOn(material, "isReadyForSubMesh").mockReturnValue(true);
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

test("two legacy Wren room-light views rebuild and dispose without duplicate owner IDs", async () => {
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
  const one = await createLegacyPrefabShipView(scene, doc, {
    catalog,
    view: "deck",
    standinComponents: true,
    roomLights: 2,
    parent: new TransformNode("ship-a", scene),
  });
  const two = await createLegacyPrefabShipView(scene, doc, {
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

test("two native Wren views import real assets and own independent bounded lights through rebuilds", async () => {
  const runtime = fileURLToPath(
    new URL("../../../assets/runtime/", import.meta.url),
  );
  const requests: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: unknown) => {
      const name = String(url);
      requests.push(name);
      if (!name.startsWith("/assets/")) return { ok: false };
      const path = join(runtime, name.slice(8));
      if (!existsSync(path)) return { ok: false };
      const bytes = readFileSync(path);
      return {
        ok: true,
        json: async () => JSON.parse(bytes.toString()),
        arrayBuffer: async () =>
          bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length),
      };
    }),
  );
  const stub: object = new Proxy(() => stub, {
    get: (_, key) =>
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
    parent: new TransformNode("native-a", scene),
  });
  const firstIds = new Set(
    getAuthoredAssetLightSources(scene).map((source) => source.id),
  );
  expect(firstIds.size).toBeGreaterThan(0);
  const two = await createPrefabShipView(scene, doc, {
    catalog,
    view: "deck",
    parent: new TransformNode("native-b", scene),
  });
  const ids = () =>
    getAuthoredAssetLightSources(scene)
      .map((source) => source.id)
      .sort();
  const secondIds = ids().filter((id) => !firstIds.has(id));
  expect(secondIds.length).toBe(firstIds.size);
  expect(ids()).toHaveLength(firstIds.size * 2);
  expect(new Set(ids()).size).toBe(ids().length);
  expect(one.metrics().visualRevision).toBe("template-authored-r001");
  expect(two.metrics().visualRevision).toBe("template-authored-r001");
  expect(
    requests.some(
      (url) => url.includes("/template-authored-r001/") && url.endsWith(".glb"),
    ),
  ).toBe(true);
  expect(requests.some((url) => url.includes("/ship-objects/"))).toBe(false);
  // glTF import completion sees the whole scene's lamp count; the guard must still constrain every material.
  for (const material of scene.materials)
    if (material instanceof PBRMaterial)
      expect(material.maxSimultaneousLights).toBeLessThanOrEqual(budget.limit);
  const beforeObservers = scene.onBeforeRenderObservable.observers.length;
  await one.update(doc);
  // Babylon defers physical observer removal until the next task.
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  budget.update(focus);
  expect(ids()).toHaveLength(firstIds.size * 2);
  expect(ids().filter((id) => firstIds.has(id))).toEqual([]);
  expect(ids().filter((id) => secondIds.includes(id))).toEqual(secondIds);
  expect(scene.onBeforeRenderObservable.observers.length).toBe(beforeObservers);
  one.setView("flight");
  const enabledInFlight = getAuthoredAssetLightSources(scene).filter(
    (source) => source.eligible,
  );
  expect(enabledInFlight.length).toBeGreaterThan(0);
  one.setView("deck");
  expect(ids()).toHaveLength(firstIds.size * 2);
  one.dispose();
  budget.update(focus);
  expect(ids()).toEqual(secondIds);
  two.dispose();
  expect(ids()).toEqual([]);
  expect(scene.lights).toHaveLength(0);
}, 30000);

test("camera motion keeps admitted slots and shaders stable when all receiver lights fit", () => {
  const { scene, mesh, budget } = setup();
  global(scene, 0);
  const a = local(scene, "a", -100),
    b = local(scene, "b", 100);
  budget.update(focus);
  const original = [...mesh.lightSources];
  const dirty = vi.spyOn(mesh, "_markSubMeshesAsLightDirty");
  for (const x of [-100, 100, -1, 1, 0])
    expect(budget.update(new Vector3(x, 0, 0))).toBe(false);
  expect(mesh.lightSources).toEqual(original);
  expect(mesh.lightSources).toEqual([
    scene.lights.find((l) => l.name === "global-0"),
    a,
    b,
  ]);
  expect(dirty).not.toHaveBeenCalled();
});

test("receiver-local admission cannot spend its slots on another room's lamps", () => {
  const { scene, mesh, material, budget } = setup();
  material.maxSimultaneousLights = 1;
  const ownFar = local(scene, "own-far", 100),
    ownNear = local(scene, "own-near", 10);
  for (let i = 0; i < 8; i++)
    local(scene, `excluded-${i}`, i).excludedMeshes = [mesh];
  budget.update(focus);
  expect(mesh.lightSources).toEqual([ownNear, ownFar]);
  // Small movements retain the incumbent; a genuinely closer challenger wins.
  expect(budget.update(new Vector3(12, 0, 0))).toBe(false);
  expect(budget.update(new Vector3(100, 0, 0))).toBe(true);
  expect(mesh.lightSources).toEqual([ownFar, ownNear]);
});

test("standard and mixed-cap submaterials receive relevant stable prefixes", () => {
  const { scene, mesh, material, budget } = setup();
  const far = local(scene, "a-far", 100),
    near = local(scene, "z-near", 0),
    middle = local(scene, "b-middle", 10);
  const standard = new StandardMaterial("lower-cap", scene);
  standard.maxSimultaneousLights = 1;
  mesh.material = standard;
  budget.update(focus);
  expect(mesh.lightSources[0]).toBe(near);
  expect(budget.update(new Vector3(0.01, 0, 0))).toBe(false);
  const multi = new MultiMaterial("mixed", scene);
  material.maxSimultaneousLights = 2;
  multi.subMaterials = [standard, material];
  mesh.material = multi;
  budget.update(focus);
  expect(mesh.lightSources).toEqual([near, middle, far]);
  expect(budget.update(new Vector3(0.01, 0, 0))).toBe(false);
  expect(budget.update(new Vector3(100, 0, 0))).toBe(true);
  expect(mesh.lightSources).toEqual([far, middle, near]);
  expect(standard.maxSimultaneousLights).toBe(1);
  expect(material.maxSimultaneousLights).toBe(2);
});

test("a reordered prefix waits for its compiled layout and keeps its incumbents", () => {
  const { scene, mesh, material, budget } = setup();
  material.maxSimultaneousLights = 1;
  const near = local(scene, "near", 0),
    far = local(scene, "far", 100);
  budget.update(focus);
  expect(mesh.lightSources[0]).toBe(near);
  mesh.subMeshes[0].setEffect(
    { isReady: () => true } as Effect,
    new MaterialDefines(),
  );
  // WebGL2 links a changed light layout asynchronously.
  const ready = vi.spyOn(material, "isReadyForSubMesh").mockReturnValue(false),
    dirty = vi.spyOn(mesh, "_markSubMeshesAsLightDirty");
  const away = new Vector3(100, 0, 0);
  for (let i = 0; i < 3; i++) expect(budget.update(away)).toBe(false);
  expect(mesh.lightSources.slice(0, 2)).toEqual([near, far]);
  expect(dirty).not.toHaveBeenCalled();
  expect(ready).toHaveBeenCalledTimes(3);
  // The probe is detached and saw the proposed order, not the bound one.
  expect(ready.mock.calls[0][1]).not.toBe(mesh.subMeshes[0]);
  expect(mesh.subMeshes).toHaveLength(1);
  // Returning before the layout links withdraws the proposal entirely.
  expect(budget.update(focus)).toBe(false);
  expect(ready).toHaveBeenCalledTimes(3);
  ready.mockReturnValue(true);
  expect(budget.update(away)).toBe(true);
  expect(mesh.lightSources.slice(0, 2)).toEqual([far, near]);
  expect(dirty).toHaveBeenCalledTimes(1);
  expect(budget.update(away)).toBe(false);
  budget.dispose();
  mesh.subMeshes[0].setEffect(null);
});

test("a layout that never links falls back to the stock swap, and cap changes never wait", () => {
  const { scene, mesh, material, budget } = setup();
  material.maxSimultaneousLights = 1;
  const near = local(scene, "near", 0),
    far = local(scene, "far", 100);
  budget.update(focus);
  const ready = vi.spyOn(material, "isReadyForSubMesh").mockReturnValue(false);
  const away = new Vector3(100, 0, 0);
  // A receiver that has never drawn has no linked shader to protect.
  expect(budget.update(away)).toBe(true);
  expect(budget.update(focus)).toBe(true);
  expect(ready).not.toHaveBeenCalled();
  mesh.subMeshes[0].setEffect(
    { isReady: () => true } as Effect,
    new MaterialDefines(),
  );
  for (let i = 0; i < PBR_LIGHT_LAYOUT_WAIT; i++)
    expect(budget.update(away)).toBe(false);
  expect(mesh.lightSources[0]).toBe(near);
  expect(budget.update(away)).toBe(true);
  expect(mesh.lightSources[0]).toBe(far);
  // A changed cap needs its own shader whatever order the lights are in.
  ready.mockClear();
  material.maxSimultaneousLights = 2;
  expect(budget.update(away)).toBe(true);
  material.maxSimultaneousLights = 1;
  expect(budget.update(focus)).toBe(true);
  expect(mesh.lightSources[0]).toBe(near);
  expect(ready).not.toHaveBeenCalled();
  budget.dispose();
  mesh.subMeshes[0].setEffect(null);
});
