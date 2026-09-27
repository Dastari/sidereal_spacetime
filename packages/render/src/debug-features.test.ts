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
import { readFileSync } from "node:fs";
import { SceneLoader } from "@babylonjs/core/Loading/sceneLoader";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { PBRMaterialDefines } from "@babylonjs/core/Materials/PBR/pbrBaseMaterial";
import { PrepareDefinesForLights } from "@babylonjs/core/Materials/materialHelper.functions";
import { Material } from "@babylonjs/core/Materials/material";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { MultiMaterial } from "@babylonjs/core/Materials/multiMaterial";
import { registerReferencedSceneMaterial } from "./scene-material-registration";
import "@babylonjs/loaders/glTF";

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
  it("invalidates actual container-cloned native wall shader defines when lighting or shadows change", async () => {
    const engine = new NullEngine(),
      scene = new BabylonScene(engine);
    const container = await SceneLoader.LoadAssetContainerAsync(
      "",
      new Uint8Array(readFileSync("assets/runtime/assembly/parts.glb")),
      scene,
      undefined,
      ".glb",
    );
    const source = container.meshes.find(
      (mesh): mesh is Mesh =>
        mesh instanceof Mesh &&
        mesh.getTotalVertices() > 0 &&
        mesh.material?.name === "MAT-structural-polymer",
    )!;
    const wall = source.clone("live-native-wall", null, true)!;
    wall.isVisible = true;
    wall.visibility = 0.35;
    wall.receiveShadows = true;
    const hidden = source.clone("hidden-native-wall", null, true)!;
    hidden.setEnabled(false);
    const material = wall.material as PBRMaterial;
    expect(scene.materials).not.toContain(material);
    const sun = new DirectionalLight("sun", Vector3.Down(), scene);
    const generator = new ShadowGenerator(16, sun);
    generator.usePercentageCloserFiltering = true;
    generator.addShadowCaster(wall);
    const subMesh = wall.subMeshes![0];
    const defines = new PBRMaterialDefines();
    // A loaded native material/submesh with the same context as a rendered
    // Babylon draw wrapper. NullEngine exercises real define invalidation;
    // the integration owner separately checks actual hardware pixels.
    const context = (
      material as unknown as {
        _materialContext: Parameters<typeof subMesh.setEffect>[2];
      }
    )._materialContext;
    subMesh.materialDefines = defines;
    subMesh._drawWrapper.materialContext = context;
    function prepare() {
      PrepareDefinesForLights(
        scene,
        wall,
        defines,
        true,
        material.maxSimultaneousLights,
      );
      defines.markAsProcessed();
      return defines as PBRMaterialDefines & {
        LIGHT0: boolean;
        SHADOW0: boolean;
        SHADOWS: boolean;
      };
    }
    const debug = createDebugFeatures(scene, []);
    try {
      expect(prepare().SHADOWS).toBe(true);
      // Reproduce the original missed invalidation before registration.
      scene.shadowsEnabled = false;
      expect(defines._areLightsDirty).toBe(false);
      expect(prepare().SHADOWS).toBe(true);
      scene.shadowsEnabled = true;
      registerReferencedSceneMaterial(scene, material);
      registerReferencedSceneMaterial(scene, material);
      expect(
        scene.materials.filter((value) => value === material),
      ).toHaveLength(1);
      material.markAsDirty(Material.LightDirtyFlag);
      expect(prepare().SHADOWS).toBe(true);
      debug.toggle("shadows");
      expect(defines._areLightsDirty).toBe(true);
      expect(prepare().SHADOWS).toBe(false);
      debug.toggle("shadows");
      expect(prepare().SHADOWS).toBe(true);
      debug.toggle("lighting");
      expect(defines._areLightsDirty).toBe(true);
      expect(prepare().LIGHT0).toBe(false);
      expect(prepare().SHADOWS).toBe(false);
      debug.reset();
      expect(prepare().LIGHT0).toBe(true);
      expect(prepare().SHADOWS).toBe(true);
      // The same registration also fixes normal graphics flags outside F3.
      scene.shadowsEnabled = false;
      expect(defines._areLightsDirty).toBe(true);
      expect(prepare().SHADOWS).toBe(false);
      expect(wall.material).toBe(source.material);
      expect(wall.isEnabled()).toBe(true);
      expect(wall.isVisible).toBe(true);
      expect(wall.visibility).toBe(0.35);
      expect(hidden.isEnabled()).toBe(false);
      expect(scene.meshes).not.toContain(source);
      debug.dispose();
      wall.dispose();
      hidden.dispose();
      container.dispose();
      expect(scene.materials).not.toContain(material);
    } finally {
      scene.dispose();
      engine.dispose();
    }
  }, 30000);

  it("registers native MultiMaterial children once without adding prototype meshes", () => {
    const engine = new NullEngine(),
      scene = new BabylonScene(engine);
    const first = new PBRMaterial("native-polymer", scene),
      second = new PBRMaterial("native-glass", scene),
      multi = new MultiMaterial("native-multi", scene);
    multi.subMaterials = [first, second, first, null];
    scene.removeMaterial(first);
    scene.removeMaterial(second);
    scene.removeMultiMaterial(multi);
    registerReferencedSceneMaterial(scene, multi);
    registerReferencedSceneMaterial(scene, multi);
    expect(scene.materials).toEqual([first, second]);
    expect(scene.multiMaterials).toEqual([multi]);
    expect(scene.meshes).toHaveLength(0);
    scene.dispose();
    engine.dispose();
  });
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
