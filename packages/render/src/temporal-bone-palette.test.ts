import { afterEach, expect, it, vi } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { Skeleton } from "@babylonjs/core/Bones/skeleton";
import { Bone } from "@babylonjs/core/Bones/bone";
import { Matrix } from "@babylonjs/core/Maths/math.vector";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import {
  uniformBonePaletteSupported,
  createTemporalBonePalette,
} from "./temporal-bone-palette";
afterEach(() => vi.restoreAllMocks());
function fixture() {
  const engine = new NullEngine();
  Object.assign(engine.getCaps(), {
    maxVertexUniformVectors: 4096,
    textureFloat: true,
  });
  const scene = new Scene(engine),
    skeleton = new Skeleton("native", "native", scene);
  for (let i = 0; i < 16; i++)
    new Bone("bone" + i, skeleton, null, Matrix.Identity());
  vi.spyOn(skeleton, "isUsingTextureForMatrices", "get").mockImplementation(
    () => skeleton.useTextureToStoreBoneMatrices,
  );
  const mesh = MeshBuilder.CreateBox("native", {}, scene),
    material = new StandardMaterial("native", scene);
  mesh.material = material;
  mesh.skeleton = skeleton;
  mesh.numBoneInfluencers = 4;
  const controller = createTemporalBonePalette(scene);
  return {
    engine,
    scene,
    skeleton,
    mesh,
    material,
    controller,
    dispose() {
      controller.dispose();
      scene.dispose();
      engine.dispose();
    },
  };
}
it("admits small rigs only with a generous bounded uniform reserve", () => {
  expect(uniformBonePaletteSupported(16, 4096)).toBe(true);
  for (const [bones, vectors] of [
    [16, 256],
    [33, 4096],
    [0, 4096],
    [16, NaN],
    [2.5, 4096],
  ])
    expect(uniformBonePaletteSupported(bones, vectors)).toBe(false);
});
it("warms hidden clones without altering visible native storage, then restores exact texture mode and disposes qualification resources", () => {
  const f = fixture(),
    ready = vi.spyOn(f.material, "isReadyForSubMesh").mockReturnValue(false),
    dirty = vi.spyOn(f.material, "markAsDirty");
  expect(f.controller.update(true)).toMatchObject({
    changed: false,
    pending: true,
  });
  expect(f.skeleton.useTextureToStoreBoneMatrices).toBe(true);
  expect(f.mesh.isVisible).toBe(true);
  expect(
    f.scene.meshes
      .filter((m) => m !== f.mesh)
      .every((m) => !m.isVisible && !m.isEnabled()),
  ).toBe(true);
  ready.mockReturnValue(true);
  expect(f.controller.update(true)).toMatchObject({
    changed: true,
    pending: false,
    qualified: 1,
  });
  expect(f.skeleton.useTextureToStoreBoneMatrices).toBe(false);
  expect(dirty).toHaveBeenCalled();
  expect(f.scene.meshes).toEqual([f.mesh]);
  expect(f.scene.skeletons).toEqual([f.skeleton]);
  expect(f.controller.update(false).changed).toBe(true);
  expect(f.skeleton.useTextureToStoreBoneMatrices).toBe(true);
  f.dispose();
});
it("cancels pending work and retains unsupported rigs in their original storage mode", () => {
  const f = fixture();
  vi.spyOn(f.material, "isReadyForSubMesh").mockReturnValue(false);
  f.controller.update(true);
  f.controller.update(false);
  expect(f.skeleton.useTextureToStoreBoneMatrices).toBe(true);
  expect(f.scene.meshes).toEqual([f.mesh]);
  f.engine.getCaps().maxVertexUniformVectors = 256;
  expect(f.controller.update(true)).toEqual({
    changed: false,
    pending: false,
    qualified: 0,
  });
  expect(f.scene.skeletons).toEqual([f.skeleton]);
  f.dispose();
});
it("does not force an already uniform rig to change its original preference", () => {
  const f = fixture();
  f.skeleton.useTextureToStoreBoneMatrices = false;
  expect(f.controller.update(true).changed).toBe(false);
  f.controller.dispose();
  expect(f.skeleton.useTextureToStoreBoneMatrices).toBe(false);
  f.dispose();
});
it("bounds shader warmup and keeps the native visible rig unchanged when compilation never finishes", () => {
  const f = fixture();
  vi.spyOn(f.material, "isReadyForSubMesh").mockReturnValue(false);
  for (let i = 0; i < 121; i++) f.controller.update(true);
  expect(f.skeleton.useTextureToStoreBoneMatrices).toBe(true);
  expect(f.mesh.isVisible).toBe(true);
  expect(f.scene.meshes).toEqual([f.mesh]);
  expect(f.scene.skeletons).toEqual([f.skeleton]);
  expect(f.controller.update(true).pending).toBe(false);
  f.dispose();
});
it("restores texture mode while a newly visible material variant is qualified", () => {
  const f = fixture();
  vi.spyOn(f.material, "isReadyForSubMesh").mockReturnValue(true);
  expect(f.controller.update(true).qualified).toBe(1);
  const alternate = f.mesh.clone("alternate", null, true),
    material = new StandardMaterial("alternate", f.scene);
  alternate.material = material;
  vi.spyOn(material, "isReadyForSubMesh").mockReturnValue(false);
  expect(f.controller.update(true)).toMatchObject({
    changed: true,
    pending: true,
  });
  expect(f.skeleton.useTextureToStoreBoneMatrices).toBe(true);
  expect(alternate.isVisible).toBe(true);
  f.dispose();
});
