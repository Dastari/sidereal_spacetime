import { describe, it, expect } from "vitest";
import {
  emptyLayout,
  stampTile,
  type LayoutDocument,
} from "@sidereal/content/ship-layout";
import type { LayoutStructureV2 } from "@sidereal/content/layout-structure";
import { WAYFARER_STARTER } from "@sidereal/content/wayfarer-starter";
import { resolveBoundaryTreatments } from "./layout-boundary-treatments";
import { compileLayout } from "./layout-compiler";
import { readLayout } from "./layout-validation";
import {
  compileConstruction,
  readConstructionDraft,
} from "./construction-transactions";

function fixture() {
  const doc = emptyLayout("envelope", "main");
  doc.decks[0].ceiling = 102;
  doc.tiles = [stampTile("floor", "main", "rectangle", [0, 0])];
  const structure: LayoutStructureV2 = {
    schema: "sidereal.layout-structure.v2",
    wallConvention: "inset250-v1",
    grid: 16,
    hull: {
      id: "test",
      revision: "1",
      name: "Test",
      width: 64,
      length: 64,
      height: 224,
      origin: [0, 0, 0],
    },
    wallFaces: {},
    tileStyles: {},
    armor: [],
    boundaryTreatments: [],
    navigationReservations: [],
    deckProfiles: [
      {
        deckId: "main",
        floorThickness: 6,
        clearHeight: 96,
        roofThickness: 4,
        serviceVoid: 6,
        pitch: 112,
      },
    ],
  };
  return { ...doc, structure };
}
const errors = (doc: LayoutDocument) =>
  compileLayout(doc)
    .diagnostics.filter((d) => d.severity === "error")
    .map((d) => d.code);
