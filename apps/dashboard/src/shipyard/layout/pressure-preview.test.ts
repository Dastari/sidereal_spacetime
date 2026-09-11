import { expect, it } from "vitest";
import { emptyLayout, stampTile } from "@sidereal/content/ship-layout";
import { compileLayout } from "@sidereal/sim/layout-compiler";
import {
  setHullEnvelope,
  proposeWallOpening,
} from "@sidereal/sim/layout-structure";
import { previewPressureAreas } from "./pressure-preview";

function fixture() {
  const d = emptyLayout("draft", "deck");
  d.tiles = [
    stampTile("left", "deck", "rectangle", [0, 0]),
    stampTile("right", "deck", "rectangle", [64, 0]),
  ];
  return setHullEnvelope(d, {
    id: "hull",
    revision: "r1",
    name: "Test",
    width: 128,
    length: 64,
    height: 256,
    origin: [0, 0, 0],
  });
}
function divided() {
  const d = fixture();
  d.partitions.push({
    id: "wall",
    deckId: "deck",
    a: [64, 0],
    b: [64, 64],
    seal: "design-sealed",
  });
  return d;
}
it("shows unnamed regions and ignores informational room labels when calculating enclosure", () => {
  const d = fixture(),
    before = previewPressureAreas(d);
  expect(before.valid).toBe(true);
  expect(before.areas).toMatchObject([
    {
      tileIds: ["left", "right"],
      areaM2: 8,
      status: "enclosed-design",
      roomIds: [],
    },
  ]);
  d.rooms.push({
    id: "room",
    deckId: "deck",
    name: "Lounge",
    type: "Lounge",
    seed: [32, 32],
    boundaryIds: [],
    access: "crew",
    floorTheme: "standard",
    wallTheme: "standard",
  });
  const after = previewPressureAreas(d);
  expect(after.areas).toMatchObject([
    {
      id: before.areas[0]!.id,
      tileIds: ["left", "right"],
      status: "enclosed-design",
      roomIds: ["room"],
      roomNames: ["Lounge"],
    },
  ]);
  expect(after.assumptions.join(" ")).toContain(
    "does not report actual gas pressure",
  );
});
it("closed door design divides areas while a passage or open divider reconnects them", () => {
  let d = divided();
  expect(previewPressureAreas(d).areas).toHaveLength(2);
  d = proposeWallOpening(d, {
    id: "opening",
    deckId: "deck",
    partitionId: "wall",
    slot: [64, 32],
    width: 32,
    kind: "door",
    clearance: 16,
    sill: 0,
  });
  expect(previewPressureAreas(d).areas).toHaveLength(2);
  d.openings[0]!.kind = "passage";
  expect(previewPressureAreas(d).areas).toHaveLength(1);
  d.openings = [];
  d.partitions[0]!.seal = "open-divider";
  expect(previewPressureAreas(d).areas).toHaveLength(1);
});
it("exterior passages vent their connected region, whereas closed doors are an explicit design assumption", () => {
  let d = divided();
  const w = compileLayout(d).structure!.walls.find(
    (w) => w.a[1] === 0 && w.b[1] === 0,
  )!;
  d = proposeWallOpening(d, {
    id: "exit",
    deckId: "deck",
    partitionId: w.anchorId,
    slot: [32, 0],
    width: 32,
    kind: "passage",
    clearance: 16,
    sill: 0,
  });
  let p = previewPressureAreas(d);
  expect(p.valid).toBe(true);
  expect(p.areas.find((a) => a.tileIds.includes("left"))?.status).toBe(
    "vented-design",
  );
  expect(p.areas.find((a) => a.tileIds.includes("right"))?.status).toBe(
    "enclosed-design",
  );
  d.openings[0]!.kind = "door";
  p = previewPressureAreas(d);
  expect(p.areas.every((a) => a.status === "enclosed-design")).toBe(true);
});
it("missing roof vents every region on its deck; rendered roof visibility is not used", () => {
  const d = divided();
  d.decks[0]!.roof = false;
  const p = previewPressureAreas(d);
  expect(p.areas).toHaveLength(2);
  expect(
    p.areas.every(
      (a) =>
        a.status === "vented-design" &&
        a.reasons.some((r) => r.includes("Roof")),
    ),
  ).toBe(true);
});
it("rejects invalid overlapping drafts rather than reporting sealed areas", () => {
  const d = fixture();
  d.tiles.push({ ...d.tiles[0]!, id: "overlap" });
  const p = previewPressureAreas(d);
  expect(p.valid).toBe(false);
  expect(p.areas).toEqual([]);
  expect(p.diagnostics.length).toBeGreaterThan(0);
});
it("reports sub-tile divisions as incomplete rather than claiming the region is sealed", () => {
  const d = fixture();
  d.partitions.push({
    id: "subgrid",
    deckId: "deck",
    a: [32, 0],
    b: [32, 64],
    seal: "design-sealed",
  });
  const p = previewPressureAreas(d);
  expect(p.valid).toBe(true);
  expect(p.areas.every((a) => a.status === "incomplete")).toBe(true);
  expect(p.limitations.join(" ")).toContain("Sub-tile");
});
it("keeps all decks represented and explicitly discloses missing cross-deck aperture metadata", () => {
  const d = fixture();
  d.decks.push({
    ...d.decks[0]!,
    id: "upper",
    name: "Upper",
    order: 1,
    elevation: 128,
  });
  d.tiles.push({ ...d.tiles[0]!, id: "upper-floor", deckId: "upper" });
  const p = previewPressureAreas(d);
  expect(p.valid).toBe(true);
  expect(p.areas.map((a) => a.deckId)).toEqual(["deck", "upper"]);
  expect(p.limitations.join(" ")).toContain(
    "cross-deck airflow is not evaluated",
  );
});
it("empty design has no invented pressurized area", () => {
  expect(previewPressureAreas(emptyLayout("blank", "deck")).areas).toEqual([]);
});
