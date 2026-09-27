import { expect, test, vi } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { PBRMaterialDefines } from "@babylonjs/core/Materials/PBR/pbrBaseMaterial";
import { PrepareDefinesForLights } from "@babylonjs/core/Materials/materialHelper.functions";
import { createPlanetShadowPreparation } from "./planet-shadow-preparation";
function fixture() {
  const engine = new NullEngine(),
    scene = new Scene(engine),
    primary = new DirectionalLight("primary", Vector3.Down(), scene),
    fill = new HemisphericLight("fill", Vector3.Up(), scene),
    hero = new DirectionalLight("hero", Vector3.Down(), scene);
  hero.setEnabled(false);
  const shadows = new ShadowGenerator(1024, hero);
  shadows.usePercentageCloserFiltering = true;
  shadows.filteringQuality = ShadowGenerator.QUALITY_LOW;
  const mesh = CreateBox("visible", {}, scene),
    material = new PBRMaterial("authored", scene);
  mesh.material = material;
  mesh.metadata = {
    role: "planet",
    bodyId: "body-a",
    trianglePlacementRanges: [
      { firstTriangle: 0, triangleCount: 12, partId: "body-a/crust-4" },
    ],
  };
  mesh.receiveShadows = true;
  return {
    engine,
    scene,
    primary,
    fill,
    hero,
    shadows,
    mesh,
    material,
    cleanup() {
      scene.dispose();
      engine.dispose();
    },
  };
}
test("prepares actual ordered light variants with isolated shadows and exact authored resources", async () => {
  const f = fixture(),
    seen: string[] = [],
    defines: string[] = [];
  const compile = vi
    .spyOn(f.material, "forceCompilationAsync")
    .mockImplementation(async (mesh) => {
      expect(mesh).not.toBe(f.mesh);
      expect(mesh!.metadata).not.toBe(f.mesh.metadata);
      expect(mesh!.metadata.role).toBe("planet");
      expect(mesh!.metadata.planetShadowPreparation).toBe(true);
      expect(mesh!.metadata.preparationSourceMeshId).toBe(f.mesh.uniqueId);
      expect(mesh!.metadata.trianglePlacementRanges).toEqual(
        f.mesh.metadata.trianglePlacementRanges,
      );
      expect(f.mesh.metadata.planetShadowPreparation).toBeUndefined();
      expect(f.mesh.metadata.trianglePlacementRanges[0].partId).toBe(
        "body-a/crust-4",
      );
      expect(mesh!.material).toBe(f.material);
      expect((mesh as any).geometry).toBe(f.mesh.geometry);
      expect(mesh!.isEnabled()).toBe(false);
      expect(mesh!.isVisible).toBe(false);
      expect(f.scene.lights).toEqual([f.primary, f.fill, f.hero]);
      expect(f.mesh.lightSources.map((l) => l.name)).toEqual([
        "primary",
        "fill",
      ]);
      expect(f.hero.isEnabled()).toBe(false);
      expect(f.primary.excludedMeshes).toHaveLength(0);
      expect(f.shadows.getShadowMap()!.renderList).toHaveLength(0);
      seen.push(mesh!.lightSources.map((l) => l.name).join(","));
      const d = new PBRMaterialDefines();
      PrepareDefinesForLights(f.scene, mesh!, d, true, 4);
      defines.push(d.toString());
    });
  const adapter = createPlanetShadowPreparation(f.scene, {
    hero: f.hero,
    shadows: f.shadows,
    yield: async () => {},
  });
  try {
    await adapter.prepare({
      mesh: f.mesh,
      cast: false,
      variants: [
        { lights: [f.primary, f.fill], receiveShadows: true },
        { lights: [f.fill, f.primary], receiveShadows: true },
        { lights: [f.fill, f.hero], receiveShadows: true },
      ],
    });
    expect(seen).toEqual([
      "primary,fill",
      "fill,primary",
      "fill,planet-preparation-key",
    ]);
    expect(defines[0]).not.toBe(defines[1]);
    expect(defines[0]).not.toContain("#define SHADOW1");
    expect(defines[2]).toContain("#define SHADOW1");
    // Compare actual hero receiver define generation using real helper, not GPU compilation.
    f.shadows.getShadowMap()!.renderList = [f.mesh];
    f.mesh.lightSources.splice(0, f.mesh.lightSources.length, f.fill, f.hero);
    const d = new PBRMaterialDefines();
    PrepareDefinesForLights(f.scene, f.mesh, d, true, 4);
    expect(defines[2]).toBe(d.toString());
    expect(f.mesh.material).toBe(f.material);
    expect(f.mesh.geometry).not.toBeNull();
    expect(adapter.stats().proxies).toBe(0);
    expect(f.scene.meshes).toEqual([f.mesh]);
    expect(compile).toHaveBeenCalledTimes(3);
  } finally {
    adapter.dispose();
    f.cleanup();
  }
});
test("cancelled queued preparation releases proxies without compiling or touching visible state", async () => {
  const f = fixture();
  let release!: () => void;
  const compile = vi
    .spyOn(f.material, "forceCompilationAsync")
    .mockResolvedValue();
  const adapter = createPlanetShadowPreparation(f.scene, {
    hero: f.hero,
    shadows: f.shadows,
    yield: () =>
      new Promise<void>((r) => {
        release = r;
      }),
  });
  try {
    const pending = adapter.prepare({
      mesh: f.mesh,
      cast: false,
      variants: [{ lights: [f.primary], receiveShadows: false }],
    });
    adapter.dispose();
    release();
    await expect(pending).rejects.toThrow("cancelled");
    expect(compile).not.toHaveBeenCalled();
    expect(adapter.stats()).toEqual({ disposed: true, pending: 0, proxies: 0 });
    expect(f.scene.meshes).toEqual([f.mesh]);
    expect(f.primary.isEnabled()).toBe(true);
  } finally {
    f.cleanup();
  }
});
test("compilation failure cleans preparation resources and permits a subsequent request", async () => {
  const f = fixture(),
    compile = vi
      .spyOn(f.material, "forceCompilationAsync")
      .mockRejectedValueOnce(new Error("compile failure"))
      .mockResolvedValue();
  const adapter = createPlanetShadowPreparation(f.scene, {
    hero: f.hero,
    shadows: f.shadows,
    yield: async () => {},
  });
  try {
    const request = {
      mesh: f.mesh,
      cast: false,
      variants: [{ lights: [f.primary], receiveShadows: false }],
    };
    await expect(adapter.prepare(request)).rejects.toThrow("compile failure");
    expect(adapter.stats().pending).toBe(0);
    await adapter.prepare(request);
    expect(compile).toHaveBeenCalledTimes(2);
    expect(f.scene.meshes).toEqual([f.mesh]);
  } finally {
    adapter.dispose();
    f.cleanup();
  }
});
test("warms caster after receivers through caller scheduling and rejects overlapping work", async () => {
  const f = fixture();
  let release!: () => void;
  let first = true;
  const order: string[] = [];
  const receiver = vi
    .spyOn(f.material, "forceCompilationAsync")
    .mockImplementation(async () => {
      order.push("receiver");
    });
  const caster = vi
    .spyOn(ShadowGenerator.prototype, "forceCompilationAsync")
    .mockImplementation(async function (this: ShadowGenerator) {
      expect(this).not.toBe(f.shadows);
      expect(this.getShadowMap()!.renderList).toHaveLength(1);
      order.push("caster");
    });
  const adapter = createPlanetShadowPreparation(f.scene, {
    hero: f.hero,
    shadows: f.shadows,
    yield: async () => {
      order.push("yield");
      if (first) {
        first = false;
        await new Promise<void>((r) => {
          release = r;
        });
      }
    },
  });
  try {
    const request = {
      mesh: f.mesh,
      cast: true,
      variants: [{ lights: [f.fill, f.hero], receiveShadows: true }],
    };
    const pending = adapter.prepare(request);
    await expect(adapter.prepare(request)).rejects.toThrow("shared serialized");
    release();
    await pending;
    expect(order).toEqual(["yield", "receiver", "yield", "caster"]);
    expect(receiver).toHaveBeenCalledTimes(1);
    expect(caster).toHaveBeenCalledTimes(1);
    expect(f.scene.meshes).toEqual([f.mesh]);
  } finally {
    adapter.dispose();
    caster.mockRestore();
    f.cleanup();
  }
});

