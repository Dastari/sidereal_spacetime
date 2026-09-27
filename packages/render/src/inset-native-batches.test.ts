import { expect, it } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { placementAtFace } from "./structural-batches";
import {
  createInsetNativeBatches,
  applyInsetBatchedVisibility,
} from "./inset-native-batches";
function fixture(count = 20) {
  const engine = new NullEngine();
  engine.getCaps().instancedArrays = true;
  const scene = new Scene(engine),
    parent = new TransformNode("ship", scene);
  parent.position.set(500, 30, -200);
  const source = new Mesh("native", scene),
    data = new VertexData();
  data.positions = [0, 0, 0, 1, 0, 0, 0, 1, 0];
  data.normals = [0, 0, 1, 0, 0, 1, 0, 0, 1];
  data.indices = [0, 1, 2];
  data.uvs = [0, 0, 1, 0, 0, 1];
  data.tangents = [1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1];
  data.applyToMesh(source);
  source.material = new PBRMaterial("mapped native", scene);
  source.isVisible = false;
  const roots = Array.from({ length: count }, (_, i) => {
    const r = new TransformNode("placement" + i, scene);
    r.parent = parent;
    r.position.x = i * 2;
    return r;
  });
  const meshes = roots.map((r, i) => {
    const m = source.clone("native" + i, r, true)!;
    m.isVisible = true;
    m.isPickable = false;
    m.metadata = {
      partId: "part" + i,
      nativeKey: "exact-profile",
      role: "wall",
    };
    return m;
  });
  return {
    engine,
    scene,
    parent,
    source,
    roots,
    meshes,
    dispose() {
      scene.dispose();
      engine.dispose();
    },
  };
}
it("reduces twenty opaque draws to one without mutating authored channels or materials", () => {
  const f = fixture();
  const kinds = f.source.getVerticesDataKinds().slice(),
    positions = f.source.getVerticesData("position")!.slice(),
    material = f.source.material;
  const view = createInsetNativeBatches(f.scene, f.parent, f.meshes);
  expect(view.metrics).toEqual({
    fallbackMeshes: 20,
    batchMeshes: 1,
    unbatchedMeshes: 0,
  });
  expect(view.meshes[0].getTotalIndices() / 3).toBe(20);
  expect(f.meshes.every((m) => !m.isVisible)).toBe(true);
  expect(view.meshes[0].material).toBe(material);
  expect(f.source.getVerticesDataKinds()).toEqual(kinds);
  expect(f.source.getVerticesData("position")).toEqual(positions);
  expect(view.meshes[0].geometry).not.toBe(f.source.geometry);
  expect(view.meshes[0].getVerticesData("position")![27]).toBe(6);
  expect(placementAtFace(view.meshes[0], 3)).toBe("part3");
  view.dispose();
  expect(f.source.material).toBe(material);
  expect(material!.isFrozen).toBe(false);
  expect(f.source.isDisposed()).toBe(false);
  expect(f.meshes.every((m) => m.isVisible)).toBe(true);
  f.dispose();
});
it("fades one placement independently and compacts picking identities while respecting root and parent visibility", () => {
  const f = fixture(3),
    view = createInsetNativeBatches(f.scene, f.parent, f.meshes),
    batch = view.meshes[0];
  expect(applyInsetBatchedVisibility(f.meshes[1], 0.12)).toBe(true);
  view.update();
  expect(batch.getTotalIndices() / 3).toBe(2);
  expect(
    batch.metadata.trianglePlacements.map(
      (r: { placementId: string }) => r.placementId,
    ),
  ).toEqual(["part0", "part2"]);
  expect(f.meshes[1].isVisible).toBe(true);
  expect(f.meshes[1].visibility).toBe(0.12);
  expect(f.meshes[0].isVisible).toBe(false);
  expect(f.meshes[0].visibility).toBe(1);
  applyInsetBatchedVisibility(f.meshes[1], 1);
  view.update();
  expect(batch.getTotalIndices() / 3).toBe(3);
  expect(f.meshes[1].isVisible).toBe(false);
  f.roots[0].setEnabled(false);
  view.update();
  expect(batch.getTotalIndices() / 3).toBe(2);
  expect(placementAtFace(batch, 0)).toBe("part1");
  f.parent.setEnabled(false);
  view.update();
  expect(batch.isEnabled()).toBe(false);
  expect(batch.metadata.trianglePlacements).toEqual([]);
  f.parent.setEnabled(true);
  view.update();
  expect(batch.isEnabled()).toBe(true);
  expect(batch.getTotalIndices() / 3).toBe(2);
  view.dispose();
  expect(applyInsetBatchedVisibility(f.meshes[1], 0.12)).toBe(false);
  f.dispose();
});
it("does not batch transparent, ordered, reflected or independently materialized primitives", () => {
  const f = fixture(5);
  f.meshes[0].material = new PBRMaterial("glass", f.scene);
  f.meshes[0].material.alpha = 0.5;
  f.meshes[1].metadata.decal = true;
  f.meshes[2].scaling.x = -1;
  f.meshes[3].material = new PBRMaterial("independent", f.scene);
  const view = createInsetNativeBatches(f.scene, f.parent, f.meshes);
  expect(view.meshes).toHaveLength(0);
  expect(f.meshes.every((m) => m.isVisible)).toBe(true);
  view.dispose();
  f.dispose();
});
it("supports engines without instancing while keeping single-source groups unchanged", () => {
  const f = fixture(2);
  f.engine.getCaps().instancedArrays = false;
  const view = createInsetNativeBatches(f.scene, f.parent, f.meshes);
  expect(view.meshes).toHaveLength(1);
  view.dispose();
  f.dispose();
});
it("never renders an uninstanced prototype when every placement starts disabled", () => {
  const f = fixture(2);
  for (const root of f.roots) root.setEnabled(false);
  const view = createInsetNativeBatches(f.scene, f.parent, f.meshes);
  expect(view.meshes).toHaveLength(1);
  expect(view.meshes[0].isEnabled()).toBe(false);
  expect(view.meshes[0].metadata.trianglePlacements).toEqual([]);
  f.roots[0].setEnabled(true);
  view.update();
  expect(view.meshes[0].isEnabled()).toBe(true);
  expect(view.meshes[0].getTotalIndices() / 3).toBe(1);
  view.dispose();
  f.dispose();
});
it("merges different native profile geometry only when real GLB material signatures and runtime policy agree", async () => {
  const { readFileSync } = await import("node:fs");
  const { registerInsetNativeMaterials } =
    await import("./inset-native-materials");
  const f = fixture(4);
  const paths = ["span-42c2fafec189-q4", "span-e2718d14114d-q4"];
  f.meshes.forEach((mesh, i) => {
    mesh.makeGeometryUnique();
    const material = new PBRMaterial(
      "distinct imported material " + i,
      f.scene,
    );
    mesh.material = material;
    Object.assign(material, {
      _internalMetadata: { gltf: { pointers: ["/materials/0"] } },
    });
    const bytes = new Uint8Array(
      readFileSync(
        `assets/runtime/construction/inset250-r000/convex-r004/${paths[i % 2]}.glb`,
      ),
    );
    expect(registerInsetNativeMaterials([material], bytes)).toBe(1);
  });
  (f.meshes[3].material as PBRMaterial).roughness = 0.13;
  const view = createInsetNativeBatches(f.scene, f.parent, f.meshes);
  expect(view.metrics).toEqual({
    fallbackMeshes: 3,
    batchMeshes: 1,
    unbatchedMeshes: 1,
  });
  expect(f.meshes[3].isVisible).toBe(true);
  expect(Array.from(view.meshes[0].getVerticesData("uv")!)).toEqual([
    0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1,
  ]);
  expect(view.meshes[0].getVerticesData("tangent")).toHaveLength(36);
  expect(
    view.meshes[0].metadata.trianglePlacements.map(
      (r: { placementId: string }) => r.placementId,
    ),
  ).toEqual(["part0", "part1", "part2"]);
  applyInsetBatchedVisibility(f.meshes[1], 0.12);
  view.update();
  expect(placementAtFace(view.meshes[0], 1)).toBe("part2");
  expect(view.meshes[0].getIndices()).toHaveLength(6);
  expect(f.meshes[1].getIndices()).toEqual([0, 1, 2]);
  view.dispose();
  f.dispose();
});