function override(doc: ReturnType<typeof fixture>, id = "bow") {
  const w = compileLayout(doc).walls.find((w) => w.a[1] === 0 && w.b[1] === 0)!;
  return {
    id,
    deckId: "main",
    source: w.source,
    sourceAnchorId: w.anchorId,
    a: [16, 0] as [number, number],
    b: [48, 0] as [number, number],
    treatment: "cockpit-glass" as const,
    heightUnits: 72,
  };
}
describe("explicit structural boundary treatment contract", () => {
  it("requires explicit internal reservation and preserves its physical side when direction reverses", () => {
    const d = fixture();
    d.partitions = [
      {
        id: "divider",
        deckId: "main",
        a: [32, 0],
        b: [32, 64],
        seal: "design-sealed",
      },
    ];
    expect(errors(d)).toContain("partition-reservation-missing");
    d.structure.boundaryTreatments = [
      {
        id: "divider-treatment",
        deckId: "main",
        source: "partition",
        sourceAnchorId: "divider",
        a: [32, 64],
        b: [32, 0],
        treatment: "bulkhead",
        reservationSide: "left",
      },
    ];
    expect(errors(d)).toEqual([]);
    const wall = compileLayout(d).walls.find((w) => w.source === "partition")!;
    expect(wall.treatment?.reservationSide).toBe(
      wall.a[1] < wall.b[1] ? "right" : "left",
    );
    const source = JSON.stringify(d);
    expect(readLayout(JSON.parse(source))).toEqual(d);
    expect(JSON.stringify(d)).toBe(source);
    d.structure.boundaryTreatments[0].reservationSide = "center";
    expect(
      compileLayout(d).walls.find((w) => w.source === "partition")?.treatment
        ?.reservationSide,
    ).toBe("center");
    const bad = structuredClone(d) as unknown as {
      structure: { boundaryTreatments: Record<string, unknown>[] };
    };
    bad.structure.boundaryTreatments[0].reservationSide = ["center"];
    expect(() => readLayout(bad)).toThrow(/reservation side/);
    d.structure.boundaryTreatments = [
      { ...override(d), reservationSide: "center" },
    ];
    expect(() => readLayout(d)).toThrow(/reservation side/);
  });

  it("rejects a navigation reservation coincident with an empty floor hole", () => {
    const d = fixture();
    d.structure.hull.width = 192;
    d.structure.hull.length = 192;
    d.tiles = [];
    for (let x = 0; x < 3; x++)
      for (let y = 0; y < 3; y++)
        if (x !== 1 || y !== 1)
          d.tiles.push(
            stampTile(`floor-${x}-${y}`, "main", "rectangle", [x * 64, y * 64]),
          );
    d.decks[0].holes = [{ id: "shaft", seed: [96, 96] }];
    d.structure.navigationReservations = [
      {
        id: "hole-nav",
        deckId: "main",
        vertices: [
          [64, 64],
          [128, 64],
          [128, 128],
          [64, 128],
        ],
        reason: "nonwalkable",
      },
    ];
    expect(errors(d)).toContain("navigation-support");
    d.structure.navigationReservations[0].vertices = [
      [0, 64],
      [64, 64],
      [64, 128],
      [0, 128],
    ];
    expect(errors(d)).toEqual([]);
  });

  it("reports intent placed wholly inside an existing opening and bounds overlapping interval work", () => {
    const d = fixture(),
      o = override(d),
      topology = compileLayout(d);
    d.structure.boundaryTreatments = [o];
    topology.walls = topology.walls.flatMap((w) =>
      w.anchorId === o.sourceAnchorId
        ? [
            { ...w, b: o.a },
            { ...w, a: o.b },
          ]
        : [w],
    );
    resolveBoundaryTreatments(d, topology);
    expect(
      topology.diagnostics.some((i) => i.code === "treatment-orphan"),
    ).toBe(true);
    const many = fixture();
    many.structure.boundaryTreatments = Array.from(
      { length: 1024 },
      (_, i) => ({
        ...override(d),
        id: `override-${i}`,
        a: [i % 32, 0],
        b: [32 + (i % 32), 0],
      }),
    );
    // Matching is bounded even where many authored intervals target one source.
    const compiled = compileLayout(many);
    expect(compiled.valid).toBe(false);
    expect(compiled.walls.length).toBeLessThanOrEqual(8192);
  });
  it("does not coerce array-shaped enum input into admitted strings", () => {
    const d = fixture();
    d.structure.boundaryTreatments = [
      { ...override(d), source: ["perimeter"] } as never,
    ];
    expect(() => readLayout(d)).toThrow("treatment");
    d.structure.boundaryTreatments = [];
    d.structure.navigationReservations = [
      {
        id: "bad",
        deckId: "main",
        vertices: [
          [0, 0],
          [32, 0],
          [0, 32],
        ],
        reason: ["nonwalkable"],
      } as never,
    ];
    expect(() => readLayout(d)).toThrow("navigation");
  });

  it("preserves v1 canonical installations and roundtrips new intent without physical claims", () => {
    expect(compileConstruction(WAYFARER_STARTER.documentJson).sha256).toBe(
      "362f37217f63a44a470676f104c8368bd0973ca03f5e29eab190bc4d6df71340",
    );
    const d = fixture();
    d.structure.boundaryTreatments = [override(d)];
    expect(readLayout(JSON.parse(JSON.stringify(d)))).toEqual(d);
    expect(errors(d)).toEqual([]);
    expect(
      compileLayout(d).walls.filter(
        (w) => w.treatment?.intent === "cockpit-glass",
      ),
    ).toHaveLength(1);
    expect(
      compileLayout(d).walls.every(
        (w) => w.treatment?.qualification === "pending",
      ),
    ).toBe(true);
  });
  it("rejects forged physics flags and inconsistent profiles before compilation", () => {
    const d = fixture();
    d.structure.boundaryTreatments = [
      { ...override(d), sealed: true } as never,
    ];
    expect(() => readLayout(d)).toThrow("treatment");
    d.structure.boundaryTreatments = [];
    d.structure.deckProfiles[0].pitch = 111;
    expect(() => readLayout(d)).toThrow("pitch");
  });
  it("splits an exact partial span, preserves direction, and reports overlap or stale ancestry", () => {
    const d = fixture();
    const o = override(d);
    d.structure.boundaryTreatments = [o];
    const walls = compileLayout(d).walls.filter(
      (w) => w.anchorId === o.sourceAnchorId,
    );
    expect(walls).toHaveLength(3);
    expect(walls.find((w) => w.treatment?.overrideId === o.id)).toMatchObject({
      a: [16, 0],
      b: [48, 0],
    });
    d.structure.boundaryTreatments.push({ ...o, id: "other", a: [32, 0] });
    expect(errors(d)).toContain("treatment-conflict");
    d.structure.boundaryTreatments = [
      { ...o, sourceAnchorId: "removed-source" },
    ];
    expect(errors(d)).toContain("treatment-orphan");
    d.structure.boundaryTreatments = [{ ...o, b: [80, 0] }];
    expect(errors(d)).toContain("treatment-orphan");
  });
  it("keeps cockpit standing restrictions separate from structural floor and roof", () => {
    const d = fixture(),
      before = compileLayout(d);
    d.structure.navigationReservations = [
      {
        id: "low-bow",
        deckId: "main",
        vertices: [
          [0, 0],
          [64, 0],
          [64, 16],
          [0, 16],
        ],
        reason: "insufficient-headroom",
      },
    ];
    d.structure.boundaryTreatments = [override(d)];
    const after = compileLayout(d);
    expect(errors(d)).toEqual([]);
    expect(after.tiles).toEqual(before.tiles);
    expect(after.area).toEqual(before.area);
    expect(after.roof).toEqual(before.roof);
    d.structure.navigationReservations[0].vertices[1] = [80, 0];
    expect(errors(d)).toContain("navigation-support");
    d.structure.navigationReservations[0].vertices = [
      [0, 0],
      [64, 64],
      [64, 0],
      [0, 64],
    ];
    expect(errors(d)).toContain("navigation-polygon");
  });
  it("requires every deck profile, includes roofs and service voids, and admits explicit smaller spaces", () => {
    const d = fixture();
    d.structure.deckProfiles = [];
    expect(errors(d)).toContain("profile-missing");
    const e = fixture();
    e.structure.hull.height = 102;
    expect(errors(e)).toContain("profile-envelope");
    e.structure.hull.height = 224;
    e.decks.push({
      ...e.decks[0],
      id: "vent",
      order: 1,
      elevation: 104,
      ceiling: 38,
    });
    e.structure.deckProfiles.push({
      deckId: "vent",
      floorThickness: 6,
      clearHeight: 32,
      roofThickness: 4,
      serviceVoid: 6,
      pitch: 48,
    });
    e.tiles.push({ ...e.tiles[0], id: "vent-floor", deckId: "vent" });
    expect(errors(e)).toContain("profile-overlap");
    e.decks[1].elevation = 112;
    expect(errors(e)).toEqual([]);
    e.structure.boundaryTreatments = [{ ...override(e), heightUnits: 97 }];
    expect(errors(e)).toContain("treatment-height");
  });
  it("preserves drafts but blocks publication until native treatment adapters are qualified", () => {
    const candidate = JSON.parse(WAYFARER_STARTER.documentJson);
    candidate.layout.structure = fixture().structure;
    const raw = JSON.stringify(candidate);
    expect(
      JSON.parse(readConstructionDraft(raw).canonical).layout.structure,
    ).toEqual(candidate.layout.structure);
    expect(() => compileConstruction(raw)).toThrow(
      "native installation adapters",
    );
  });
});
