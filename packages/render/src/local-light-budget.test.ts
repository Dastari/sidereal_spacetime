import { describe, expect, test, vi } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { PointLight } from "@babylonjs/core/Lights/pointLight";
import { SpotLight } from "@babylonjs/core/Lights/spotLight";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { createGraphicsSettings } from "./graphics-settings";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { createEquipmentLighting } from "./equipment-lighting";
import { createShipLighting } from "./ship-lighting";
import { createCabinVisibility } from "./cabin-visibility";
import {
  createLocalLightBudget,
  LOCAL_LIGHT_STORAGE_KEY,
  normalizeLocalLightLimit,
  selectLocalLights,
  type LocalLightCandidate,
  type ManagedLocalLight,
} from "./local-light-budget";

const frame = { focus: { x: 0, y: 0, z: 0 } };
const candidate = (
  id: string,
  x = 0,
  extra: Partial<LocalLightCandidate> = {},
): LocalLightCandidate => ({
  id,
  position: { x, y: 0, z: 0 },
  range: 2,
  eligible: true,
  requiresShadow: false,
  shadowEligible: true,
  ...extra,
});

describe("existing light-owner adapters", () => {
  test("equipment power and cabin writes cannot re-enable a budget-suppressed light between frames", () => {
    const engine = new NullEngine(),
      scene = new Scene(engine),
      parent = new TransformNode("placement-tray", scene);
    parent.metadata = { partId: "equipment-tray" };
    const mesh = CreateBox("GEO-equipment-tray", {}, scene);
    mesh.parent = parent;
    const rig = createEquipmentLighting(scene, parent, [
      {
        position: [0.4, 0.1, 1.5],
        direction: [0, 0, -1],
        color: [1, 1, 1],
        intensity: 1,
        range: 2,
        angle: 1,
      },
    ]);
    rig.setMeshes([mesh]);
    const actor = new TransformNode("actor", scene);
    const visibility = createCabinVisibility(
      [mesh],
      actor,
      [{ node: parent, lighting: rig }],
      new Set(["equipment-tray"]),
    );
    const budget = createLocalLightBudget();
    budget.setLimit(0);
    budget.update(rig.getLocalLightSources(), frame);
    const sink = rig.getLocalLightSources()[0].apply;
    const setter = vi.spyOn(rig.lights[0], "setEnabled");
    visibility.update(true, [{ placementId: "equipment-tray", enabled: true }]);
    rig.setPowered(true);
    expect(rig.lights[0].isEnabled()).toBe(false);
    budget.update(rig.getLocalLightSources(), frame);
    expect(setter).not.toHaveBeenCalled();
    expect(rig.getLocalLightSources()[0].apply).toBe(sink);
    budget.reset();
    expect(rig.lights[0].isEnabled()).toBe(true);
    visibility.update(false, [
      { placementId: "equipment-tray", enabled: true },
    ]);
    budget.update(rig.getLocalLightSources(), frame);
    expect(rig.lights[0].isEnabled()).toBe(false);
    visibility.update(true, [
      { placementId: "equipment-tray", enabled: false },
    ]);
    budget.update(rig.getLocalLightSources(), frame);
    expect(rig.lights[0].isEnabled()).toBe(false);
    budget.reset();
    expect(rig.lights[0].isEnabled()).toBe(false);
    budget.dispose();
    rig.dispose();
    scene.dispose();
    engine.dispose();
  });
  test("equipment descriptors follow parent motion, honor hidden receivers and explicit debug eligibility", () => {
    const engine = new NullEngine(),
      scene = new Scene(engine),
      root = new TransformNode("ship", scene),
      parent = new TransformNode("fixture", scene);
    parent.parent = root;
    parent.position.set(1, 2, 3);
    const mesh = CreateBox("receiver", {}, scene);
    mesh.parent = parent;
    const rig = createEquipmentLighting(scene, parent, [
      {
        position: [0.4, 0.1, 1.5],
        direction: [0, 0, -1],
        color: [1, 1, 1],
        intensity: 1,
        range: 2,
        angle: 1,
      },
    ]);
    rig.setMeshes([mesh]);
    root.position.set(100, 20, -40);
    const source = rig.getLocalLightSources()[0];
    expect(source.position).toMatchObject({ x: 101.4, y: 23.5, z: -37.1 });
    expect(source.eligible).toBe(true);
    mesh.setEnabled(false);
    expect(rig.getLocalLightSources()[0].eligible).toBe(false);
    mesh.setEnabled(true);
    expect(rig.getLocalLightSources(false)[0].eligible).toBe(false);
    expect(rig.getLocalLightSources(true)[0].eligible).toBe(true);
    rig.dispose();
    expect(rig.getLocalLightSources()).toEqual([]);
    scene.dispose();
    engine.dispose();
  });
  test("ship descriptors exclude globals, respect cabin gating and refresh a restored shadow", () => {
    const engine = new NullEngine(),
      scene = new Scene(engine),
      root = new TransformNode("ship", scene);
    root.metadata = { shipId: "ship-uuid" };
    const deck = CreateBox("GEO-deck", {}, scene);
    deck.parent = root;
    const lighting = createShipLighting(scene, root, [deck]),
      budget = createLocalLightBudget();
    let sources = lighting.getLocalLightSources();
    expect(sources).toHaveLength(13);
    expect(sources.every((s) => s.id.startsWith("ship-uuid:local:"))).toBe(
      true,
    );
    expect(sources.some((s) => s.id.includes("exterior-key"))).toBe(false);
    const room = scene.lights.find((l) =>
      l.name.startsWith("room-luminaire-"),
    )!;
    const refresh = vi.spyOn(
      room.getShadowGenerator()!.getShadowMap()!,
      "resetRefreshCounter",
    );
    budget.setLimit(0);
    budget.update(sources, frame);
    const setter = vi.spyOn(room, "setEnabled");
    lighting.update(1, 0, 0);
    expect(setter).not.toHaveBeenCalled();
    sources = lighting.getLocalLightSources();
    budget.update(sources, frame);
    refresh.mockClear();
    budget.reset();
    expect(room.isEnabled() && room.shadowEnabled).toBe(true);
    expect(refresh).toHaveBeenCalledOnce();
    expect(lighting.primaryLight.isEnabled()).toBe(true);
    scene.shadowsEnabled = false;
    budget.update(lighting.getLocalLightSources(), frame);
    expect(room.isEnabled()).toBe(true);
    expect(scene.shadowsEnabled).toBe(false);
    lighting.setCabinVisible(false);
    budget.update(lighting.getLocalLightSources(), frame);
    expect(room.isEnabled()).toBe(false);
    lighting.setCabinVisible(true);
    budget.update(lighting.getLocalLightSources(false), frame);
    expect(room.isEnabled()).toBe(false);
    budget.dispose();
    scene.dispose();
    engine.dispose();
  });
});
const managed = (
  id: string,
  extra: Partial<ManagedLocalLight> = {},
): ManagedLocalLight => ({ ...candidate(id), apply: vi.fn(), ...extra });

