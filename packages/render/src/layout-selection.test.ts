import { describe, expect, it } from "vitest";
import "@babylonjs/core/Meshes/instancedMesh";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { createLayoutSelection } from "./layout-selection";

describe("native editor silhouette lifecycle", () => {
  it("isolates shared-instance masks, tracks transforms and releases all selection resources", () => {
    const engine = new NullEngine(),
      scene = new Scene(engine);
    new ArcRotateCamera("camera", 0, 1, 10, Vector3.Zero(), scene);
    const source = CreateBox("native", {}, scene),
      material = new StandardMaterial("native-surface", scene);
    source.material = material;
    source.isVisible = false;
    const selected = source.createInstance("placed-a"),
      occluder = source.createInstance("placed-b");
    selected.isVisible = occluder.isVisible = true;
    selected.metadata = { partId: "a" };
    occluder.metadata = { partId: "b" };
    selected.position.set(3, 2, -5);
    selected.scaling.x = -1;
    selected.rotation.y = 0.7;
    const baseline = {
      meshes: scene.meshes.length,
      materials: scene.materials.length,
      textures: scene.textures.length,
    };
    const selection = createLayoutSelection(scene);
    selection.update([selected, occluder], "a");
    const mask = scene.customRenderTargets[0];
    const proxies = mask.renderList!;
    expect(proxies).toHaveLength(2);
    expect(proxies[0]).not.toBe(selected);
    expect(proxies[0].getWorldMatrix().asArray()).toEqual(
      selected.getWorldMatrix().asArray(),
    );
    expect(proxies[0].layerMask).toBe(0);
    expect(proxies[0].isPickable).toBe(false);
    expect(selected.material).toBe(material);
    expect(occluder.material).toBe(material);
    expect(selected.showBoundingBox).not.toBe(true);
    selected.position.x = 7;
    scene.onBeforeRenderObservable.notifyObservers(scene);
    expect(proxies[0].getWorldMatrix().asArray()).toEqual(
      selected.getWorldMatrix().asArray(),
    );
    selection.update([selected, occluder], "b");
    expect(scene.customRenderTargets[0]).toBe(mask);
    expect(proxies[0].getWorldMatrix().asArray()).toEqual(
      selected.getWorldMatrix().asArray(),
    );
    occluder.setEnabled(false);
    selection.update([selected, occluder], "b");
    expect(scene.customRenderTargets).toHaveLength(0);
    expect(scene.meshes).toHaveLength(baseline.meshes);
    expect(scene.materials).toHaveLength(baseline.materials);
    expect(scene.textures).toHaveLength(baseline.textures);
    expect(source.geometry?.isDisposed()).toBe(false);
    selection.update([selected], "a");
    selection.dispose();
    selection.dispose();
    expect(scene.customRenderTargets).toHaveLength(0);
    expect(scene.meshes).toHaveLength(baseline.meshes);
    expect(selected.material).toBe(material);
    scene.dispose();
    engine.dispose();
  });
});
