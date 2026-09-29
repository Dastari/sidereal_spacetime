/**
 * WebGPU regression: every custom shader and material plugin compiles through Babylon's
 * WebGPU GLSL path (WebGPUShaderProcessorGLSL -> glslang -> twgsl), not just WebGL. A GLSL
 * construct that WebGL accepts but glslang rejects breaks the whole WebGPU scene.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Scene } from "@babylonjs/core/scene";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { BaseTexture } from "@babylonjs/core/Materials/Textures/baseTexture";
import { MultiMaterial } from "@babylonjs/core/Materials/multiMaterial";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { ShaderStore } from "@babylonjs/core/Engines/shaderStore";
import { ShaderLanguage } from "@babylonjs/core/Materials/shaderLanguage";
import { PostProcess } from "@babylonjs/core/PostProcesses/postProcess";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Material } from "@babylonjs/core/Materials/material";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { PartAsset } from "@sidereal/content/assembly";
import {
  createWebGPUShaderHarness,
  describeShaderFailure,
  type ShaderFailure,
  type WebGPUShaderHarness,
} from "./webgpu-shader-harness";
import { material as environmentMaterial } from "./environment/index";
import * as environmentShaders from "./environment/shaders";
import { createObjectOutline } from "./object-outline";
import { createSelectionSilhouette } from "./selection-silhouette";
import { createGraphicsSettings } from "./graphics-settings";
import { createHolographicDisc } from "./holographic-disc";
import { createHullPaintBinding } from "./hull-paint";
import { createTemporalInstanceAttributes } from "./temporal-instance-attributes";
import { createDustField } from "./environment/dust-field";
import { createIceMaterial } from "./environment/ice-material";
import { createNativeIceFinish } from "./environment/native-ice-material";
import { createNativeBasaltMaterial } from "./environment/native-volcanic-material";
import { voxelPlanetMaterial } from "./environment/voxel-material";
import { createStellarCorona } from "./environment/stellar-corona";
import { createDistantStar } from "./environment/distant-star";
import { createPlanetAtmosphere } from "./environment/planet-atmosphere";
import { createLavaSpill } from "./environment/planet-lava-spill";
import { createOceanGlints } from "./environment/planet-sparkles";
import {
  StellarConvection,
  StellarEjectaRadiance,
} from "./environment/stellar-convection";
import type { SurfaceGeometry } from "./environment/planet-terrain";

let harness: WebGPUShaderHarness;
beforeAll(async () => {
  // Fixtures never download textures; readiness must not gate effect creation.
  vi.spyOn(BaseTexture.prototype, "isReady").mockReturnValue(true);
  vi.spyOn(BaseTexture.prototype, "isReadyOrNotBlocking").mockReturnValue(true);
  harness = await createWebGPUShaderHarness();
}, 60_000);
afterAll(() => {
  harness?.dispose();
  vi.restoreAllMocks();
});

const settle = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));
async function compileMaterial(material: Material, mesh: AbstractMesh) {
  await Promise.race([
    material.forceCompilationAsync(mesh).catch(() => {}),
    settle(5000),
  ]);
}
function expectClean(failures: ShaderFailure[], what: string) {
  expect(failures.map(describeShaderFailure), what).toEqual([]);
}
/** Compiles every material in the scene against the meshes that use it (or a probe). */
async function compileScene(scene: Scene) {
  const failures = harness.failures.length;
  const modules = harness.modules.length;
  const glsl = harness.glslStages.count;
  const probe = CreateBox("webgpu-probe", { size: 1 }, scene);
  const users = new Map<Material, AbstractMesh>();
  for (const mesh of scene.meshes) {
    const material = mesh.material;
    if (material instanceof MultiMaterial)
      for (const sub of material.subMaterials)
        if (sub) users.set(sub, mesh);
        else if (material) users.set(material, mesh);
  }
  for (const material of scene.materials)
    if (!(material instanceof MultiMaterial))
      await compileMaterial(material, users.get(material) ?? probe);
  for (const pass of scene.postProcesses.concat(
    scene.getEngine().postProcesses,
  ))
    pass.getEffect();
  await settle(50);
  return {
    failures: harness.failures.slice(failures),
    modules: harness.modules.length - modules,
    glsl: harness.glslStages.count - glsl,
  };
}
function sceneWithCamera() {
  const scene = new Scene(harness.engine);
  new ArcRotateCamera("camera", 0.4, 1, 20, Vector3.Zero(), scene);
  return scene;
}
function surface(): SurfaceGeometry {
  return {
    positions: [0, 0, 0, 1, 0, 0, 0, 1, 0],
    normals: [0, 0, 1, 0, 0, 1, 0, 0, 1],
    colors: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    indices: [0, 1, 2],
    faces: 1,
  };
}