describe("local lighting allocation", () => {
  test("default preserves all eligible lights; Off and explicit limits are hard caps", () => {
    const lights = Array.from({ length: 37 }, (_, i) =>
      candidate(String(i), i),
    );
    expect(selectLocalLights(lights, frame, "all").enabledLights).toBe(37);
    expect(selectLocalLights(lights, frame, 0).enabledLights).toBe(0);
    for (const cap of [4, 8, 16, 32] as const)
      expect(selectLocalLights(lights, frame, cap).enabledLights).toBe(cap);
    expect(normalizeLocalLightLimit("4")).toBe("all");
    expect(normalizeLocalLightLimit(NaN, 8)).toBe(8);
  });
  test("ineligible, invalid-coordinate and shadow-ineligible fixtures never get enabled", () => {
    const lights = [
      candidate("hidden", 0, { eligible: false }),
      candidate("bad", NaN),
      candidate("bad-range", 0, { range: Infinity }),
      candidate("no-shadow", 0, {
        requiresShadow: true,
        shadowEligible: false,
      }),
      candidate("okay"),
    ];
    expect([...selectLocalLights(lights, frame, "all").selectedIds]).toEqual([
      "okay",
    ]);
    expect(
      selectLocalLights(lights, { focus: { x: NaN, y: 0, z: 0 } }, "all")
        .enabledLights,
    ).toBe(0);
  });
  test("stable IDs break ties independent of manifest order", () => {
    const lights = ["e", "d", "c", "b", "a"].map((id) => candidate(id));
    expect([...selectLocalLights(lights, frame, 4).selectedIds]).toEqual([
      "a",
      "b",
      "c",
      "d",
    ]);
    expect([
      ...selectLocalLights(lights.reverse(), frame, 4).selectedIds,
    ]).toEqual(["a", "b", "c", "d"]);
  });
  test("hysteresis resists camera jitter but yields to a significantly closer fixture", () => {
    const anchors = [
      candidate("anchor1"),
      candidate("anchor2"),
      candidate("anchor3"),
    ];
    const original = selectLocalLights(
      [...anchors, candidate("a", 2), candidate("b", 2.05)],
      frame,
      4,
    );
    const jitter = selectLocalLights(
      [...anchors, candidate("a", 2.05), candidate("b", 2)],
      frame,
      4,
      original.selectedIds,
    );
    expect(jitter.selectedIds.has("a")).toBe(true);
    const moved = selectLocalLights(
      [...anchors, candidate("a", 4), candidate("b", 1)],
      frame,
      4,
      jitter.selectedIds,
    );
    expect(moved.selectedIds.has("b")).toBe(true);
    expect(moved.selectedIds.has("a")).toBe(false);
  });
  test("priority expresses explicit task relevance and positions share a translation-invariant frame", () => {
    const lights = [
      ...["a", "b", "c", "d"].map((id) => candidate(id)),
      candidate("task", 2, { priority: 4 }),
    ];
    const original = selectLocalLights(lights, frame, 4);
    expect(original.selectedIds.has("task")).toBe(true);
    const shifted = lights.map((c) => ({
      ...c,
      position: { x: c.position.x + 10000, y: 7, z: -80 },
    }));
    expect([
      ...selectLocalLights(shifted, { focus: { x: 10000, y: 7, z: -80 } }, 4)
        .selectedIds,
    ]).toEqual([...original.selectedIds]);
  });
  test("shadow capacity is independent; exhausted shadow budget disables the room light as well", () => {
    const lights = [
      candidate("room1", 0, { requiresShadow: true }),
      candidate("room2", 1, { requiresShadow: true }),
      candidate("accent", 2),
    ];
    const result = selectLocalLights(
      lights,
      { ...frame, maxShadowLights: 1 },
      4,
    );
    expect(result.enabledLights).toBe(2);
    expect(result.enabledShadowLights).toBe(1);
    expect(result.decisions.get("room2")).toEqual({
      enabled: false,
      shadowEnabled: false,
    });
    expect(result.decisions.get("room1")).toEqual({
      enabled: true,
      shadowEnabled: true,
    });
    expect(
      selectLocalLights(lights, { ...frame, maxShadowLights: NaN }, 4)
        .selectedIds,
    ).toEqual(new Set(["accent"]));
  });
});

