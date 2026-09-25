import { expect, it } from "vitest";
import { emptyLayout, stampTile } from "@sidereal/content/ship-layout";
import { compileLayout } from "@sidereal/sim/layout-compiler";
import { planLayoutInsetVisuals } from "./layout-inset-visual-plan";
import { WAYFARER_REBUILD_SOURCE } from "../../sim/src/wayfarer-rebuild-contract";
function fixture(clearHeight = 96) {
  const doc = emptyLayout("preview", "main");
  doc.decks[0].ceiling = 6 + clearHeight;
  doc.decks[0].roof = true;
  doc.tiles = [stampTile("square", "main", "rectangle", [0, 0])];
  doc.tiles[0].vertices = [
    [0, 0],
    [64, 0],
    [64, 64],
    [0, 64],
  ];
  doc.structure = {
    schema: "sidereal.layout-structure.v2",
    wallConvention: "inset250-v1",
    grid: 16,
    hull: {
      id: "test",
      name: "test",
      revision: "1",
      width: 64,
      length: 64,
      height: 112,
      origin: [0, 0, 0],
    },
    tileStyles: {},
    wallFaces: {},
    armor: [],
    navigationReservations: [],
    deckProfiles: [
      {
        deckId: "main",
        floorThickness: 6,
        clearHeight,
        roofThickness: 4,
        serviceVoid: 6,
        pitch: clearHeight + 16,
      },
    ],
    boundaryTreatments: [],
  };
  return doc;
}
const run = (doc: ReturnType<typeof fixture>) =>
  planLayoutInsetVisuals({
    document: doc,
    compiled: compileLayout(doc),
    deckId: "main",
  });
it("places quarter-height walls independently of full-clear roof and avoids duplicate base floors", () => {
  const doc = fixture(),
    base = compileLayout(doc);
  if (doc.structure?.schema !== "sidereal.layout-structure.v2") throw Error();
  doc.structure.boundaryTreatments = base.walls.map((w, i) => ({
    id: "q-" + i,
    deckId: w.deckId,
    source: w.source,
    sourceAnchorId: w.anchorId,
    a: w.a,
    b: w.b,
    treatment: "auto",
    heightUnits: 24,
  }));
  const r = run(doc);
  expect(r.issues).toEqual([]);
  expect(
    r.requests
      .filter((p) => p.key.startsWith("convex-r004/"))
      .every((p) => p.key.endsWith("-q1") && p.originM[2] === 0.1875),
  ).toBe(true);
  expect(
    r.requests.filter((p) => p.key.startsWith("roof-r000/")),
  ).toMatchObject([{ originM: [0, 0, 3.1875] }]);
  expect(
    r.requests.filter((p) => p.key.startsWith("floor-contact-r011/")),
  ).toMatchObject([{ originM: [0, 0, 0] }]);
  expect(
    r.requests.every((p) =>
      /^(convex-r004|internal-r000|union-r001|roof-r000|floor-contact-r011)\//.test(
        p.key,
      ),
    ),
  ).toBe(true);
  expect(new Set(r.requests.map((p) => p.id)).size).toBe(r.requests.length);
  expect(r.requests.every((p) => p.id.length < 100)).toBe(true);
});
it("uses smaller explicit deck clear height for roof datum", () => {
  const r = run(fixture(48));
  expect(r.issues).toEqual([]);
  expect(
    r.requests.find((p) => p.key.startsWith("roof-r000/"))?.originM[2],
  ).toBe(1.6875);
  expect(
    r.requests
      .filter((p) => p.key.startsWith("convex-r004/"))
      .every((p) => p.key.endsWith("-q2")),
  ).toBe(true);
});
it("rejects stale compiler state", () => {
  const doc = fixture(),
    compiled = compileLayout(doc);
  doc.name = "edited";
  const r = planLayoutInsetVisuals({ document: doc, compiled, deckId: "main" });
  expect(r.requests).toEqual([]);
  expect(r.issues.length).toBeGreaterThan(0);
});
it("rejects unsupported wall height, floor selection and holes without fallback", () => {
  const height = fixture(32),
    model = fixture(),
    hole = fixture();
  if (model.structure?.schema !== "sidereal.layout-structure.v2") throw Error();
  model.structure.tileStyles.square = {
    model: { assetId: "unsupported", revision: "r999" },
  };
  if (hole.structure?.schema !== "sidereal.layout-structure.v2") throw Error();
  hole.structure.hull.width = 192;
  hole.structure.hull.length = 192;
  hole.tiles = [];
  for (let x = 0; x < 3; x++)
    for (let y = 0; y < 3; y++)
      if (x !== 1 || y !== 1) {
        const tile = stampTile(
          "tile-" + x + "-" + y,
          "main",
          "rectangle",
          [0, 0],
        );
        tile.vertices = [
          [x * 64, y * 64],
          [x * 64 + 64, y * 64],
          [x * 64 + 64, y * 64 + 64],
          [x * 64, y * 64 + 64],
        ];
        hole.tiles.push(tile);
      }
  hole.decks[0].holes.push({ id: "hole", seed: [96, 96] });
  expect(compileLayout(hole).valid).toBe(true);
  expect(run(hole).issues[0].key).toBe("holes");
  for (const doc of [height, model, hole]) {
    const r = run(doc);
    expect(r.requests).toEqual([]);
    expect(r.issues.length).toBeGreaterThan(0);
  }
});
const runWayfarer = (doc: ReturnType<typeof fixture>) =>
  planLayoutInsetVisuals({
    document: doc,
    compiled: compileLayout(doc),
    deckId: doc.playableDeckId,
  });
