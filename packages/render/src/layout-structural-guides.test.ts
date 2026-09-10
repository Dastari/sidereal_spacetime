import { describe, expect, it } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { emptyLayout, stampTile } from "@sidereal/content/ship-layout";
import { compileLayout } from "@sidereal/sim/layout-compiler";
import {
  createLayoutStructuralGuides,
  layoutStructuralLines,
  type LayoutStructuralGuide,
} from "./layout-structural-guides";
function fixture() {
  const doc = emptyLayout("drawn-draft", "lower");
  doc.tiles = [
    stampTile("left", "lower", "rectangle", [0, 0]),
    stampTile("right", "lower", "rectangle", [64, 0]),
  ];
  doc.partitions = [
    {
      id: "partition",
      deckId: "lower",
      a: [64, 0],
      b: [64, 64],
      seal: "design-sealed",
    },
  ];
  doc.openings = [
    {
      id: "door",
      deckId: "lower",
      partitionId: "partition",
      a: [64, 16],
      b: [64, 48],
      clearance: 32,
      sill: 0,
      kind: "door",
    },
  ];
  const compiled = compileLayout(doc);
  const guide: LayoutStructuralGuide = {
    walls: compiled.walls,
    deckId: "lower",
    elevationUnits: 128,
    heightUnits: 80,
  };
  return { doc, compiled, guide };
}
describe("compiled structural wall authoring guides", () => {
  it("extrudes actual perimeter/partition spans at deck height without closing the compiled doorway", () => {
    const { doc, compiled, guide } = fixture();
    expect(compiled.valid).toBe(true);
    const before = JSON.stringify(doc);
    const lines = layoutStructuralLines(guide);
    expect(lines).toHaveLength(compiled.walls.length);
    const partition = lines.filter((w) => w.source === "partition");
    expect(partition).toHaveLength(2);
    expect(
      partition
        .map((w) =>
          w.points
            .slice(0, 2)
            .map((p) => p[2])
            .sort((a, b) => a - b),
        )
        .sort((a, b) => a[0] - b[0]),
    ).toEqual([
      [-2, -1.5],
      [-0.5, -0],
    ]);
    for (const wall of lines) {
      expect(wall.points.map((p) => p[1])).toEqual([4, 4, 6.5, 6.5, 4]);
      expect(wall.points[0]).toEqual(wall.points[4]);
    }
    expect(JSON.stringify(doc)).toBe(before);
  });
  it("respects active decks, diagonal edges and camera-relative coordinate mapping", () => {
    const guide: LayoutStructuralGuide = {
      deckId: "upper",
      elevationUnits: 160,
      heightUnits: 64,
      walls: [
        {
          key: "upper-diagonal",
          deckId: "upper",
          a: [32, 64],
          b: [96, 128],
          source: "perimeter",
          anchorId: "tile",
        },
        {
          key: "lower-only",
          deckId: "lower",
          a: [0, 0],
          b: [64, 0],
          source: "partition",
          anchorId: "p",
        },
      ],
    };
    expect(layoutStructuralLines(guide, [10, 2, -20])).toEqual([
      {
        key: "upper-diagonal",
        source: "perimeter",
        points: [
          [-9, 3, 18],
          [-7, 3, 16],
          [-7, 5, 16],
          [-9, 5, 18],
          [-9, 3, 18],
        ],
      },
    ]);
    expect(layoutStructuralLines({ ...guide, deckId: "missing" })).toEqual([]);
    expect(layoutStructuralLines({ ...guide, heightUnits: 0 })).toEqual([]);
  });
  it("reuses unchanged and same-size edited geometry, hides without selection, and removes deleted floor boundaries", () => {
    const engine = new NullEngine(),
      scene = new Scene(engine);
    const { doc, guide } = fixture();
    const view = createLayoutStructuralGuides(scene);
    view.update(guide, true);
    const mesh = view.mesh!;
    expect(mesh.isPickable).toBe(false);
    expect(mesh.metadata.authoringGuide).toBe(true);
    expect(mesh.metadata.partId).toBeUndefined();
    const original = Array.from(
      mesh.getVerticesData(VertexBuffer.PositionKind)!,
    );
    view.update({ ...guide, walls: [...guide.walls].reverse() }, true);
    expect(view.mesh).toBe(mesh);
    view.update({ ...guide, elevationUnits: 160 }, true);
    expect(view.mesh).toBe(mesh);
    expect(
      Array.from(mesh.getVerticesData(VertexBuffer.PositionKind)!),
    ).not.toEqual(original);
    view.update(guide, false);
    expect(mesh.isEnabled()).toBe(false);
    view.update(guide, true);
    expect(view.mesh).toBe(mesh);
    expect(mesh.isEnabled()).toBe(true);
    doc.tiles = [];
    doc.partitions = [];
    doc.openings = [];
    view.update({ ...guide, walls: compileLayout(doc).walls }, true);
    expect(mesh.isDisposed()).toBe(true);
    expect(view.mesh).toBeUndefined();
    expect(scene.meshes).toHaveLength(0);
    view.update(guide, true);
    view.dispose();
    view.dispose();
    expect(scene.meshes).toHaveLength(0);
    expect(scene.materials).toHaveLength(0);
    scene.dispose();
    engine.dispose();
  });
});