test("allocation and geometry attachment failures release owned resources and reset busy", async () => {
  const f = fixture();
  const adapter = createPlanetShadowPreparation(f.scene, {
    hero: f.hero,
    shadows: f.shadows,
    yield: async () => {},
  });
  const compile = vi
    .spyOn(f.material, "forceCompilationAsync")
    .mockResolvedValue();
  const request = {
    mesh: f.mesh,
    cast: false,
    variants: [{ lights: [f.primary], receiveShadows: false }],
  };
  const meshCount = f.scene.meshes.length,
    textureCount = f.scene.textures.length;
  try {
    const shadowMap = vi
      .spyOn(f.shadows, "getShadowMap")
      .mockImplementationOnce(() => {
        throw new Error("allocation configuration failure");
      });
    await expect(adapter.prepare(request)).rejects.toThrow(
      "allocation configuration failure",
    );
    shadowMap.mockRestore();
    expect(adapter.stats().pending).toBe(0);
    const attach = vi
      .spyOn(f.mesh.geometry!, "applyToMesh")
      .mockImplementationOnce(() => {
        throw new Error("geometry attachment failure");
      });
    await expect(adapter.prepare(request)).rejects.toThrow(
      "geometry attachment failure",
    );
    attach.mockRestore();
    expect(adapter.stats()).toEqual({
      disposed: false,
      pending: 0,
      proxies: 0,
    });
    expect(f.scene.meshes).toHaveLength(meshCount);
    expect(f.scene.textures).toHaveLength(textureCount);
    expect(f.scene.lights).toEqual([f.primary, f.fill, f.hero]);
    expect(f.mesh.material).toBe(f.material);
    await adapter.prepare(request);
    expect(compile).toHaveBeenCalledTimes(1);
  } finally {
    adapter.dispose();
    f.cleanup();
  }
});