describe("settings and lifecycle", () => {
  test("the normal no-argument runtime restores browser storage and tolerates a denied getter", () => {
    const descriptor = Object.getOwnPropertyDescriptor(
      globalThis,
      "localStorage",
    );
    const data = new Map<string, string>();
    const storage = {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => {
        data.set(key, value);
      },
    };
    try {
      Object.defineProperty(globalThis, "localStorage", {
        configurable: true,
        value: storage,
      });
      const first = createLocalLightBudget();
      first.setLimit(4);
      first.dispose();
      const reloaded = createLocalLightBudget();
      expect(reloaded.snapshot().limit).toBe(4);
      reloaded.reset();
      expect(createLocalLightBudget().snapshot().limit).toBe("all");
      Object.defineProperty(globalThis, "localStorage", {
        configurable: true,
        get() {
          throw Error("denied");
        },
      });
      const denied = createLocalLightBudget();
      expect(() => denied.setLimit(8)).not.toThrow();
      expect(denied.snapshot().limit).toBe(8);
    } finally {
      if (descriptor)
        Object.defineProperty(globalThis, "localStorage", descriptor);
      else Reflect.deleteProperty(globalThis, "localStorage");
    }
  });
  test("setting persists, restores and resets without changing unrelated graphics storage", () => {
    const data = new Map([["sidereal.graphics.v1", '{"brightness":1}']]);
    const storage = {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => {
        data.set(key, value);
      },
    };
    const budget = createLocalLightBudget(storage);
    budget.setLimit(4);
    expect(createLocalLightBudget(storage).snapshot().limit).toBe(4);
    budget.reset();
    expect(data.get(LOCAL_LIGHT_STORAGE_KEY)).toBe('"all"');
    expect(data.get("sidereal.graphics.v1")).toBe('{"brightness":1}');
    const broken = createLocalLightBudget({
      getItem() {
        throw Error("blocked");
      },
      setItem() {
        throw Error("blocked");
      },
    });
    expect(() => broken.setLimit(8)).not.toThrow();
    expect(broken.snapshot().limit).toBe(8);
    expect(
      createLocalLightBudget({
        getItem: () => "{bad json",
        setItem() {},
      }).snapshot().limit,
    ).toBe("all");
  });
  test("budget changes apply immediately and restoring it never re-enables ineligible equipment", () => {
    const budget = createLocalLightBudget();
    const fixture = managed("on"),
      hidden = managed("hidden", { eligible: false });
    budget.update([fixture, hidden], frame);
    budget.setLimit(0);
    expect(fixture.apply).toHaveBeenLastCalledWith({
      enabled: false,
      shadowEnabled: false,
    });
    budget.reset();
    expect(fixture.apply).toHaveBeenLastCalledWith({
      enabled: true,
      shadowEnabled: false,
    });
    expect(hidden.apply).toHaveBeenLastCalledWith({
      enabled: false,
      shadowEnabled: false,
    });
    // Source eligibility is recomputed, never derived from suppressed output.
    budget.update([{ ...fixture, eligible: false }], frame);
    budget.setLimit(8);
    expect(fixture.apply).toHaveBeenLastCalledWith({
      enabled: false,
      shadowEnabled: false,
    });
  });
  test("removal and disposal suppress old sinks; disposed manager cannot resurrect lights", () => {
    const budget = createLocalLightBudget();
    const first = managed("one"),
      second = managed("two");
    budget.update([first, second], frame);
    budget.update([second], frame);
    expect(first.apply).toHaveBeenLastCalledWith({
      enabled: false,
      shadowEnabled: false,
    });
    budget.dispose();
    expect(second.apply).toHaveBeenLastCalledWith({
      enabled: false,
      shadowEnabled: false,
    });
    const calls = vi.mocked(second.apply).mock.calls.length;
    budget.dispose();
    budget.reset();
    budget.update([second], frame);
    expect(vi.mocked(second.apply).mock.calls).toHaveLength(calls);
    expect(budget.snapshot().enabledLights).toBe(0);
  });
  test("duplicate identity rejects entire frame before any sink mutation", () => {
    const budget = createLocalLightBudget();
    const light = managed("same");
    expect(() => budget.update([light, light], frame)).toThrow(
      "unique stable IDs",
    );
    expect(light.apply).not.toHaveBeenCalled();
  });
  test("real Babylon light sinks obey the cap without affecting sun/fill or attaching a color pass", () => {
    const engine = new NullEngine(),
      scene = new Scene(engine);
    const camera = new FreeCamera("camera", Vector3.Zero(), scene);
    const graphics = createGraphicsSettings(scene);
    const budget = createLocalLightBudget();
    const globals = new PointLight(
      "stand-in-global-not-registered",
      Vector3.Zero(),
      scene,
    );
    const locals = Array.from(
      { length: 6 },
      (_, i) => new PointLight(`fixture-${i}`, Vector3.Zero(), scene),
    );
    const entries = locals.map((light): ManagedLocalLight => ({
      ...candidate(light.name),
      apply({ enabled }) {
        if (!light.isDisposed() && light.isEnabled(false) !== enabled)
          light.setEnabled(enabled);
      },
    }));
    budget.setLimit(4);
    budget.update(entries, frame);
    expect(locals.filter((l) => l.isEnabled())).toHaveLength(4);
    expect(globals.isEnabled()).toBe(true);
    expect(camera._postProcesses.filter(Boolean)).toHaveLength(0);
    budget.setLimit(0);
    expect(locals.some((l) => l.isEnabled())).toBe(false);
    expect(graphics.snapshot()).toEqual({
      brightness: 1,
      contrast: 1,
      gamma: 1,
      saturation: 1,
    });
    budget.dispose();
    graphics.dispose();
    scene.dispose();
    engine.dispose();
  });
  test("Babylon shadow maps remain allocated but become ineligible alongside suppressed room lights", () => {
    const engine = new NullEngine(),
      scene = new Scene(engine);
    const budget = createLocalLightBudget();
    const light = new SpotLight(
      "room",
      Vector3.Zero(),
      Vector3.Down(),
      1,
      1,
      scene,
    );
    const shadow = new ShadowGenerator(64, light);
    const source = managed("room", {
      requiresShadow: true,
      apply({ enabled, shadowEnabled }) {
        light.setEnabled(enabled);
        light.shadowEnabled = shadowEnabled;
      },
    });
    budget.update([source], frame);
    expect(light.isEnabled() && light.shadowEnabled).toBe(true);
    budget.setLimit(0);
    expect(light.isEnabled() && light.shadowEnabled).toBe(false);
    expect(light.getShadowGenerator()).toBe(shadow);
    budget.reset();
    expect(light.isEnabled() && light.shadowEnabled).toBe(true);
    budget.dispose();
    scene.dispose();
    engine.dispose();
  });
});
