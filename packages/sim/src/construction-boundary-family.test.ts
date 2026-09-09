import { emptyLayout, stampTile } from "@sidereal/content/ship-layout";
import { expect, test } from "vitest";
import {
  matchNativeBoundaryFamily as match,
  planBoundaryFamilyLayout,
  type NativeBoundaryGrammar,
  type FamilySegment,
} from "./construction-boundary-family";
const grammar: NativeBoundaryGrammar = {
  nodeSignatures: [
    {
      partId: "corner",
      rays: [
        [-1, 0],
        [0, -1],
      ],
      cutbackM: 0.0625,
    },
    {
      partId: "straight",
      rays: [
        [-1, 0],
        [1, 0],
      ],
      cutbackM: 0.0625,
    },
    {
      partId: "tee",
      rays: [
        [-1, 0],
        [0, -1],
        [0, 1],
      ],
      cutbackM: 0.0625,
    },
  ],
  spanSignatures: [
    {
      partId: "2m",
      deltaUnits: [64, 0],
      startCutbackM: 0.0625,
      endCutbackM: 0.0625,
    },
    {
      partId: "4m",
      deltaUnits: [128, 0],
      startCutbackM: 0.0625,
      endCutbackM: 0.0625,
    },
  ],
};
const rectangle: FamilySegment[] = [
  { a: [0, 0], b: [128, 0] },
  { a: [128, 0], b: [128, 64] },
  { a: [128, 64], b: [0, 64] },
  { a: [0, 64], b: [0, 0] },
];
test("exact grammar transforms create complete perimeter and T profiles with stable graph identities", () => {
  const p = match(rectangle, grammar);
  expect(p.filter((p) => p.kind === "node")).toHaveLength(4);
  expect(p.filter((p) => p.partId === "4m")).toHaveLength(2);
  expect(
    match(
      [...rectangle].reverse().map((s) => ({ a: s.b, b: s.a })),
      grammar,
    ),
  ).toEqual(p);
  const split = match([...rectangle, { a: [64, 0], b: [64, 64] }], grammar);
  expect(split.filter((p) => p.partId === "tee")).toHaveLength(2);
  expect(split.filter((p) => p.kind === "span")).toHaveLength(7);
});
test("missing handed/end-profile native parts reject instead of stretching or silently substituting", () => {
  expect(() =>
    match(rectangle, {
      ...grammar,
      spanSignatures: grammar.spanSignatures.slice(0, 1),
    }),
  ).toThrow(/unsupported exact span/);
  expect(() =>
    match(rectangle, {
      ...grammar,
      nodeSignatures: [{ ...grammar.nodeSignatures[0], cutbackM: 0.125 }],
    }),
  ).toThrow(/end profiles/);
  expect(() =>
    match(
      [...rectangle, { a: [0, 32], b: [128, 32] }, { a: [64, 0], b: [64, 64] }],
      grammar,
    ),
  ).toThrow(/crossing/);
});
test("unsafe lattice graphs and ambiguous native grammars reject within bounds", () => {
  expect(() => match([{ a: [0, 0], b: [NaN, 0] }], grammar)).toThrow(/lattice/);
  expect(() =>
    match(rectangle, {
      ...grammar,
      nodeSignatures: [...grammar.nodeSignatures, grammar.nodeSignatures[0]],
    }),
  ).toThrow(/duplicate/);
  expect(() =>
    match(
      Array.from({ length: 513 }, () => rectangle[0]),
      grammar,
    ),
  ).toThrow(/budget/);
  expect(match([...rectangle, rectangle[0]], grammar)).toEqual(
    match(rectangle, grammar),
  );
});

test("layout wiring derives structure from actual floors and rejects unsupported openings rather than covering them", () => {
  const d = emptyLayout("family-test", "deck");
  d.tiles.push(
    stampTile("left", "deck", "rectangle", [0, 0]),
    stampTile("right", "deck", "rectangle", [64, 0]),
  );
  const p = planBoundaryFamilyLayout(d, "deck", grammar);
  expect(p.placements.filter((p) => p.kind === "span")).toHaveLength(6);
  expect(p.pressureApproved).toBe(false);
  d.partitions.push({
    id: "partition",
    deckId: "deck",
    a: [64, 0],
    b: [64, 64],
    seal: "design-sealed",
  });
  expect(
    planBoundaryFamilyLayout(d, "deck", grammar).placements.filter(
      (p) => p.partId === "tee",
    ),
  ).toHaveLength(2);
  d.openings.push({
    id: "door",
    deckId: "deck",
    partitionId: "partition",
    a: [64, 12],
    b: [64, 52],
    kind: "door",
    clearance: 16,
    sill: 0,
  });
  expect(() => planBoundaryFamilyLayout(d, "deck", grammar)).toThrow(
    /door\/frame/,
  );
});