test("opaque RTT warms before original for every light variant and caster keeps authored material", async () => {
  const f = fixture(),
    order: string[] = [];
  const compile = vi
    .spyOn(PBRMaterial.prototype, "forceCompilationAsync")
    .mockImplementation(async function (this: PBRMaterial, mesh) {
      expect(mesh!.material).toBe(this);
      expect(f.mesh.material).toBe(f.material);
      expect(f.material.imageProcessingConfiguration.applyByPostProcess).toBe(
        false,
      );
      expect(f.scene.imageProcessingConfiguration.applyByPostProcess).toBe(
        false,
      );
      order.push(this === f.material ? "base" : "opaque");
      if (this !== f.material)
        expect(this.imageProcessingConfiguration.applyByPostProcess).toBe(true);
    });
  const caster = vi
    .spyOn(ShadowGenerator.prototype, "forceCompilationAsync")
    .mockImplementation(async function (this: ShadowGenerator) {
      expect(this.getShadowMap()!.renderList![0].material).toBe(f.material);
      order.push("caster");
    });
  const adapter = createPlanetShadowPreparation(f.scene, {
    hero: f.hero,
    shadows: f.shadows,
    yield: async () => {},
  });
  try {
    await adapter.prepare({
      mesh: f.mesh,
      opaqueRefraction: true,
      cast: true,
      variants: [
        { lights: [f.primary, f.fill], receiveShadows: true },
        { lights: [f.fill, f.primary], receiveShadows: true },
        { lights: [f.fill, f.hero], receiveShadows: true },
      ],
    });
    expect(order).toEqual([
      "opaque",
      "base",
      "opaque",
      "base",
      "opaque",
      "base",
      "caster",
    ]);
    expect(f.scene.materials).toEqual([f.material]);
  } finally {
    adapter.dispose();
    compile.mockRestore();
    caster.mockRestore();
    f.cleanup();
  }
});
