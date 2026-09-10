import { expect, test } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { AssetContainer } from "@babylonjs/core/assetContainer";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import "@babylonjs/core/Meshes/instancedMesh";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { MaterialPluginBase } from "@babylonjs/core/Materials/materialPluginBase";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { AnimationGroup } from "@babylonjs/core/Animations/animationGroup";
import { poolAuthoredMaterials } from "./authored-material-pool";

function fixture() {
  const engine = new NullEngine(), scene = new Scene(engine);
  const make = (role = "equipment") => {
    const container = new AssetContainer(scene);
    const material = new PBRMaterial("authored enamel", scene);
    material.metallic = 0.4;
    material.roughness = 0.6;
    material.emissiveColor.set(0.1, 0.2, 0.3);
    const mesh = MeshBuilder.CreateBox("template", {}, scene);
    mesh.metadata = {role};
    mesh.material = material;
    container.meshes.push(mesh);
    container.materials.push(material);
    material._parentContainer = container;
    container.removeAllFromScene();
    return {container, mesh, material};
  };
  return {scene, make, dispose() {scene.dispose(); engine.dispose();}};
}

test("static libraries share exact PBR settings with independent instance identities and explicit material lifetime", () => {
  const f = fixture();
  try {
    const a = f.make(), b = f.make();
    const before = a.material.serialize();
    const pool = poolAuthoredMaterials(f.scene, [a.container, b.container], new Set([a.mesh, b.mesh]));
    expect(pool.removed).toBe(1);
    expect(b.mesh.material).toBe(a.material);
    expect(a.material.serialize()).toEqual(before);
    expect(a.container.materials).toHaveLength(0);
    expect(b.container.materials).toHaveLength(0);
    const instance = b.mesh.createInstance("placed");
    instance.metadata = {role: "equipment", partId: "placement-b"};
    expect(instance.material).toBe(a.material);
    expect(instance.metadata.partId).toBe("placement-b");
    let disposed = 0;
    a.material.onDisposeObservable.add(() => disposed++);
    a.container.dispose();
    expect(disposed).toBe(0);
    expect(instance.material).toBe(a.material);
    expect(f.scene.materials).toContain(a.material);
    instance.dispose();
    b.container.dispose();
    expect(disposed).toBe(0);
    pool.dispose();
    pool.dispose();
    expect(disposed).toBe(1);
    expect(f.scene.materials).not.toContain(a.material);
    expect(f.scene.materials).not.toContain(b.material);
  } finally {f.dispose();}
});

test("different authored settings, mutable/foreign uses, transparency and custom plugins remain separate", () => {
  const f = fixture();
  try {
    const a = f.make(), different = f.make(), mutable = f.make(), foreign = f.make(), glass = f.make(), custom = f.make(), excluded = f.make("remote");
    different.material.roughness = 0.61;
    mutable.mesh.metadata.mutableMaterial = true;
    glass.material.alpha = 0.5;
    new MaterialPluginBase(custom.material, "custom-unserialized-behavior", 200);
    const external = MeshBuilder.CreateBox("another-owner", {}, f.scene);
    external.metadata = {role: "equipment"};
    external.material = foreign.material;
    const all = [a, different, mutable, foreign, glass, custom, excluded];
    const pool = poolAuthoredMaterials(f.scene, all.map(v => v.container), new Set(all.map(v => v.mesh)));
    expect(pool.removed).toBe(0);
    for (const v of all) expect(v.mesh.material).toBe(v.material);
    expect(external.material).toBe(foreign.material);
    pool.dispose();
    for (const v of all) v.container.dispose();
  } finally {f.dispose();}
});

test("shared textures and animation-group-owned materials are not pooled", () => {
  const f = fixture();
  try {
    const a = f.make(), b = f.make(), animated = f.make(), plain = f.make();
    const texture = new Texture(null, f.scene);
    a.material.albedoTexture = texture;
    b.material.albedoTexture = texture;
    animated.container.animationGroups.push(new AnimationGroup("authored material animation", f.scene));
    const all = [a, b, animated, plain];
    const pool = poolAuthoredMaterials(f.scene, all.map(v => v.container), new Set(all.map(v => v.mesh)));
    expect(pool.removed).toBe(0);
    for (const v of all) expect(v.mesh.material).toBe(v.material);
    pool.dispose();
    for (const v of all) v.container.dispose();
    texture.dispose();
  } finally {f.dispose();}
});
