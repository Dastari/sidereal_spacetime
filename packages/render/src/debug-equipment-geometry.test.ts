import { describe, it, expect } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { createDebugFeatures } from "./debug-features";
import { createEquipmentGeometryOverride } from "./debug-equipment-geometry";

function fixture() {
  const engine = new NullEngine(),
    scene = new Scene(engine),
    mesh = new Mesh("mixed-native-batch", scene);
  const data = new VertexData();
  data.positions = [
    0, 0, 0, 1, 0, 0, 0, 1, 0, 2, 0, 0, 3, 0, 0, 2, 1, 0, 4, 0, 0, 5, 0, 0, 4,
    1, 0,
  ];
  data.indices = [0, 1, 2, 3, 4, 5, 6, 7, 8];
  data.applyToMesh(mesh);
  mesh.metadata = {
    role: "hull",
    authoredStudy: {
      materialKey: "original-material",
      placementRanges: [
        { object: "floor", role: "floor", indexStart: 0, indexCount: 3 },
        {
          object: "fixed-console",
          role: "room-content",
          indexStart: 3,
          indexCount: 3,
        },
        {
          object: "partition",
          role: "partition",
          indexStart: 6,
          indexCount: 3,
        },
      ],
    },
  };
  const dispose = () => {
    scene.dispose();
    engine.dispose();
  };
  return { engine, scene, mesh, dispose };
}
describe("diagnostic-only authored equipment indices", () => {
  it("leaves default geometry untouched; hides contents in every pass without rebuilding each frame; restores exact channels", () => {
    const { scene, mesh, dispose } = fixture();
    try {
      const override = createEquipmentGeometryOverride(scene),
        indices = mesh.getIndices(),
        positions = mesh.getVerticesData("position"),
        ranges = mesh.metadata.authoredStudy.placementRanges;
      override.apply(true);
      expect(mesh.getIndices()).toBe(indices);
      override.apply(false);
      expect(Array.from(mesh.getIndices()!)).toEqual([0, 1, 2, 6, 7, 8]);
      expect(mesh.subMeshes[0].indexCount).toBe(6); // Shared by main, shadow and capture draws.
      const masked = mesh.getIndices();
      for (let i = 0; i < 10; i++) override.apply(false);
      expect(mesh.getIndices()).toBe(masked);
      expect(mesh.getVerticesData("position")).toBe(positions);
      expect(mesh.metadata.authoredStudy.placementRanges).toBe(ranges);
      override.apply(true);
      expect(Array.from(mesh.getIndices()!)).toEqual(Array.from(indices!));
      expect(mesh.subMeshes[0].indexCount).toBe(9);
      override.dispose();
    } finally {
      dispose();
    }
  });
  it("lets accepted edits read complete geometry and retains their deletion on reset", () => {
    const { scene, mesh, dispose } = fixture();
    try {
      const debug = createDebugFeatures(scene, []);
      debug.toggle("equipment");
      expect(mesh.getTotalIndices()).toBe(6);
      debug.beforeGeometryChange();
      expect(mesh.getTotalIndices()).toBe(9);
      // Accepted deletion degenerates the console's original triangle.
      mesh.setIndices([0, 1, 2, 3, 3, 3, 6, 7, 8]);
      debug.afterFrame();
      expect(Array.from(mesh.getIndices()!)).toEqual([0, 1, 2, 6, 7, 8]);
      debug.reset();
      expect(Array.from(mesh.getIndices()!)).toEqual([
        0, 1, 2, 3, 3, 3, 6, 7, 8,
      ]);
      debug.dispose();
    } finally {
      dispose();
    }
  });
  it("does not overwrite a later owner's index replacement, and restores detached consumers", () => {
    const { scene, mesh, dispose } = fixture();
    try {
      const override = createEquipmentGeometryOverride(scene);
      override.apply(false);
      mesh.setIndices([2, 1, 0, 5, 4, 3, 8, 7, 6]);
      override.apply(false);
      expect(Array.from(mesh.getIndices()!)).toEqual([2, 1, 0, 8, 7, 6]);
      scene.removeMesh(mesh);
      override.apply(false);
      expect(Array.from(mesh.getIndices()!)).toEqual([
        2, 1, 0, 5, 4, 3, 8, 7, 6,
      ]);
      mesh.dispose();
      override.dispose();
    } finally {
      dispose();
    }
  });
  it("fails open on incomplete placement metadata and shared or unclassified geometry", () => {
    const { scene, mesh, dispose } = fixture();
    try {
      const override = createEquipmentGeometryOverride(scene),
        original = mesh.getIndices();
      mesh.metadata.authoredStudy.placementRanges[1].indexStart = 99;
      override.apply(false);
      expect(mesh.getIndices()).toBe(original);
      mesh.metadata.authoredStudy.placementRanges[1].indexStart = 3;
      const copy = mesh.clone("other-owner", null)!;
      override.apply(false);
      expect(mesh.getIndices()).toBe(original);
      expect(copy.getIndices()).toBe(original);
      copy.dispose();
      mesh.metadata = { role: "hull" };
      override.apply(false);
      expect(mesh.getIndices()).toBe(original);
      override.dispose();
    } finally {
      dispose();
    }
  });
});
