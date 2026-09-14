import { expect, it } from "vitest";
import { createDoorway250ReviewLayout } from "@sidereal/content/doorway250-review-layout";
import { compileLayout } from "@sidereal/sim/layout-compiler";
import { partitionDragDelta } from "./partition-drag-snap";
import { movePartitions } from "./partition-endpoints";
import { push, undo, redo } from "./state";

it("aligns a half-grid wall to the selected grid while preserving doors, span and undo", () => {
  const doc = createDoorway250ReviewLayout();
  doc.rooms = [];
  // Wall at 1.5 m with a 1 m selected grid, as in the corridor repro.
  const offset = movePartitions(doc, [doc.partitions[0].id], [0, -16]);
  const wall = offset.partitions[0];
  const delta = partitionDragDelta(wall, [30.2, 47.1], [30.6, 79.4], 32, 16);
  expect(delta).toEqual([0, 48]);
  const moved = movePartitions(offset, [wall.id], delta);
  expect(moved.partitions[0]).toMatchObject({ a: [0, 96], b: [192, 96] });
  expect(moved.openings[0]).toEqual({
    ...offset.openings[0],
    a: [76, 96],
    b: [116, 96],
  });
  expect(compileLayout(moved).valid).toBe(true);
  const history = push({ past: [], present: offset, future: [] }, moved);
  expect(undo(history).present).toEqual(offset);
  expect(redo(undo(history)).present).toEqual(moved);
});
it("retains the grab offset instead of letting either side of the wall choose different grid cells", () => {
  const wall = { a: [48, 0] as [number, number] };
  expect(partitionDragDelta(wall, [46, 12], [56, 12], 32)).toEqual([16, 0]);
  expect(partitionDragDelta(wall, [50, 200], [60, 200], 32)).toEqual([16, 0]);
  expect(partitionDragDelta(wall, [48, 12], [48, 12], 32)).toEqual([0, 0]);
});
it("snaps negative coordinates and respects the structural subdivision", () => {
  const wall = { a: [-48, -80] as [number, number] };
  const delta = partitionDragDelta(wall, [-46, -70], [-70, -44], 32, 16);
  expect(delta).toEqual([-16, 16]);
  expect(wall.a.map((v, i) => v + delta[i])).toEqual([-64, -64]);
  expect(
    partitionDragDelta({ a: [48, 16] }, [50, 20], [60, 20], 1, 16),
  ).toEqual([16, 0]);
});
