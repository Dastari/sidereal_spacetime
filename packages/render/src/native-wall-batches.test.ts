import { expect, it } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Ray } from "@babylonjs/core/Culling/ray";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { createNativeWallBatches } from "./native-wall-batches";

function fixture() {
  const engine = new NullEngine(),
    scene = new Scene(engine),
    parent = new TransformNode("ship", scene);
  const material = new PBRMaterial("native paint", scene);
  material.roughness = 0.42;
  material.metallic = 0.2;
  const source = new Mesh("authored triangle", scene),
    data = new VertexData();
  data.positions = [0, 0, 0, 1, 0, 0, 0, 1, 0];
  data.normals = [0, 0, 1, 0, 0, 1, 0, 0, 1];
  data.indices = [0, 1, 2];
  data.uvs = [0, 0, 1, 0, 0, 1];
  data.tangents = [1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1];
  data.applyToMesh(source);
  source.material = material;
  return {
    engine,
    scene,
    parent,
    material,
    source,
    dispose() {
      scene.dispose();
      engine.dispose();
    },
  };
}
const id = (partId: string, category: "wall" | "roof" = "wall") => ({
  partId,
  assetId: "native-r001",
  category,
});
it("reduces native groups within each identity and preserves shared source/material plus independent picking and disposal", () => {
  const f = fixture(),
    input = [
      { source: f.source, matrix: Matrix.Identity() },
      { source: f.source, matrix: Matrix.Translation(2, 0, 0) },
    ];
  const a = createNativeWallBatches(f.scene, f.parent, id("a"), input),
    b = createNativeWallBatches(f.scene, f.parent, id("b", "roof"), input);
  expect(a.metrics).toMatchObject({
    inputGroups: 2,
    outputGroups: 1,
    triangles: 2,
    materialIdentities: 1,
  });
  expect(a.meshes[0].material).toBe(f.material);
  expect(a.meshes[0].isPickable).toBe(true);
  expect(a.meshes[0].metadata.partId).toBe("a");
  expect(b.meshes[0].metadata.partId).toBe("b");
  a.meshes[0].computeWorldMatrix(true);
  const pick = a.meshes[0].intersects(
    new Ray(new Vector3(0.2, 0.2, 1), new Vector3(0, 0, -1)),
  );
  expect(pick.hit).toBe(true);
  expect(pick.pickedMesh?.metadata.partId).toBe("a");
  expect(b.root.metadata.constructionRoof).toBe(true);
  a.root.setEnabled(false);
  expect(b.root.isEnabled()).toBe(true);
  a.dispose();
  expect(b.meshes[0].isDisposed()).toBe(false);
  expect(f.source.isDisposed()).toBe(false);
  expect(f.scene.materials).toContain(f.material);
  expect(f.source.getTotalIndices()).toBe(3);
  expect(f.material.roughness).toBe(0.42);
  f.dispose();
});
it("keeps blended and explicitly ordered opaque decals separate with their original ordering and transforms", () => {
  const f = fixture(),
    glass = f.source.clone("glass", null, true)!,
    decal = f.source.clone("decal", null, true)!;
  glass.material = new PBRMaterial("glass", f.scene);
  glass.material.alpha = 0.4;
  glass.alphaIndex = 7;
  const a = createNativeWallBatches(f.scene, f.parent, id("wall"), [
    { source: glass, matrix: Matrix.Translation(0, 0, 1) },
    { source: decal, matrix: Matrix.Translation(0, 0, 2), preserveOrder: true },
    { source: glass, matrix: Matrix.Translation(0, 0, 3) },
  ]);
  expect(a.metrics).toMatchObject({ outputGroups: 3, orderedPrimitives: 3 });
  expect(a.meshes.map((m) => m.position.z)).toEqual([1, 2, 3]);
  expect(a.meshes.map((m) => m.material)).toEqual([
    glass.material,
    decal.material,
    glass.material,
  ]);
  expect(a.meshes[0].alphaIndex).toBe(7);
  expect(a.meshes.every((m) => m !== glass && m !== decal)).toBe(true);
  f.dispose();
});
it("preserves tangent handedness, winding, UV and normals for reflected native transforms without changing library buffers", () => {
  const f = fixture(),
    original = f.source.getVerticesData("position")!.slice();
  const a = createNativeWallBatches(f.scene, f.parent, id("mirror"), [
    { source: f.source, matrix: Matrix.Scaling(-2, 0.5, 1) },
  ]);
  const m = a.meshes[0],
    p = m.getVerticesData("position")!,
    i = m.getIndices()!;
  const [v0, v1, v2] = Array.from(i).map((j) => Vector3.FromArray(p, j * 3));
  expect(Vector3.Cross(v1.subtract(v0), v2.subtract(v0)).z).toBeGreaterThan(0);
  expect(m.getVerticesData("tangent")!.slice(0, 4)).toEqual([-1, 0, 0, -1]);
  expect(m.getVerticesData("uv")).toEqual(f.source.getVerticesData("uv"));
  expect(m.getVerticesData("normal")).toEqual(
    f.source.getVerticesData("normal"),
  );
  expect(f.source.getVerticesData("position")).toEqual(original);
  f.dispose();
});
it("rejects malformed transforms before allocating a placement and keeps vertex layouts separate", () => {
  const f = fixture(),
    before = f.scene.transformNodes.length;
  expect(() =>
    createNativeWallBatches(f.scene, f.parent, id("bad"), [
      { source: f.source, matrix: Matrix.Scaling(0, 1, 1) },
    ]),
  ).toThrow("Invalid native wall transform");
  expect(f.scene.transformNodes.length).toBe(before);
  const extra = f.source.clone("without tangent", null, true)!;
  extra.makeGeometryUnique();
  extra.removeVerticesData("tangent");
  const a = createNativeWallBatches(
    f.scene,
    f.parent,
    id("layouts"),
    [f.source, extra].map((source) => ({ source, matrix: Matrix.Identity() })),
  );
  expect(a.metrics.outputGroups).toBe(2);
  expect(f.source.isVerticesDataPresent("tangent")).toBe(true);
  f.dispose();
});