it("keeps the exact Wayfarer wall adapters when equipment, hull placement and map labels change", () => {
  const source = structuredClone(WAYFARER_REBUILD_SOURCE.layout),
    before = runWayfarer(source),
    document = structuredClone(source);
  expect(before.issues).toEqual([]);
  expect(before.requests.length).toBeGreaterThan(0);
  document.id = "editable-wayfarer";
  document.assembly!.parts.push({
    ...structuredClone(document.assembly!.parts[0]),
    id: "added-equipment",
    position: [1, 9, 0.1875],
  });
  document.assembly!.parts.find((p) => p.id.includes("hull"))!.position[0] +=
    0.25;
  document.rooms[0].name = "Flight control";
  expect(compileLayout(document).valid).toBe(true);
  expect(runWayfarer(document)).toEqual(before);
  delete document.assembly;
  expect(runWayfarer(document)).toEqual(before);
});
it.each(["decks", "tiles", "partitions", "openings", "structure"] as const)(
  "replans an edited Wayfarer %s instead of reusing its old native walls",
  (field) => {
    const document = structuredClone(WAYFARER_REBUILD_SOURCE.layout),
      before = runWayfarer(document);
    if (field === "decks") document.decks[0].roof = true;
    if (field === "tiles") document.tiles[0].material = "new-floor-finish";
    if (field === "partitions") document.partitions[0].seal = "open-divider";
    if (field === "openings") document.openings[0].clearance += 32;
    if (field === "structure") document.structure!.hull.width += 32;
    expect(compileLayout(document).valid).toBe(true);
    const after = runWayfarer(document);
    expect(after.requests).not.toEqual(before.requests);
    expect(after.issues.some((issue) => issue.key === "assembly")).toBe(false);
    // Both actual interfaces that the general family cannot fit and unsupported
    // models remain explicit failures; assembly presence does not hide the cause.
    expect(after.issues.length).toBeGreaterThan(0);
  },
);
it("plans generic native walls alongside unrelated visual assembly parts", () => {
  const document = fixture(),
    before = run(document);
  document.assembly = {
    schema: "sidereal.layout-assembly.v1",
    source: null,
    revisions: { ...WAYFARER_REBUILD_SOURCE.layout.assembly!.revisions },
    parts: [
      {
        ...structuredClone(WAYFARER_REBUILD_SOURCE.layout.assembly!.parts[0]),
        id: "independent-equipment",
        position: [1, 1, 0.1875],
      },
    ],
  };
  expect(compileLayout(document).valid).toBe(true);
  expect(run(document)).toEqual(before);
  const unsupported = fixture(32);
  unsupported.assembly = document.assembly;
  expect(compileLayout(unsupported).valid).toBe(true);
  const rejected = run(unsupported);
  expect(rejected.issues.length).toBeGreaterThan(0);
  expect(rejected.issues.every((issue) => issue.key !== "assembly")).toBe(true);
});