describe("custom shaders compile on the WebGPU GLSL path (glslang + twgsl)", () => {
  it("detects the sampler-parameter failure that broke WebGPU (control)", async () => {
    const scene = sceneWithCamera();
    environmentMaterial(
      scene,
      "sampler-parameter",
      `precision highp float;varying vec2 vUV;uniform sampler2D nebula;
vec4 plate(sampler2D t,vec2 uv){return texture2D(t,uv);}
void main(){gl_FragColor=plate(nebula,vUV);}`,
    );
    const { failures } = await compileScene(scene);
    expect(failures).toHaveLength(1);
    expect(failures[0]!.log).toContain(
      "sampler constructor must appear at point of use",
    );
    scene.dispose();
  });

  it("environment surface shaders (sky, planets, rings, corona, halo)", async () => {
    const scene = sceneWithCamera();
    const fragments = Object.entries(environmentShaders).filter(([name]) =>
      name.endsWith("Fragment"),
    );
    expect(fragments.length).toBeGreaterThanOrEqual(7);
    for (const [name, source] of fragments)
      environmentMaterial(scene, name, source, name !== "skyFragment");
    const { failures, modules } = await compileScene(scene);
    expectClean(failures, "environment shaders");
    expect(modules).toBeGreaterThanOrEqual(fragments.length * 2);
    scene.dispose();
  });

  it("registered sidereal post-process shaders", async () => {
    const scene = sceneWithCamera();
    createObjectOutline(scene);
    createSelectionSilhouette(
      scene,
      [CreateBox("selected", {}, scene)],
      "placement",
    );
    const store = {
      getItem: () => JSON.stringify({ brightness: 1.2 }),
      setItem() {},
    };
    createGraphicsSettings(scene, store);
    const registered = Object.keys(ShaderStore.ShadersStore).filter(
      (key) => key.startsWith("sidereal") && key.endsWith("FragmentShader"),
    );
    expect(registered.length).toBeGreaterThanOrEqual(3);
    // Any future ShaderStore post-process is compiled here too.
    for (const key of registered)
      new PostProcess(
        key,
        key.replace(/FragmentShader$/, ""),
        [],
        [],
        1,
        null,
        1,
        harness.engine,
      );
    const { failures, modules } = await compileScene(scene);
    expectClean(failures, "post processes and masks");
    expect(modules).toBeGreaterThanOrEqual(registered.length * 2);
    scene.dispose();
  });

  it("world shader materials (holographic disc, stars, corona, atmosphere, planets)", async () => {
    const scene = sceneWithCamera();
    createHolographicDisc(scene, { reflections: true, bloom: true });
    createStellarCorona(scene, "star");
    createDistantStar(scene, "distant");
    createPlanetAtmosphere(scene, "planet", 1, Color3.White(), 1);
    createLavaSpill(scene, "lava", surface());
    createOceanGlints(scene, "ocean", surface(), 7);
    voxelPlanetMaterial(scene, "voxel", false);
    voxelPlanetMaterial(scene, "voxel-cloud", true);
    const { failures, modules } = await compileScene(scene);
    expectClean(failures, "world shader materials");
    expect(modules).toBeGreaterThanOrEqual(16);
    scene.dispose();
  });

  it("material plugins on PBR and standard materials", async () => {
    const scene = sceneWithCamera();
    createTemporalInstanceAttributes(scene);
    createDustField(scene, new TransformNode("dust-root", scene));
    // GLSL-only plugins. Star materials come from the glTF loader, i.e. WGSL by default.
    const star = new PBRMaterial("star-surface", scene);
    const tiled = new PBRMaterial("star-tiled", scene);
    const ejecta = new PBRMaterial("star-ejecta", scene);
    expect(star.shaderLanguage).toBe(ShaderLanguage.WGSL);
    new StellarConvection(star);
    new StellarConvection(tiled, true);
    new StellarEjectaRadiance(ejecta);
    const glslHosts = [
      createIceMaterial(scene, "ice"),
      createNativeIceFinish(scene, "native-ice", false),
      createNativeIceFinish(scene, "native-snow", true),
      createNativeBasaltMaterial(scene, "basalt").material,
      star,
      tiled,
      ejecta,
    ];
    for (const host of glslHosts)
      expect(host.shaderLanguage, host.name).toBe(ShaderLanguage.GLSL);
    // Hull paint: every paint role, on both PBR and standard sources.
    const hull = new TransformNode("hull", scene);
    const painter = createHullPaintBinding(
      hull,
      {
        category: "engine",
        label: "Engine",
        id: "engine",
      } as unknown as PartAsset,
      { primary: "#aa3322", secondary: "#223355" },
    );
    expect(painter).toBeDefined();
    for (const name of [
      "hull shell",
      "trim red",
      "armor cassette / enamel",
      "structural-polymer",
      "clean hull paint",
    ])
      for (const kind of ["pbr", "standard"]) {
        const source = CreateSphere(`${kind}-${name}`, { segments: 2 }, scene);
        source.material =
          kind === "pbr"
            ? new PBRMaterial(name, scene)
            : new StandardMaterial(name, scene);
        painter!.clone(source, `${source.name}-painted`);
        source.createInstance(`${source.name}-instance`);
      }
    const { failures, modules, glsl } = await compileScene(scene);
    expectClean(failures, "material plugins");
    expect(modules).toBeGreaterThanOrEqual(30);
    expect(glsl).toBeGreaterThanOrEqual(12);
    scene.dispose();
  }, 120_000);
});
