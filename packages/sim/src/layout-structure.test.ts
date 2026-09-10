import { describe, it, expect } from "vitest";
import {
  emptyLayout,
  stampTile,
  transformPoint,
  type LayoutDocument,
  type Point,
} from "@sidereal/content/ship-layout";
import { HULL_SIZE_CATALOG } from "@sidereal/content/hull-size-catalog";
import { compileLayout } from "./layout-compiler";
import {
  setHullEnvelope,
  setWallFace,
  setFloorStyle,
  proposeWallOpening,
} from "./layout-structure";
import { readLayout } from "./layout-validation";
import { WAYFARER_STARTER } from "@sidereal/content/wayfarer-starter";
const canonical = JSON.parse(WAYFARER_STARTER.documentJson);
import { compileConstruction } from "./construction-transactions";
const hull = {
  id: "test",
  revision: "1",
  name: "Test bounds",
  width: 192,
  length: 192,
  height: 224,
  origin: [0, 0, 0] as [number, number, number],
};
function fixture(): LayoutDocument {
  const d = emptyLayout("new-structure", "deck");
  for (let x = 0; x < 3; x++)
    for (let y = 0; y < 3; y++)
      d.tiles.push(
        stampTile(`t${x}${y}`, "deck", "rectangle", [x * 64, y * 64]),
      );
  return setHullEnvelope(d, hull);
}
const errors = (d: LayoutDocument) =>
  compileLayout(d)
    .diagnostics.filter((e) => e.severity === "error")
    .map((e) => e.code);
