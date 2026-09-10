import { describe, it, expect } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { extractStockAftBoundary } from "./remote-aft-boundary";
describe("pinned aft outer surface", () => {
  it("keeps existing outward triangles and UVs without inward lining, fixture or new cap", () => {
    const engine = new NullEngine(),
      scene = new Scene(engine),
      mesh = CreateBox("GEO-cutaway-aft_1", {}, scene);
    mesh.bakeTransformIntoVertices(
      (() => {
        const matrix = mesh.computeWorldMatrix(true).clone();
        matrix.setTranslationFromFloats(0, 0, 9);
        return matrix;
      })(),
    );
    mesh.material = new PBRMaterial("MAT-light-hull-polymer", scene);
    const before = mesh.getIndices()!.slice(),
      result = extractStockAftBoundary(mesh)!;
    expect(result.getTotalIndices()).toBe(6);
    expect(result.getIndices()!.every((i) => before.includes(i))).toBe(true);
    expect(result.getVerticesData("uv")).toEqual(mesh.getVerticesData("uv"));
    expect(mesh.getIndices()).toEqual(before);
    const normal = result.getVerticesData("normal")!,
      pos = result.getVerticesData("position")!;
    expect(
      result
        .getIndices()!
        .every((i) => normal[i * 3 + 2] === 1 && pos[i * 3 + 2] >= 9),
    ).toBe(true);
    mesh.material.name = "MAT-Warm-fixtures";
    expect(extractStockAftBoundary(mesh)).toBeUndefined();
    mesh.material.name = "MAT-light-hull-polymer";
    mesh.name = "GEO-partitions";
    expect(extractStockAftBoundary(mesh)).toBeUndefined();
    scene.dispose();
    engine.dispose();
  });
});
