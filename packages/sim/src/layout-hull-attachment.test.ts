import { expect, test } from "vitest";
import { readFileSync } from "node:fs";
import type { PartCatalog, PartPlacement } from "../../content/src/assembly";
import {
  emptyLayout,
  stampTile,
  type Point,
} from "../../content/src/ship-layout";
import { compileLayout } from "./layout-compiler";
import {
  hullAttachmentProfile,
  snapHullAttachment,
} from "./layout-hull-attachment";

const catalog = JSON.parse(
  readFileSync("assets/runtime/assembly/catalog-shipyard-r005.json", "utf8"),
) as PartCatalog;
const panels = catalog.assets.filter(
  (a) =>
    a.visual?.designId === "shipyard.hull.side-armor" &&
    a.visual.revision === 5,
);
function fixture(width = 128) {
  const doc = emptyLayout("hull-test", "deck");
  doc.tiles = [
    {
      ...stampTile("floor", "deck", "rectangle", [0, 0]),
      vertices: [
        [0, 0],
        [width, 0],
        [width, 128],
        [0, 128],
      ] as Point[],
    },
  ];
  return { doc, compiled: compileLayout(doc) };
}
const placement = (
  assetId: string,
  x: number,
  flipped = false,
): PartPlacement => ({
  id: "panel",
  assetId,
  position: [x, 2, 17],
  rotation: 1.1,
  flipped,
  removedCells: [],
});
test("every red/white/vent variant mates to the same outer structural plane and floor top", () => {
  const { doc, compiled } = fixture();
  expect(panels).toHaveLength(18);
  for (const asset of panels) {
    const east = snapHullAttachment(
      placement(asset.id, 4.4),
      asset,
      doc,
      compiled,
      "deck",
    )!;
    expect(east.part.position).toEqual([4, 2, 0.1875]);
    expect(Math.cos(east.part.rotation)).toBeCloseTo(1);
    const west = snapHullAttachment(
      placement(asset.id, -0.4, true),
      asset,
      doc,
      compiled,
      "deck",
    )!;
    expect(west.part.position).toEqual([0, 2, 0.1875]);
    expect(Math.cos(west.part.rotation)).toBeCloseTo(1);
    expect(west.part.flipped).toBe(true);
    expect(
      snapHullAttachment(east.part, asset, doc, compiled, "deck")!.part,
    ).toEqual(east.part);
  }
});
test("attachment rejects changed native pins, remote panels and spans shorter than the native frame", () => {
  const asset = panels[0],
    { doc, compiled } = fixture();
  expect(
    hullAttachmentProfile({
      ...asset,
      visual: { ...asset.visual!, sha256: "0".repeat(64) },
    }),
  ).toBeUndefined();
  expect(
    snapHullAttachment(placement(asset.id, 20), asset, doc, compiled, "deck"),
  ).toBeNull();
  const small = fixture(32);
  small.compiled.walls = small.compiled.walls.filter((w) => w.a[1] === w.b[1]);
  expect(
    snapHullAttachment(
      placement(asset.id, 0),
      asset,
      small.doc,
      small.compiled,
      "deck",
    ),
  ).toBeNull();
});