const partition = (id: string, a: Point, b: Point) => ({
  id,
  deckId: "deck",
  a,
  b,
  seal: "design-sealed" as const,
});
describe("opt-in structural authoring contract", () => {
  it("preserves the exact canonical source and leaves legacy interpretation unchanged", () => {
    expect(compileConstruction(JSON.stringify(canonical)).sha256).toBe(
      "362f37217f63a44a470676f104c8368bd0973ca03f5e29eab190bc4d6df71340",
    );
    expect(compileLayout(canonical.layout).structure).toBeUndefined();
    const selected = setHullEnvelope(readLayout(canonical.layout), {
      ...HULL_SIZE_CATALOG[0],
      origin: [...HULL_SIZE_CATALOG[0].origin],
    });
    expect(errors(selected)).toEqual([]);
  });
  it("rejects X/Y overflow and total deck height atomically across all decks", () => {
    const d = fixture(),
      before = JSON.stringify(d);
    expect(() => setHullEnvelope(d, { ...hull, width: 191 })).toThrow("width");
    expect(() => setHullEnvelope(d, { ...hull, length: 191 })).toThrow(
      "length",
    );
    d.decks.push({ ...d.decks[0], id: "upper", order: 1, elevation: 128 });
    d.tiles.push({ ...d.tiles[0], id: "upper-floor", deckId: "upper" });
    expect(errors(d)).toEqual([]);
    expect(() => setHullEnvelope(d, { ...hull, height: 223 })).toThrow(
      "height",
    );
    d.decks.pop();
    d.tiles.pop();
    expect(JSON.stringify(d)).toBe(before);
    d.decks.push({ ...d.decks[0], id: "overlap", order: 1, elevation: 64 });
    expect(errors(d)).toContain("deck-height-overlap");
  });
  it("regenerates nondeletable boundaries on every deck and tile edits", () => {
    const d = fixture();
    d.decks.push({ ...d.decks[0], id: "upper", order: 1, elevation: 128 });
    d.tiles.push({ ...d.tiles[0], id: "upper-floor", deckId: "upper" });
    const a = compileLayout(d);
    expect(a.structure!.walls.every((w) => !w.deletable)).toBe(true);
    expect(a.structure!.walls.filter((w) => w.deckId === "upper")).toHaveLength(
      4,
    );
    const ids = a.structure!.walls.map((w) => w.id);
    d.tiles = d.tiles.filter((t) => t.id !== "t22");
    expect(compileLayout(d).structure!.walls.map((w) => w.id)).not.toEqual(ids);
  });
  it("derives cross, T and exterior tie-ins from exact lattice nodes with independent finishes", () => {
    let d = fixture();
    d.partitions = [
      partition("horizontal", [0, 64], [192, 64]),
      partition("vertical", [64, 0], [64, 192]),
      partition("tee", [128, 64], [128, 128]),
    ];
    expect(errors(d)).toEqual([]);
    const graph = compileLayout(d).structure!;
    expect(
      graph.junctions.find((j) => j.point[0] === 64 && j.point[1] === 64)?.kind,
    ).toBe("cross");
    expect(
      graph.junctions.find((j) => j.point[0] === 128 && j.point[1] === 64)
        ?.kind,
    ).toBe("tee");
    expect(graph.junctions.some((j) => j.exteriorTieIn)).toBe(true);
    d = setWallFace(d, "horizontal", "left", "blue");
    d = setWallFace(d, "horizontal", "right", "red");
    expect(
      compileLayout(d).structure!.walls.find((w) => w.anchorId === "horizontal")
        ?.faces,
    ).toEqual({ left: "blue", right: "red" });
    expect(() => setWallFace(d, "deleted", "left", "blue")).toThrow("missing");
  });
  it("rejects tile-centre endpoints, duplicate perimeter partitions and off-lattice crossings", () => {
    const d = fixture();
    d.partitions = [partition("bad", [1, 32], [128, 32])];
    expect(errors(d)).toContain("partition-anchor");
    d.partitions = [partition("duplicate", [0, 0], [192, 0])];
    expect(errors(d)).toContain("partition-anchor");
    d.partitions = [
      partition("overlap", [0, 64], [192, 64]),
      partition("again", [64, 64], [128, 64]),
    ];
    expect(errors(d)).toContain("duplicate-partition");
  });
  it("admits variable internal door widths at slots, rejecting junction contact and blocked sweeps without mutation", () => {
    let d = fixture();
    d.partitions = [partition("p", [0, 64], [192, 64])];
    d = proposeWallOpening(d, {
      id: "door",
      deckId: "deck",
      partitionId: "p",
      slot: [96, 64],
      width: 48,
      kind: "door",
      clearance: 16,
      sill: 0,
    });
    expect(errors(d)).toEqual([]);
    expect(d.openings[0].a).toEqual([72, 64]);
    const before = JSON.stringify(d);
    expect(() =>
      proposeWallOpening(d, {
        id: "door",
        deckId: "deck",
        partitionId: "p",
        slot: [32, 64],
        width: 64,
        kind: "door",
        clearance: 16,
        sill: 0,
      }),
    ).toThrow("jamb");
    expect(JSON.stringify(d)).toBe(before);
    d.partitions.push(partition("junction", [96, 64], [96, 128]));
    expect(errors(d)).toContain("opening-setback");
  });
  it("supports external aperture design without claiming external landing or pressure readiness", () => {
    const d = fixture(),
      w = compileLayout(d).structure!.walls.find(
        (w) => w.a[1] === 0 && w.b[1] === 0,
      )!;
    const edited = proposeWallOpening(d, {
      id: "external",
      deckId: "deck",
      partitionId: w.anchorId,
      slot: [32, 0],
      width: 32,
      kind: "airlock",
      clearance: 16,
      sill: 0,
    });
    expect(errors(edited)).toEqual([]);
    const compiled = compileLayout(edited);
    expect(compiled.structure!.openings[0]).toMatchObject({
      exterior: true,
      sealingIntent: true,
    });
    expect(
      compiled.diagnostics.some(
        (d) => d.code === "exterior-landing-unqualified",
      ),
    ).toBe(true);
    expect(
      compiled.walls
        .filter(
          (w) => w.anchorId === w.anchorId && w.a[1] === 0 && w.b[1] === 0,
        )
        .some((w) => w.a[0] === 16 && w.b[0] === 48),
    ).toBe(false);
  });
  it("handles diagonal door slots through all rotations/reflections without fractional integer arithmetic", () => {
    for (let turn = 0; turn < 4; turn++)
      for (const reflected of [false, true]) {
        const transform = (p: Point) => transformPoint(p, turn, reflected);
        let d = emptyLayout("diagonal", "deck");
        d.tiles = [
          {
            ...stampTile("a", "deck", "triangle", [0, 0]),
            vertices: (
              [
                [0, 0],
                [64, 0],
                [64, 64],
              ] as Point[]
            ).map(transform),
          },
          {
            ...stampTile("b", "deck", "triangle", [0, 0]),
            vertices: (
              [
                [0, 0],
                [64, 64],
                [0, 64],
              ] as Point[]
            ).map(transform),
          },
        ];
        d = setHullEnvelope(d, {
          ...hull,
          origin: [-128, -128, 0],
          width: 256,
          length: 256,
        });
        d.partitions = [
          partition("diagonal", transform([0, 0]), transform([64, 64])),
        ];
        d = proposeWallOpening(d, {
          id: "diagonal-door",
          deckId: "deck",
          partitionId: "diagonal",
          slot: transform([32, 32]),
          width: 32,
          kind: "door",
          clearance: 16,
          sill: 0,
        });
        expect(errors(d)).toEqual([]);
        expect(compileLayout(d).structure!.openings[0].width).toBeCloseTo(
          32 * Math.SQRT2,
        );
      }
  });
  it("supports cardinal subgrid wall slots while marking coarse label regions as pending", () => {
    let d = fixture();
    d.partitions = [partition("subgrid", [0, 32], [192, 32])];
    d = proposeWallOpening(d, {
      id: "subdoor",
      deckId: "deck",
      partitionId: "subgrid",
      slot: [96, 32],
      width: 32,
      kind: "door",
      clearance: 16,
      sill: 0,
    });
    expect(errors(d)).toEqual([]);
    expect(
      compileLayout(d).diagnostics.some(
        (d) => d.code === "subgrid-room-regions",
      ),
    ).toBe(true);
  });
  it("keeps generated graph output deterministic across source array order", () => {
    const d = fixture();
    d.partitions = [
      partition("h", [0, 64], [192, 64]),
      partition("v", [64, 0], [64, 192]),
    ];
    const reordered = structuredClone(d);
    reordered.tiles.reverse();
    reordered.partitions.reverse();
    expect(compileLayout(d)).toEqual(compileLayout(reordered));
  });
  it("allows wide exterior doors across straight tile seams while rejecting overlapping adjacent slots", () => {
    const d = fixture(),
      bottom = compileLayout(d).structure!.walls.filter(
        (w) => w.a[1] === 0 && w.b[1] === 0,
      );
    const anchor = bottom.find((w) => Math.min(w.a[0], w.b[0]) === 64)!;
    const next = proposeWallOpening(d, {
      id: "wide",
      deckId: "deck",
      partitionId: anchor.anchorId,
      slot: [96, 0],
      width: 96,
      kind: "door",
      clearance: 16,
      sill: 0,
    });
    expect(errors(next)).toEqual([]);
    const walls = compileLayout(next).walls.filter(
      (w) => w.a[1] === 0 && w.b[1] === 0,
    );
    expect(walls.reduce((sum, w) => sum + Math.abs(w.b[0] - w.a[0]), 0)).toBe(
      96,
    );
    const adjacent = bottom.find((w) => Math.min(w.a[0], w.b[0]) === 128)!;
    expect(() =>
      proposeWallOpening(next, {
        id: "wide-two",
        deckId: "deck",
        partitionId: adjacent.anchorId,
        slot: [160, 0],
        width: 48,
        kind: "door",
        clearance: 16,
        sill: 0,
      }),
    ).toThrow("overlap");
  });
  it("keeps floor styles attached to derived tile identity and refuses stale anchors", () => {
    const d = setFloorStyle(fixture(), "t00", {
      material: "paint-blue",
      model: { assetId: "native-floor", revision: "r2" },
    });
    expect(d.structure!.tileStyles.t00.material).toBe("paint-blue");
    expect(compileLayout(d).tiles.find((t) => t.id === "t00")?.material).toBe(
      "paint-blue",
    );
    expect(d.fittings).toHaveLength(0);
    expect(() => setFloorStyle(d, "missing", { material: "blue" })).toThrow(
      "missing",
    );
    const bad = structuredClone(d) as unknown as Record<string, unknown>;
    bad.structure = { ...d.structure, schema: "future" };
    expect(() => readLayout(bad)).toThrow("revision");
  });
  it("admits only exact supported grid values and rejects serialized generated-wall overrides", () => {
    const d = fixture();
    expect(() =>
      readLayout({ ...d, structure: { ...d.structure, grid: "16" } }),
    ).toThrow("contract");
    expect(() =>
      readLayout({ ...d, structure: { ...d.structure, exteriorWalls: [] } }),
    ).toThrow("contract");
    d.structure!.grid = 64;
    d.partitions = [partition("centre", [32, 32], [128, 32])];
    expect(errors(d)).toContain("partition-anchor");
  });
  it("rejects a door that touches a T node or a fitting sweep although its midpoint is valid", () => {
    const d = fixture();
    d.partitions = [
      partition("p", [0, 64], [192, 64]),
      partition("tee", [64, 64], [64, 128]),
    ];
    expect(() =>
      proposeWallOpening(d, {
        id: "bad",
        deckId: "deck",
        partitionId: "p",
        slot: [96, 64],
        width: 64,
        kind: "door",
        clearance: 16,
        sill: 0,
      }),
    ).toThrow("jamb");
    d.partitions.pop();
    d.fittings.push({
      id: "fixture",
      deckId: "deck",
      definitionId: "test",
      revision: "1",
      position: [80, 48],
      quarterTurns: 0,
      reflected: false,
      footprint: [16, 16],
      clearance: 0,
      kind: "equipment",
      container: null,
    });
    expect(() =>
      proposeWallOpening(d, {
        id: "blocked",
        deckId: "deck",
        partitionId: "p",
        slot: [96, 64],
        width: 32,
        kind: "door",
        clearance: 16,
        sill: 0,
      }),
    ).toThrow("sweep");
  });
  it("rejects armor inside usable floors but admits an exterior reservation as unqualified intent", () => {
    const d = fixture(),
      w = compileLayout(d).structure!.walls.find(
        (w) => w.a[1] === 0 && w.b[1] === 0,
      )!;
    d.structure!.armor = [
      {
        id: "armor",
        deckId: "deck",
        boundaryId: w.anchorId,
        footprint: [
          [0, 0],
          [64, 0],
          [64, -8],
          [0, -8],
        ],
        bottom: 0,
        top: 96,
      },
    ];
    expect(errors(d)).toEqual([]);
    d.structure!.armor[0].footprint = [
      [0, 0],
      [64, 0],
      [64, 8],
      [0, 8],
    ];
    expect(errors(d)).toContain("armor-interior");
  });
});
