import { describe, it, expect } from "vitest";
import type { Scene } from "@babylonjs/core/scene";
import { createDebugFeatures } from "./debug-features";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene as BabylonScene } from "@babylonjs/core/scene";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import { ShadowGeneratorSceneComponent } from "@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { SmartArrayNoDuplicate } from "@babylonjs/core/Misc/smartArray";
import type { RenderTargetTexture } from "@babylonjs/core/Materials/Textures/renderTargetTexture";
import { createRenderDiagnostics } from "./diagnostics";

function node(initial = true) {
  let enabled = initial;
  return {
    isEnabled: () => enabled,
    setEnabled: (v: boolean) => {
      enabled = v;
    },
    isDisposed: () => false,
  };
}
function fixture() {
  const glow = { isEnabled: true },
    inactive = { isEnabled: false };
  const scene = {
    lightsEnabled: true,
    shadowsEnabled: true,
    effectLayers: [glow, inactive],
  } as unknown as Scene;
  return { scene, glow, inactive };
}
describe("local rendering feature overrides", () => {
  it("stops Babylon shadow submissions with Lighting Off and preserves independent shadow intent", () => {
    const engine = new NullEngine(),
      scene = new BabylonScene(engine);
    const sun = new DirectionalLight("exterior-key", Vector3.Down(), scene);
    const generator = new ShadowGenerator(16, sun),
      map = generator.getShadowMap()!;
    const debug = createDebugFeatures(scene, []),
      diagnostics = createRenderDiagnostics(scene);
    // Exercise the installed scheduler rather than reproducing its predicate.
    const scheduler = new ShadowGeneratorSceneComponent(scene);
    scheduler.register();
    const targets = new SmartArrayNoDuplicate<RenderTargetTexture>(4);
    const expectMaps = (count: number) => {
      targets.reset();
      for (const step of scene._gatherRenderTargetsStage) step.action(targets);
      expect(targets.length).toBe(count);
      if (count) expect(targets.data[0]).toBe(map);
      diagnostics.read(false);
      diagnostics.read(true);
      scene.onAfterRenderObservable.notifyObservers(scene);
      expect(diagnostics.read(true)?.shadowMaps).toBe(count);
      expect(diagnostics.read(true)?.allocatedShadowMaps).toBe(1);
      expect(sun.isEnabled()).toBe(true);
      expect(sun.shadowEnabled).toBe(true);
      expect(generator.getShadowMap()).toBe(map);
    };
    try {
      expectMaps(1);
      debug.toggle("lighting");
      expectMaps(0);
      expect(debug.snapshot().shadows).toBe(true);
      debug.afterFrame();
      expectMaps(0);
      debug.toggle("shadows");
      debug.toggle("lighting");
      expectMaps(0);
      expect(scene.lightsEnabled).toBe(true);
      expect(debug.snapshot().shadows).toBe(false);
      debug.toggle("shadows");
      expectMaps(1);
      debug.toggle("lighting");
      debug.toggle("shadows");
      debug.toggle("shadows");
      expectMaps(0);
      debug.toggle("lighting");
      expectMaps(1);
      debug.toggle("lighting");
      debug.reset();
      expectMaps(1);
      debug.toggle("lighting");
      debug.dispose();
      expectMaps(1);
    } finally {
      diagnostics.dispose();
      targets.dispose();
      scene.dispose();
      engine.dispose();
    }
  });
  it.each([
    [false, true],
    [true, false],
    [false, false],
  ])(
    "retains initial lights=%s shadows=%s through reset and disposal",
    (lighting, shadows) => {
      const { scene } = fixture();
      scene.lightsEnabled = lighting;
      scene.shadowsEnabled = shadows;
      const debug = createDebugFeatures(scene, []);
      debug.toggle("lighting");
      debug.toggle("shadows");
      debug.reset();
      expect(scene.lightsEnabled).toBe(lighting);
      expect(scene.shadowsEnabled).toBe(lighting && shadows);
      expect(debug.snapshot().lighting).toBe(true);
      expect(debug.snapshot().shadows).toBe(true);
      debug.dispose();
      expect(scene.lightsEnabled).toBe(lighting);
      expect(scene.shadowsEnabled).toBe(shadows);
    },
  );
  it("restores current cabin/power results instead of enabling every fixture on reset", () => {
    const { scene } = fixture(),
      equipment = node(),
      light = node(false),
      debug = createDebugFeatures(scene, [equipment, light]);
    debug.toggle("equipment");
    expect(equipment.isEnabled()).toBe(false);
    debug.beforeFrame();
    expect(equipment.isEnabled()).toBe(true);
    expect(light.isEnabled()).toBe(false);
    // Normal flight culling/power presentation runs between the two hooks.
    equipment.setEnabled(false);
    debug.afterFrame();
    debug.reset();
    expect(equipment.isEnabled()).toBe(false);
    expect(light.isEnabled()).toBe(false);
    debug.beforeFrame();
    equipment.setEnabled(true);
    debug.afterFrame();
    expect(equipment.isEnabled()).toBe(true);
  });
  it("keeps overrides independent and restores originally disabled glow layers", () => {
    const { scene, glow, inactive } = fixture(),
      debug = createDebugFeatures(scene, []);
    debug.toggle("glow");
    debug.toggle("lighting");
    debug.toggle("shadows");
    expect(glow.isEnabled).toBe(false);
    expect(scene.lightsEnabled).toBe(false);
    expect(scene.shadowsEnabled).toBe(false);
    debug.toggle("lighting");
    expect(scene.lightsEnabled).toBe(true);
    expect(glow.isEnabled).toBe(false);
    debug.reset();
    expect(glow.isEnabled).toBe(true);
    expect(inactive.isEnabled).toBe(false);
    expect(scene.shadowsEnabled).toBe(true);
  });
  it("does not mutate the returned feature snapshot", () => {
    const { scene } = fixture(),
      debug = createDebugFeatures(scene, []),
      snapshot = debug.snapshot();
    snapshot.lighting = false;
    expect(debug.snapshot().lighting).toBe(true);
  });
  it("keeps hidden nodes disabled across unchanged frames without enable/disable churn", () => {
    const { scene } = fixture(),
      equipment = node();
    let writes = 0;
    const set = equipment.setEnabled;
    equipment.setEnabled = (v: boolean) => {
      writes++;
      set(v);
    };
    const debug = createDebugFeatures(scene, [equipment]);
    debug.beforeFrame("deck");
    debug.toggle("equipment");
    const baseline = writes;
    for (let i = 0; i < 10; i++) {
      debug.beforeFrame("deck");
      debug.afterFrame();
    }
    expect(writes).toBe(baseline);
    expect(equipment.isEnabled()).toBe(false);
    debug.beforeFrame("flight");
    equipment.setEnabled(false);
    debug.afterFrame();
    debug.reset();
    expect(equipment.isEnabled()).toBe(false);
  });
});
