import { expect, it } from "vitest";
import { emptyLayout, stampTile } from "@sidereal/content/ship-layout";
import { floorModelOptions } from "@sidereal/sim/layout-native-floor";
import { compileLayout } from "@sidereal/sim/layout-compiler";
import {
  setHullEnvelope,
  setWallFace,
  setFloorStyle,
} from "@sidereal/sim/layout-structure";
import {
  placeStructuralOpening,
  changeStructuralOpening,
} from "./structural-edits";
import { DEFAULT_STRUCTURAL_TOOLS } from "./structural-tools";
import { push, undo, redo, readCheckpoint, DEFAULT_VIEW } from "./state";

function fixture() {
  let d = emptyLayout("draft", "deck");
  for (let x = 0; x < 3; x++)
    for (let y = 0; y < 3; y++)
      d.tiles.push(
        stampTile(`tile-${x}-${y}`, "deck", "rectangle", [x * 64, y * 64]),
      );
  d = setHullEnvelope(d, {
    id: "custom",
    revision: "r1",
    name: "Test hull",
    width: 192,
    length: 192,
    height: 96,
    origin: [0, 0, 0],
  });
  d.partitions = [
    {
      id: "internal",
      deckId: "deck",
      a: [64, 0],
      b: [64, 192],
      seal: "design-sealed",
    },
  ];
  return d;
}
it("snaps pointer proposals to actual slots, resizes an existing door atomically and retains its identity through undo/recovery", () => {
  const d = fixture(),
    opened = placeStructuralOpening(
      d,
      compileLayout(d),
      "internal",
      [66, 101],
      DEFAULT_STRUCTURAL_TOOLS,
      "door",
    );
  expect(opened.openings[0]).toMatchObject({
    id: "door",
    a: [64, 76],
    b: [64, 116],
    setback: 12,
  });
  const resized = changeStructuralOpening(opened, "door", { width: 64 });
  expect(resized.openings[0]).toMatchObject({
    id: "door",
    a: [64, 64],
    b: [64, 128],
  });
  const history = push(
    push({ past: [], present: d, future: [] }, opened),
    resized,
  );
  const restored = readCheckpoint(
    JSON.stringify({
      schema: "sidereal.layout-recovery.v1",
      sequence: 1,
      writer: "test",
      view: { ...DEFAULT_VIEW, deckId: "deck" },
      history,
    }),
  );
  expect(undo(restored.history).present).toEqual(opened);
  expect(redo(undo(restored.history)).present).toEqual(resized);
  const before = JSON.stringify(resized);
  expect(() =>
    changeStructuralOpening(resized, "door", { width: 256 }),
  ).toThrow();
  expect(JSON.stringify(resized)).toBe(before);
});
it("allows exterior slot doors, rejects corner abutment, and preserves the generated boundary", () => {
  const d = fixture();
  d.partitions = [];
  const result = compileLayout(d),
    wall = result.structure!.walls.find(
      (w) =>
        w.source === "perimeter" &&
        w.a[1] === 0 &&
        w.b[1] === 0 &&
        Math.min(w.a[0], w.b[0]) < 96 &&
        Math.max(w.a[0], w.b[0]) > 96,
    )!;
  const opened = placeStructuralOpening(
    d,
    result,
    wall.anchorId,
    [96, 0],
    { ...DEFAULT_STRUCTURAL_TOOLS, doorWidth: 64 },
    "external",
  );
  expect(
    compileLayout(opened).structure!.openings.find((o) => o.id === "external")
      ?.exterior,
  ).toBe(true);
  expect(
    compileLayout(opened)
      .structure!.walls.filter((w) => w.source === "perimeter")
      .every((w) => !w.deletable),
  ).toBe(true);
  expect(() =>
    placeStructuralOpening(
      d,
      result,
      result.structure!.walls.find(
        (w) =>
          w.source === "perimeter" &&
          w.a[1] === 0 &&
          w.b[1] === 0 &&
          Math.min(w.a[0], w.b[0]) === 0,
      )!.anchorId,
      [1, 0],
      { ...DEFAULT_STRUCTURAL_TOOLS, doorWidth: 64 },
      "bad",
    ),
  ).toThrow();
  expect(d.openings).toEqual([]);
});
it("rejects an undersized hull without loss and applies independent finishes while preserving tile/native identities", () => {
  const d = fixture(),
    before = JSON.stringify(d);
  expect(() =>
    setHullEnvelope(d, { ...d.structure!.hull, width: 64 }),
  ).toThrow();
  expect(JSON.stringify(d)).toBe(before);
  const left = setWallFace(d, "internal", "left", "white-panels"),
    both = setWallFace(left, "internal", "right", "dark-panels");
  expect(both.structure!.wallFaces.internal).toEqual({
    left: "white-panels",
    right: "dark-panels",
  });
  const model = floorModelOptions(both.tiles[0], 0)[0];
  const styled = setFloorStyle(both, "tile-0-0", {
    material: "steel",
    model: { assetId: model.assetId, revision: model.revision },
  });
  expect(styled.tiles).toEqual(d.tiles);
  expect(styled.structure!.tileStyles["tile-0-0"].model?.revision).toBe(
    model.revision,
  );
});
